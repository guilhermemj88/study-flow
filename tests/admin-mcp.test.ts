import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GET as adminGet } from "../src/app/api/admin/[...path]/route";
import { createStudyFlowMcpApp } from "../mcp/app";
import { createUser, createUserSession } from "../src/lib/local/auth-store";
import { getChatGptConnectionEvidence, listMcpLogs, listOAuthClients, listAdminUsers, revokeOAuthClient, setUserRole } from "../src/lib/local/admin-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { runAuthenticatedReadWriteDiagnostic, runAuthenticatedToolsDiagnostic, runMcpEndpointDiagnostics } from "../src/lib/local/mcp-diagnostics";
import { authorizeWithPassword, createAuthorizationRequest, exchangeAuthorizationCode, registerOAuthClient, resolveAccessToken } from "../src/lib/local/oauth-store";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-admin-test-"));
const port = 38_000 + Math.floor(Math.random() * 2_000);
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;
process.env.MCP_PORT = String(port);
process.env.MCP_HOST = "127.0.0.1";
process.env.MCP_PUBLIC_URL = `http://127.0.0.1:${port}`;
process.env.MCP_ALLOW_INSECURE_DEV_REDIRECTS = "true";

let httpServer: Server;

before(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer = createStudyFlowMcpApp().listen(port, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
    httpServer.once("error", reject);
  });
});

after(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

const alicePassword = "senha-segura-admin";
const alice = createUser({ displayName: "Alice Admin", email: "admin@example.test", password: alicePassword });
const bob = createUser({ displayName: "Bob User", email: "user@example.test", password: "senha-segura-user" });

test("novos usuários são comuns; promoção e proteção do último admin ocorrem no servidor", () => {
  assert.equal(alice.role, "user");
  assert.equal(bob.role, "user");
  assert.ok(listAdminUsers().every((user) => user.role === "user"));

  assert.equal(setUserRole(alice.id, "admin").role, "admin");
  assert.throws(() => setUserRole(alice.id, "user"), /último administrador/i);
  assert.equal(setUserRole(bob.id, "admin").role, "admin");
  assert.equal(setUserRole(bob.id, "user").role, "user");
  assert.equal(listAdminUsers().find((user) => user.id === alice.id)?.role, "admin");
});

test("rota administrativa retorna 403 para usuário comum e dados para admin", async () => {
  const bobSession = createUserSession(bob.id);
  const forbidden = await adminGet(new Request("http://localhost/api/admin/users", { headers: { cookie: `study_flow_session=${bobSession.token}` } }), { params: Promise.resolve({ path: ["users"] }) });
  assert.equal(forbidden.status, 403);

  const aliceSession = createUserSession(alice.id);
  const allowed = await adminGet(new Request("http://localhost/api/admin/users", { headers: { cookie: `study_flow_session=${aliceSession.token}` } }), { params: Promise.resolve({ path: ["users"] }) });
  assert.equal(allowed.status, 200);
});

function metadataFetch(mode: "online" | "offline") {
  return (async (input: URL | RequestInfo) => {
    if (mode === "offline") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const url = String(input);
    if (url.endsWith("/health")) return Response.json({ status: "ok", transport: "streamable-http", database: "sqlite-local" });
    if (url.includes("/.well-known/oauth-protected-resource")) return Response.json({ resource: url.replace("/.well-known/oauth-protected-resource/mcp", "/mcp"), authorization_servers: [new URL(url).origin] });
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${new URL(url).origin}/.well-known/oauth-protected-resource/mcp"` } });
  }) as typeof fetch;
}

test("diagnóstico diferencia servidor online, offline e URL pública inválida", async () => {
  const original = process.env.MCP_PUBLIC_URL;
  try {
    delete process.env.MCP_PUBLIC_URL;
    const online = await runMcpEndpointDiagnostics({ fetchImpl: metadataFetch("online") });
    assert.equal(online.server.ok, true);
    assert.equal(online.oauth.ok, true);
    assert.equal(online.publicAccess.state, "not_configured");

    const offline = await runMcpEndpointDiagnostics({ fetchImpl: metadataFetch("offline") });
    assert.equal(offline.server.state, "offline");
    assert.match(offline.server.detail, /recusada/i);

    process.env.MCP_PUBLIC_URL = "http://mcp.example.test";
    const invalid = await runMcpEndpointDiagnostics({ fetchImpl: metadataFetch("online") });
    assert.equal(invalid.publicAccess.state, "invalid");

    process.env.MCP_PUBLIC_URL = "https://mcp.example.test";
    const publicOnline = await runMcpEndpointDiagnostics({ fetchImpl: metadataFetch("online") });
    assert.equal(publicOnline.publicAccess.ok, true);
  } finally {
    process.env.MCP_PUBLIC_URL = original;
  }
});

test("clientes OAuth são listados sem segredos, podem ser revogados e perdem os tokens", () => {
  const redirectUri = "http://127.0.0.1:6274/oauth/callback";
  const client = registerOAuthClient({ clientName: "Cliente revogável", redirectUris: [redirectUri] });
  const verifier = "v".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = createAuthorizationRequest({ clientId: client.client_id, redirectUri, responseType: "code", codeChallenge: challenge, codeChallengeMethod: "S256" });
  const code = new URL(authorizeWithPassword(authorization.id, alice.email, alicePassword)).searchParams.get("code");
  assert.ok(code);
  const tokens = exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri, codeVerifier: verifier });
  assert.ok(resolveAccessToken(tokens.access_token));

  const dto = listOAuthClients().find((item) => item.id === client.client_id);
  assert.ok(dto);
  assert.equal("access_token" in dto, false);
  assert.equal("refresh_token" in dto, false);
  assert.equal("secret" in dto, false);
  revokeOAuthClient(client.client_id);
  assert.equal(resolveAccessToken(tokens.access_token), null);
});

test("ferramentas autenticadas e leitura/escrita MCP funcionam sem deixar resíduos", async () => {
  const endpoint = await runMcpEndpointDiagnostics();
  assert.equal(endpoint.server.ok, true, endpoint.server.detail);
  assert.equal(endpoint.oauth.ok, true, endpoint.oauth.detail);
  assert.equal(endpoint.oauth.httpStatus, 401);

  const tools = await runAuthenticatedToolsDiagnostic(alice.id);
  assert.equal(tools.ok, true, tools.detail);
  assert.deepEqual(tools.tools, ["get_current_user", "list_sources", "get_active_plan"]);

  const readWrite = await runAuthenticatedReadWriteDiagnostic(alice.id);
  assert.equal(readWrite.ok, true, readWrite.detail);
  assert.equal(readWrite.cleaned, true);
  const subjects = getDatabase().prepare("SELECT COUNT(*) AS total FROM subjects WHERE user_id = ? AND name LIKE '__mcp_test__%'").get(alice.id) as { total: number };
  const activities = getDatabase().prepare("SELECT COUNT(*) AS total FROM activities WHERE user_id = ? AND notes LIKE 'Diagnóstico temporário%'").get(alice.id) as { total: number };
  assert.equal(subjects.total, 0);
  assert.equal(activities.total, 0);
});

test("status ChatGPT exige registro, autorização e chamada MCP autenticada reais", async () => {
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
  const clientRegistration = registerOAuthClient({ clientName: "ChatGPT Business", redirectUris: [redirectUri] });
  const verifier = "c".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = createAuthorizationRequest({ clientId: clientRegistration.client_id, redirectUri, responseType: "code", codeChallenge: challenge, codeChallengeMethod: "S256" });
  const code = new URL(authorizeWithPassword(authorization.id, alice.email, alicePassword)).searchParams.get("code");
  assert.ok(code);
  const tokens = exchangeAuthorizationCode({ code, clientId: clientRegistration.client_id, redirectUri, codeVerifier: verifier });
  assert.equal(getChatGptConnectionEvidence().connected, false);

  const client = new Client({ name: "chatgpt-evidence-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } });
  await client.connect(transport);
  await client.callTool({ name: "get_current_user", arguments: {} });
  await client.close();
  assert.equal(getChatGptConnectionEvidence().connected, true);

  const serializedLogs = JSON.stringify(listMcpLogs(200));
  assert.doesNotMatch(serializedLogs, new RegExp(tokens.access_token));
  assert.doesNotMatch(serializedLogs, new RegExp(tokens.refresh_token));
  assert.doesNotMatch(serializedLogs, new RegExp(alicePassword));
});
