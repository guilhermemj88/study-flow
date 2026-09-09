import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { after, afterEach } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { getAiAvailability, readAiConfig } from "../src/lib/ai/config";
import { AiError } from "../src/lib/ai/errors";
import { runAiTask } from "../src/lib/ai/gateway";
import { aiActionRequest, aiStatusRequest } from "../src/lib/ai/http";
import { AI_TASKS, type AiTaskId } from "../src/lib/ai/task-registry";
import { summarizeSource } from "../src/lib/ai/tasks";
import { createUser, createUserSession } from "../src/lib/local/auth-store";
import { getAiIntegrationOverview, setAiMode } from "../src/lib/local/ai-integration-store";
import { getAiPreference, saveAiMode, saveAiPrivacy } from "../src/lib/local/ai-preference-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { LocalSourceStore } from "../src/lib/local/source-store";
import { LocalStudyStore } from "../src/lib/local/study-store";
import { POST as saveIntegration } from "../src/app/api/integrations/ai/route";
import { prepareSourceExcerpts } from "../src/lib/source-processing";

const directory = mkdtempSync(join(tmpdir(), "study-flow-ai-gateway-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = directory;
const originalFetch = globalThis.fetch;
const secret = "server-key-not-for-browser-91e8d7";
let count = 0;
let calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];

function configure() {
  process.env.STUDY_FLOW_AI_ENABLED = "true";
  process.env.STUDY_FLOW_AI_PROVIDER = "openai_compatible";
  process.env.STUDY_FLOW_AI_BASE_URL = "https://provider.example/v1";
  process.env.STUDY_FLOW_AI_MODEL = "test-model";
  process.env.STUDY_FLOW_AI_API_KEY = secret;
  process.env.STUDY_FLOW_AI_TIMEOUT_MS = "1000";
  process.env.STUDY_FLOW_AI_EXTRA_BODY_JSON = "{}";
  calls = [];
}

function user(mode: "study_flow" | "mcp" | "none" = "study_flow") {
  const account = createUser({ displayName: `AI User ${++count}`, email: `ai-${count}@example.test`, password: "senha-segura-ai" });
  saveAiMode(account.id, mode);
  return account;
}

function providerResponse(content: unknown, usage: unknown = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }, finish = "stop") {
  return Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }], ...(usage === undefined ? {} : { usage }) });
}

function mockProvider(response: () => Response | Promise<Response> = () => providerResponse({ ok: true })) {
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return response();
  }) as typeof fetch;
}

function runs(userId: string) {
  return getDatabase().prepare("SELECT * FROM ai_runs WHERE user_id = ? ORDER BY created_at, rowid").all(userId) as Array<Record<string, unknown>>;
}

function request(account?: ReturnType<typeof user>, body?: unknown) {
  const headers = new Headers({ "content-type": "application/json", origin: "http://localhost" });
  if (account) headers.set("cookie", `study_flow_session=${createUserSession(account.id).token}`);
  return new Request("http://localhost/api/ai/test", { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

configure();
afterEach(() => { globalThis.fetch = originalFetch; configure(); });
after(() => {
  globalThis.fetch = originalFetch;
  closeDatabaseForTests();
  assert.ok(!relative(tmpdir(), directory).startsWith(".."));
  rmSync(directory, { recursive: true, force: true });
});

test("configuração ausente, desabilitada ou inválida mantém a aplicação e o status disponíveis", async () => {
  const account = user();
  mockProvider();
  for (const key of ["STUDY_FLOW_AI_API_KEY", "STUDY_FLOW_AI_MODEL", "STUDY_FLOW_AI_BASE_URL", "STUDY_FLOW_AI_PROVIDER"]) {
    const original = process.env[key];
    delete process.env[key];
    assert.equal(getAiAvailability().available, false, key);
    assert.equal((await aiStatusRequest(request(account))).status, 200);
    await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "AI_NOT_CONFIGURED" });
    process.env[key] = original;
  }
  process.env.STUDY_FLOW_AI_ENABLED = "false";
  assert.equal(getAiIntegrationOverview(account).studyFlowAi.available, false);
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "AI_DISABLED" });
  assert.equal(calls.length, 0);
  process.env.STUDY_FLOW_AI_ENABLED = "true";
  for (const url of ["broken", "http://external.example", "https://user:password@external.example", "https://external.example?secret=1"]) {
    process.env.STUDY_FLOW_AI_BASE_URL = url;
    assert.equal(getAiAvailability().available, false);
  }
});

test("modo MCP e Sem IA nunca executam provider; seleção nativa é validada e persistida", async () => {
  mockProvider();
  for (const mode of ["mcp", "none"] as const) {
    const account = user(mode);
    await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "AI_MODE_REQUIRED" });
    assert.equal(runs(account.id)[0].status, "blocked");
  }
  assert.equal(calls.length, 0);
  const account = user("none");
  const response = await saveIntegration(request(account, { action: "set_mode", mode: "study_flow" }));
  assert.equal(response.status, 200);
  closeDatabaseForTests();
  assert.equal(getAiPreference(account.id).mode, "study_flow");
  delete process.env.STUDY_FLOW_AI_API_KEY;
  assert.throws(() => setAiMode(account.id, "study_flow"));
  assert.equal(getAiPreference(account.id).mode, "study_flow", "indisponibilidade não apaga a preferência");
});

test("gateway executa tarefa registrada, registra versão/tokens e não envia identidade ao provider", async () => {
  mockProvider();
  const account = user();
  const run = await runAiTask("HEALTH_CHECK", {}, { userId: account.id });
  assert.deepEqual(run.result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://provider.example/v1/chat/completions");
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${secret}`);
  assert.equal(calls[0].body.max_tokens, 128);
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.ok(!JSON.stringify(calls[0].body).includes(account.id));
  assert.ok(!JSON.stringify(calls[0].body).includes(account.email));
  const audit = runs(account.id)[0];
  assert.equal(audit.task, "health_check");
  assert.equal(audit.task_version, 1);
  assert.equal(audit.provider, "openai_compatible");
  assert.equal(audit.model, "test-model");
  assert.equal(audit.status, "succeeded");
  assert.equal(audit.input_tokens, 12);
  assert.equal(audit.output_tokens, 8);
  assert.equal(audit.total_tokens, 20);
  assert.equal(audit.external_processing_used, 1);
  assert.ok(Number(audit.duration_ms) >= 0);
  assert.ok(!JSON.stringify(audit).includes(secret));
  assert.ok(!("prompt" in audit));
});

test("respostas sem usage não impedem execução", async () => {
  mockProvider(() => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
  const account = user();
  await runAiTask("HEALTH_CHECK", {}, { userId: account.id });
  const run = runs(account.id)[0];
  assert.equal(run.status, "succeeded");
  assert.equal(run.total_tokens, null);
});

test("API/status nunca retornam chave, URL interna ou erros brutos do provider", async () => {
  mockProvider(() => new Response(`Bearer ${secret} at private.internal`, { status: 401 }));
  const account = user();
  for (const response of [await aiStatusRequest(request(account)), await aiActionRequest(request(account, {}), "test")]) {
    const text = await response.text();
    for (const sensitive of [secret, "provider.example", "private.internal", "Bearer", "stack"]) assert.ok(!text.includes(sensitive));
  }
  assert.ok(!JSON.stringify(getAiIntegrationOverview(account)).includes(secret));
  assert.ok(!JSON.stringify(runs(account.id)).includes(secret));
});

test("timeout encerra chamada com erro controlado e auditoria, sem retry", async () => {
  process.env.STUDY_FLOW_AI_TIMEOUT_MS = "100";
  let attempts = 0;
  globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
    attempts++;
    init?.signal?.addEventListener("abort", () => reject(new Error(`unsafe ${secret}`)), { once: true });
  })) as typeof fetch;
  const account = user();
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "PROVIDER_TIMEOUT" });
  assert.equal(attempts, 1);
  assert.equal(runs(account.id)[0].error_code, "PROVIDER_TIMEOUT");
});

test("401, 403, 429, 400, modelo ausente e 5xx são controlados sem retries automáticos", async () => {
  const expected = [[401, "PROVIDER_UNAUTHORIZED"], [403, "PROVIDER_FORBIDDEN"], [429, "PROVIDER_RATE_LIMIT"], [400, "PROVIDER_BAD_REQUEST"], [404, "MODEL_UNAVAILABLE"], [500, "PROVIDER_UNAVAILABLE"], [502, "PROVIDER_UNAVAILABLE"], [503, "PROVIDER_UNAVAILABLE"], [504, "PROVIDER_UNAVAILABLE"]] as const;
  for (const [status, code] of expected) {
    calls = [];
    mockProvider(() => new Response(secret, { status }));
    const account = user();
    await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code });
    assert.equal(calls.length, 1);
    assert.equal(runs(account.id)[0].status, "failed");
    assert.equal(runs(account.id)[0].error_code, code);
  }
});

test("JSON e schema inválidos não persistem resumos ou alteram fontes", async () => {
  const account = user();
  saveAiPrivacy(account.id, true);
  const store = new LocalSourceStore(account.id);
  const sourceId = store.create({ name: "Material", sourceType: "other" });
  store.saveAnalysis(sourceId, { status: "manual", summary: "Texto original da análise local." });
  for (const [content, code] of [["{broken", "INVALID_JSON"], [{ summary: 123, keyPoints: [] }, "INVALID_OUTPUT"], [{ summary: secret, keyPoints: [] }, "INVALID_OUTPUT"]] as const) {
    mockProvider(() => providerResponse(content));
    await assert.rejects(summarizeSource(account.id, sourceId), { code });
  }
  assert.equal((getDatabase().prepare("SELECT COUNT(*) AS total FROM ai_source_summaries WHERE user_id = ?").get(account.id) as { total: number }).total, 0);
  assert.equal(store.get(sourceId).analyses.length, 1);
  assert.equal(store.get(sourceId).analysisStatus, "manual");
  assert.ok(runs(account.id).every((run) => run.status === "failed" && run.total_tokens === 20));
  const encodedSecret = secret.replace("s", "\\u0073");
  mockProvider(() => providerResponse(`{"summary":"${encodedSecret}","keyPoints":[]}`));
  await assert.rejects(summarizeSource(account.id, sourceId), { code: "INVALID_OUTPUT" });
});

test("JSON HTTP inválido, resposta grande e saída truncada são falhas controladas", async () => {
  const account = user();
  mockProvider(() => new Response("not json"));
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "INVALID_PROVIDER_RESPONSE" });
  mockProvider(() => providerResponse({ ok: true }, null, "length"));
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "OUTPUT_TRUNCATED" });
  mockProvider(() => new Response("x".repeat(512_001)));
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "INVALID_PROVIDER_RESPONSE" });
});

test("task desconhecida, reservada e parâmetros livres são recusados antes do provider", async () => {
  mockProvider();
  const account = user();
  await assert.rejects(runAiTask("UNKNOWN" as AiTaskId, {}, { userId: account.id }), { code: "TASK_NOT_FOUND" });
  await assert.rejects(runAiTask("__proto__" as AiTaskId, {}, { userId: account.id }), { code: "TASK_NOT_FOUND" });
  await assert.rejects(runAiTask("GENERATE_STUDY_PLAN", {}, { userId: account.id }), { code: "TASK_UNAVAILABLE" });
  await assert.rejects(runAiTask("HEALTH_CHECK", { prompt: "consume credits" }, { userId: account.id }), { code: "INVALID_INPUT" });
  assert.equal(calls.length, 0);
  assert.equal(Object.keys(AI_TASKS).length, 8);
  assert.deepEqual(readdirSync("src/app/api/ai").sort(), ["review-recommendations", "status", "test"]);
});

test("APIs exigem autenticação e rejeitam prompt, identidade escolhida e chamadas cross-site", async () => {
  mockProvider();
  assert.equal((await aiStatusRequest(request())).status, 401);
  assert.equal((await aiActionRequest(request(undefined, {}), "test")).status, 401);
  const account = user();
  const other = user();
  for (const body of [{ prompt: "free prompt" }, { userId: other.id }, { email: other.email }, { tenant: "other" }, { database: "/tmp/private" }, { model: "another" }]) {
    assert.equal((await aiActionRequest(request(account, body), "test")).status, 400);
  }
  const crossSite = request(account, {});
  crossSite.headers.set("origin", "https://attacker.example");
  assert.equal((await aiActionRequest(crossSite, "test")).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await aiActionRequest(request(account, {}), "test")).status, 200);
  assert.equal(runs(account.id).length, 1);
  assert.equal(runs(other.id).length, 0);
});

test("privacidade começa bloqueada e é aplicada no gateway por usuário", async () => {
  mockProvider(() => providerResponse({ summary: "Resumo", keyPoints: [] }));
  const alice = user();
  const bob = user();
  const sourceId = new LocalSourceStore(alice.id).create({ name: "Fonte privada", sourceType: "exam" });
  new LocalSourceStore(alice.id).saveAnalysis(sourceId, { status: "manual", summary: "Conteúdo reservado de Alice" });
  assert.equal(getAiPreference(alice.id).allowExternalAiProcessing, false);
  await assert.rejects(summarizeSource(alice.id, sourceId), { code: "PRIVACY_BLOCKED" });
  assert.equal(calls.length, 0);
  assert.equal((await saveIntegration(request(alice, { action: "set_privacy", allowExternalAiProcessing: true }))).status, 200);
  assert.equal(getAiPreference(bob.id).allowExternalAiProcessing, false);
  saveAiPrivacy(bob.id, true);
  await assert.rejects(summarizeSource(bob.id, sourceId), { code: "INVALID_INPUT" });
  assert.equal(calls.length, 0);
  assert.throws(() => prepareSourceExcerpts(bob.id, sourceId), { code: "INVALID_INPUT" });
});

test("Source Processing reutiliza texto local, limita trechos e persiste somente resumo validado", async () => {
  mockProvider(() => providerResponse({ summary: "Resumo dos trechos disponíveis.", keyPoints: ["Ponto relevante."] }));
  const account = user();
  saveAiPrivacy(account.id, true);
  const store = new LocalSourceStore(account.id);
  const sourceId = store.create({ name: "Fonte", sourceType: "exam" }, { name: "private-original.pdf", type: "application/pdf", size: 20, bytes: new TextEncoder().encode("%PDF-ORIGINAL-PRIVATE") });
  store.saveAnalysis(sourceId, { status: "manual", summary: "Análise", rawContent: "Texto selecionado. ".repeat(2000) });
  const run = await summarizeSource(account.id, sourceId);
  const sent = JSON.stringify(calls[0].body.messages);
  assert.ok(sent.includes("Texto selecionado"));
  for (const value of ["%PDF", "private-original.pdf", account.id, sourceId, "storagePath", "data/uploads"]) assert.ok(!sent.includes(value));
  const input = JSON.parse((calls[0].body.messages as Array<{ content: string }>)[1].content);
  assert.equal(input.excerpts.length, 2);
  assert.ok(input.excerpts.every((part: { text: string }) => part.text.length <= 1400));
  const saved = getDatabase().prepare("SELECT summary, run_id FROM ai_source_summaries WHERE source_id = ? AND user_id = ?").get(sourceId, account.id);
  assert.deepEqual(saved, { summary: run.result.summary, run_id: run.runId });
  assert.equal(store.get(sourceId).analysisStatus, "manual");
  assert.ok(!JSON.stringify(runs(account.id)).includes("Texto selecionado"));
  assert.deepEqual(getDatabase().pragma("foreign_key_check"), []);
});

test("fontes sem texto salvo não enviam PDF, imagem ou pedido ao provider", async () => {
  mockProvider();
  const account = user();
  saveAiPrivacy(account.id, true);
  const sourceId = new LocalSourceStore(account.id).create({ name: "Sem texto", sourceType: "exam" });
  await assert.rejects(summarizeSource(account.id, sourceId), { code: "SOURCE_TEXT_UNAVAILABLE" });
  assert.equal(calls.length, 0);
});

test("recomendações usam somente o calendário ativo e não persistem alterações de planejamento", async () => {
  const account = user();
  const other = user();
  const store = new LocalStudyStore(account.id);
  store.createActivity({ subject: "Pediatria", topic: "Neonatologia", type: "study", date: "2026-09-10", estimatedMinutes: 30, priority: "high", status: "planned", notes: "NOTAS PRIVADAS DOCUMENTAIS" });
  new LocalStudyStore(other.id).createActivity({ subject: "OUTRO USUÁRIO", topic: "Segredo", type: "study", date: "2026-09-10", estimatedMinutes: 30, priority: "high", status: "planned" });
  const before = store.load().activities;
  mockProvider(() => providerResponse({ summary: "Revisão sugerida.", recommendations: [{ subject: "Pediatria", topic: "Neonatologia", reason: "Tema cadastrado pendente.", minutes: 20 }] }));
  await runAiTask("REVIEW_RECOMMENDATIONS", {}, { userId: account.id });
  const sent = JSON.stringify(calls[0].body);
  for (const forbidden of ["OUTRO USUÁRIO", "NOTAS PRIVADAS DOCUMENTAIS", account.id, other.id, account.email]) assert.ok(!sent.includes(forbidden));
  assert.deepEqual(store.load().activities, before);
  mockProvider(() => providerResponse({ summary: "Resposta inválida", recommendations: [{ subject: "Tema inventado", topic: "Segredo", reason: "Inválido", minutes: 30 }] }));
  await assert.rejects(runAiTask("REVIEW_RECOMMENDATIONS", {}, { userId: account.id }), { code: "INVALID_OUTPUT" });
});

test("limite de concorrência e de frequência evita consumo repetido pela mesma conta", async () => {
  let release: (response: Response) => void = () => undefined;
  mockProvider(() => new Promise<Response>((resolve) => { release = resolve; }));
  const account = user();
  const running = runAiTask("HEALTH_CHECK", {}, { userId: account.id });
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "RUN_IN_PROGRESS" });
  release(providerResponse({ ok: true }));
  await running;
  mockProvider();
  for (let index = 1; index < 10; index++) await runAiTask("HEALTH_CHECK", {}, { userId: account.id });
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "USER_RATE_LIMIT" });
  assert.equal(calls.length, 10);
});

test("alteração de preferência durante a chamada impede retorno de resultado", async () => {
  const account = user();
  mockProvider(() => { saveAiMode(account.id, "none"); return providerResponse({ ok: true }); });
  await assert.rejects(runAiTask("HEALTH_CHECK", {}, { userId: account.id }), { code: "AI_MODE_REQUIRED" });
  assert.equal(runs(account.id)[0].status, "failed");
});

test("MCP permanece funcional com gateway desativado e sem chamar provider", async () => {
  process.env.STUDY_FLOW_AI_ENABLED = "false";
  mockProvider();
  const account = user("mcp");
  const server = createStudyFlowMcpServer(account.id, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "gateway-independence", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "get_source_file"));
    assert.ok(!(await client.callTool({ name: "get_current_user", arguments: {} })).isError);
    assert.equal(calls.length, 0);
  } finally { await client.close(); await server.close(); }
});

test("extensões do provider não podem sobrescrever prompts, chave, modelo ou destino", () => {
  for (const options of [{ messages: [] }, { model: "other" }, { api_key: secret }, { base_url: "https://other.example" }]) {
    process.env.STUDY_FLOW_AI_EXTRA_BODY_JSON = JSON.stringify(options);
    assert.equal(readAiConfig().available, false);
  }
  process.env.STUDY_FLOW_AI_EXTRA_BODY_JSON = '{"thinking":{"type":"disabled"}}';
  assert.equal(readAiConfig().available, true);
  for (const component of ["src/components/ai/ai-integrations-page.tsx", "src/components/ai/study-flow-ai-panel.tsx"]) {
    assert.ok(!readFileSync(component, "utf8").includes("STUDY_FLOW_AI_API_KEY"));
  }
  assert.ok(new AiError("INTERNAL_ERROR").message.length > 0);
});
