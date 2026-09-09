import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createStudyFlowMcpApp } from "../mcp/app";
import { GET, POST } from "../src/app/api/integrations/ai/route";
import { createUser, createUserSession } from "../src/lib/local/auth-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { disconnectMyMcp, getAiIntegrationOverview, setAiMode } from "../src/lib/local/ai-integration-store";
import { authorizeWithPassword, createAuthorizationRequest, exchangeAuthorizationCode, getMcpResourceUrl, refreshAccessToken, registerOAuthClient, resolveAccessToken } from "../src/lib/local/oauth-store";
import type { LocalAuthUser } from "../src/types/auth";

const directory = mkdtempSync(join(tmpdir(), "study-flow-user-ai-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = directory;
process.env.MCP_PUBLIC_URL = "https://mcp.study-flow.example";
delete process.env.MCP_ALLOW_INSECURE_DEV_REDIRECTS;
let server: Server;
let localUrl: string;

before(async () => {
  await new Promise<void>((resolve, reject) => { server = createStudyFlowMcpApp().listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve()); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  localUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDatabaseForTests();
  assert.ok(!relative(tmpdir(), directory).startsWith(".."));
  rmSync(directory, { recursive: true, force: true });
});

const password = "senha-de-teste-integracao";
function account(name: string) {
  return createUser({ displayName: name, email: `${randomUUID()}@example.test`, password });
}

function grant(user: LocalAuthUser, registration?: ReturnType<typeof registerOAuthClient>) {
  const client = registration ?? registerOAuthClient({ clientName: "Meu cliente", redirectUris: ["https://client.example/callback"] });
  const verifier = "v".repeat(64);
  const redirectUri = client.redirect_uris[0];
  const authorization = createAuthorizationRequest({ clientId: client.client_id, redirectUri, responseType: "code", codeChallenge: createHash("sha256").update(verifier).digest("base64url"), codeChallengeMethod: "S256" });
  const code = new URL(authorizeWithPassword(authorization.id, user.email, password)).searchParams.get("code")!;
  return { client, code, verifier, tokens: exchangeAuthorizationCode({ clientId: client.client_id, redirectUri, code, codeVerifier: verifier }) };
}

function apiRequest(user?: LocalAuthUser, body?: unknown, extraHeaders?: Record<string, string>) {
  const headers = new Headers(extraHeaders);
  if (user) headers.set("cookie", `study_flow_session=${createUserSession(user.id).token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://localhost/api/integrations/ai", { headers, ...(body !== undefined ? { method: "POST", body: JSON.stringify(body) } : {}) });
}

test("API exige sessão e permite gestão pelo usuário comum sem expor dados internos", async () => {
  assert.equal((await GET(apiRequest())).status, 401);
  assert.equal((await POST(apiRequest(undefined, { action: "disconnect" }))).status, 401);
  const alice = account("Alice");
  const bob = account("Bob");
  assert.equal(alice.role, "user");
  const response = await GET(apiRequest(alice));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const overview = await response.json();
  assert.deepEqual(overview.identity, { displayName: alice.displayName, email: alice.email });
  assert.equal(overview.mcp.publicUrl, "https://mcp.study-flow.example/mcp");
  assert.equal(overview.mcp.publicUrl, getAiIntegrationOverview(bob).mcp.publicUrl);
  assert.equal(overview.mcp.status, "not_connected");
  const serialized = JSON.stringify(overview);
  for (const forbidden of [alice.id, bob.id, bob.email, "userId", "user_id", "tenant", "token", "secret", "password", "sqlite", directory]) {
    assert.ok(!serialized.includes(forbidden), `DTO não deve conter ${forbidden}`);
  }
});

test("preferência persiste por conta; dados de outro usuário e modo não implementado são rejeitados", async () => {
  const alice = account("Preferência Alice");
  const bob = account("Preferência Bob");
  const saved = await POST(apiRequest(alice, { action: "set_mode", mode: "mcp" }));
  assert.equal(saved.status, 200);
  closeDatabaseForTests();
  assert.equal(getAiIntegrationOverview(alice).mode, "mcp");
  assert.equal(getAiIntegrationOverview(bob).mode, "none");
  for (const body of [
    { action: "set_mode", mode: "study_flow" },
    { action: "set_mode", mode: "mcp", userId: bob.id },
    { action: "disconnect", userId: bob.id },
    { action: "set_mode", mode: "invalid" },
    null,
  ]) assert.equal((await POST(apiRequest(alice, body))).status, 400);
  assert.equal((await POST(apiRequest(alice, { action: "disconnect" }, { origin: "https://another.example" }))).status, 403);
  assert.equal((await POST(apiRequest(alice, { action: "disconnect" }, { "sec-fetch-site": "cross-site" }))).status, 403);
  const normalizedRequest = apiRequest(alice, { action: "set_mode", mode: "mcp" }, { host: "127.0.0.1:3128", origin: "http://127.0.0.1:3128" });
  assert.equal((await POST(normalizedRequest)).status, 200, "Next pode normalizar a URL interna sem mudar o Host público");
  assert.equal((await POST(apiRequest(alice, { action: "disconnect" }, { host: "127.0.0.1:3128", origin: "https://another.example" }))).status, 403);
});

test("estado exige autorização e chamada reais do mesmo usuário, mesmo quando o cliente é compartilhado", async () => {
  const alice = account("Conexão Alice");
  const bob = account("Conexão Bob");
  const aliceGrant = grant(alice);
  const bobGrant = grant(bob, aliceGrant.client);
  assert.equal(getAiIntegrationOverview(alice).mcp.status, "authorized");
  assert.equal(getAiIntegrationOverview(alice).mode, "mcp");
  const client = new Client({ name: "user-ai-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${localUrl}/mcp`), { requestInit: { headers: { authorization: `Bearer ${aliceGrant.tokens.access_token}` } } });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "list_calendar"));
    const calendar = await client.callTool({ name: "list_calendar", arguments: { dateFrom: "2026-09-01", dateTo: "2026-09-30" } });
    assert.ok(!calendar.isError);
  } finally { await client.close(); }
  assert.equal(getAiIntegrationOverview(alice).mcp.status, "connected");
  assert.equal(getAiIntegrationOverview(bob).mcp.status, "authorized");
  assert.equal(getAiIntegrationOverview(bob).mcp.lastAuthenticatedAt, null);
  setAiMode(alice.id, "none");
  assert.ok(resolveAccessToken(aliceGrant.tokens.access_token));
  const revoked = await POST(apiRequest(alice, { action: "disconnect" }));
  assert.equal(revoked.status, 200);
  assert.equal(getAiIntegrationOverview(alice).mcp.status, "inactive");
  assert.equal(resolveAccessToken(aliceGrant.tokens.access_token), null);
  assert.throws(() => refreshAccessToken({ clientId: aliceGrant.client.client_id, refreshToken: aliceGrant.tokens.refresh_token }));
  assert.equal(resolveAccessToken(bobGrant.tokens.access_token)?.user.id, bob.id);
  assert.equal(getAiIntegrationOverview(bob).mcp.status, "authorized");
});

test("revogação invalida códigos pendentes apenas da própria conta", () => {
  const alice = account("Código pendente");
  const client = registerOAuthClient({ redirectUris: ["https://client.example/callback"] });
  const verifier = "x".repeat(64);
  const request = createAuthorizationRequest({ clientId: client.client_id, redirectUri: client.redirect_uris[0], responseType: "code", codeChallenge: createHash("sha256").update(verifier).digest("base64url"), codeChallengeMethod: "S256" });
  const code = new URL(authorizeWithPassword(request.id, alice.email, password)).searchParams.get("code")!;
  disconnectMyMcp(alice.id);
  assert.throws(() => exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: client.redirect_uris[0], codeVerifier: verifier }));
});

test("estado trata expiração, refresh válido, cliente revogado e troca de endpoint", () => {
  const user = account("Expiração");
  const authorization = grant(user);
  getDatabase().prepare("UPDATE oauth_tokens SET expires_at = ? WHERE user_id = ?").run("2000-01-01T00:00:00.000Z", user.id);
  assert.equal(getAiIntegrationOverview(user).mcp.status, "authorized");
  getDatabase().prepare("UPDATE oauth_tokens SET refresh_expires_at = ? WHERE user_id = ?").run("2000-01-01T00:00:00.000Z", user.id);
  assert.equal(getAiIntegrationOverview(user).mcp.status, "inactive");
  grant(user, authorization.client);
  getDatabase().prepare("UPDATE oauth_clients SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), authorization.client.client_id);
  assert.equal(getAiIntegrationOverview(user).mcp.status, "inactive");
  grant(user);
  const original = process.env.MCP_PUBLIC_URL;
  try {
    process.env.MCP_PUBLIC_URL = "https://different.example";
    assert.equal(getAiIntegrationOverview(user).mcp.status, "inactive");
  } finally { process.env.MCP_PUBLIC_URL = original; }
});

test("URL inválida ou local não vaza configuração privada nem derruba a área de IA", () => {
  const user = account("URL");
  const original = process.env.MCP_PUBLIC_URL;
  try {
    for (const url of ["", "not a url", "http://127.0.0.1:3333", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://service.internal", "https://private:credential@public.example", "https://public.example?token=secret", "https://public.example/private"]) {
      process.env.MCP_PUBLIC_URL = url;
      const overview = getAiIntegrationOverview(user);
      assert.equal(overview.mcp.publicUrl, null, url);
      assert.equal(overview.mcp.endpointState, "unavailable");
      assert.ok(!JSON.stringify(overview).includes("credential"));
    }
  } finally { process.env.MCP_PUBLIC_URL = original; }
});

test("ChatGPT, Claude e cliente genérico mantêm OAuth com PKCE e callback exato", async () => {
  const user = account("OAuth compatível");
  for (const redirectUri of ["https://chatgpt.com/connector_platform_oauth_redirect", "https://claude.ai/api/mcp/auth_callback", "https://my-client.example/oauth/callback"]) {
    const registration = registerOAuthClient({ clientName: "Cliente externo", redirectUris: [redirectUri] });
    const authorization = grant(user, registration);
    assert.equal(resolveAccessToken(authorization.tokens.access_token)?.user.id, user.id);
    const input = { clientId: registration.client_id, responseType: "code", codeChallenge: "a".repeat(43), codeChallengeMethod: "S256" };
    assert.throws(() => createAuthorizationRequest({ ...input, redirectUri: `${redirectUri}/other` }));
    assert.throws(() => createAuthorizationRequest({ ...input, redirectUri, codeChallengeMethod: "plain" }));
    const query = new URLSearchParams({ client_id: registration.client_id, redirect_uri: redirectUri, response_type: "code", code_challenge: "a".repeat(43), code_challenge_method: "S256", scope: "studyflow:read", resource: getMcpResourceUrl() });
    const response = await fetch(`${localUrl}/oauth/authorize?${query}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Autorizar conexão"));
    assert.ok(html.includes("acesso de leitura aos seus estudos"));
    assert.ok(!html.includes("SQLite"));
  }
  for (const redirectUri of ["http://client.example/callback", "javascript:alert(1)", "https://client.example/callback#fragment", "https://user:secret@client.example/callback", "http://localhost:6274/callback"]) {
    assert.throws(() => registerOAuthClient({ redirectUris: [redirectUri] }), /não permitido/);
  }
});
