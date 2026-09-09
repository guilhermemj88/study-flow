import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { after, before } from "node:test";
import express from "express";
import { createStudyFlowMcpApp } from "../mcp/app";
import { registerOAuthRoutes } from "../mcp/oauth";
import { createUser } from "../src/lib/local/auth-store";
import { closeDatabaseForTests } from "../src/lib/local/database";
import { resolveAccessToken } from "../src/lib/local/oauth-store";

const directory = mkdtempSync(join(tmpdir(), "study-flow-oauth-http-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = directory;
process.env.MCP_PUBLIC_URL = "https://mcp.example.test";
delete process.env.MCP_INTERNAL_URL;
delete process.env.MCP_ALLOW_INSECURE_DEV_REDIRECTS;
const password = "senha + & = ç de teste";
const email = "oauth+http@example.test";
const servers: Server[] = [];
const endpoints: Array<{ mode: string; base: string }> = [];

before(async () => {
  createUser({ displayName: "OAuth HTTP", email, password });
  const rawApp = express();
  rawApp.use(express.json());
  registerOAuthRoutes(rawApp);
  for (const [mode, app] of [["Express urlencoded", createStudyFlowMcpApp()], ["stream sem parser", rawApp]] as const) {
    const server = await new Promise<Server>((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
      listening.once("error", reject);
    });
    servers.push(server);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    endpoints.push({ mode, base: `http://127.0.0.1:${address.port}` });
  }
});

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  closeDatabaseForTests();
  assert.ok(!relative(tmpdir(), directory).startsWith(".."));
  rmSync(directory, { recursive: true, force: true });
});

test("OAuth HTTP mantém login, PKCE, callback genérico e refresh com e sem parser Express", { timeout: 20_000 }, async (t) => {
  for (const { mode, base } of endpoints) {
    for (const redirectUri of ["https://chatgpt.com/connector_platform_oauth_redirect", "https://claude.ai/api/mcp/auth_callback", "https://client.example/callback"]) {
      await t.test(`${mode}: ${new URL(redirectUri).hostname}`, async () => {
        const postForm = (path: string, form: Record<string, string>) => fetch(`${base}${path}`, {
          method: "POST", body: new URLSearchParams(form), redirect: "manual", signal: AbortSignal.timeout(5_000),
        });
        const registration = await fetch(`${base}/oauth/register`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_name: "Cliente HTTP", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
        });
        assert.equal(registration.status, 201);
        const client = await registration.json() as { client_id: string };
        const verifier = "v".repeat(64);
        const query = new URLSearchParams({
          client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", state: "estado + & = ç",
          code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
          scope: "studyflow:read", resource: `${process.env.MCP_PUBLIC_URL}/mcp`,
        });
        const authorization = await fetch(`${base}/oauth/authorize?${query}`);
        assert.equal(authorization.status, 200);
        assert.match(authorization.headers.get("content-security-policy") ?? "", /form-action 'self';/);
        const html = await authorization.text();
        assert.ok(html.includes(new URL(redirectUri).origin));
        assert.ok(html.includes("acesso de leitura aos seus estudos"));
        const requestId = html.match(/name="request_id" value="([^"]+)"/)?.[1];
        assert.ok(requestId);
        const login = await postForm("/oauth/authorize", { request_id: requestId, email, password });
        assert.equal(login.status, 303);
        const callback = new URL(login.headers.get("location")!);
        assert.equal(`${callback.origin}${callback.pathname}`, redirectUri);
        assert.equal(callback.searchParams.get("state"), "estado + & = ç");
        const code = callback.searchParams.get("code");
        assert.ok(code);
        const tokenInput = { grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: redirectUri, code_verifier: verifier };
        const invalid = await postForm("/oauth/token", { ...tokenInput, code_verifier: "x".repeat(64) });
        assert.equal(invalid.status, 400);
        const tokenResponse = await postForm("/oauth/token", tokenInput);
        assert.equal(tokenResponse.status, 200);
        const tokens = await tokenResponse.json() as { access_token: string; refresh_token: string };
        assert.equal(resolveAccessToken(tokens.access_token)?.user.email, email);
        assert.equal((await postForm("/oauth/token", tokenInput)).status, 400, "código não pode ser reutilizado");
        const refreshed = await postForm("/oauth/token", { grant_type: "refresh_token", client_id: client.client_id, refresh_token: tokens.refresh_token });
        assert.equal(refreshed.status, 200);
        const newTokens = await refreshed.json() as { access_token: string; refresh_token: string };
        assert.notEqual(newTokens.refresh_token, tokens.refresh_token);
        assert.equal(resolveAccessToken(newTokens.access_token)?.user.email, email);
      });
    }
  }
});
