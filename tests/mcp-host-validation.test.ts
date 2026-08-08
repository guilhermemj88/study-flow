import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { createStudyFlowMcpApp } from "../mcp/app";
import { closeDatabaseForTests } from "../src/lib/local/database";

const publicHostname = "available-experiencing-capital-barcelona.trycloudflare.com";
const publicBaseUrl = `https://${publicHostname}`;
const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-host-test-"));
const port = 40_000 + Math.floor(Math.random() * 2_000);
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;
process.env.MCP_PORT = String(port);
process.env.MCP_HOST = "127.0.0.1";
process.env.MCP_PUBLIC_URL = publicBaseUrl;

let httpServer!: Server;

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

function request(input: { host: string; path: string; method?: "GET" | "POST"; forwardedHost?: string; forwardedProto?: string }) {
  const body = input.method === "POST"
    ? JSON.stringify({ jsonrpc: "2.0", id: "host-test", method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "host-test", version: "1.0.0" } } })
    : "";
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const headers: Record<string, string> = { host: input.host };
    if (body) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(body));
    }
    if (input.forwardedHost) headers["x-forwarded-host"] = input.forwardedHost;
    if (input.forwardedProto) headers["x-forwarded-proto"] = input.forwardedProto;
    const outgoing = httpRequest({ hostname: "127.0.0.1", port, path: input.path, method: input.method ?? "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

test("localhost e 127.0.0.1 continuam permitidos", async () => {
  assert.equal((await request({ host: `localhost:${port}`, path: "/health" })).status, 200);
  assert.equal((await request({ host: `127.0.0.1:${port}`, path: "/health" })).status, 200);
});

test("hostname extraído de MCP_PUBLIC_URL é permitido", async () => {
  const health = await request({ host: publicHostname, path: "/health" });
  assert.equal(health.status, 200);
  const metadata = await request({ host: publicHostname, path: "/.well-known/oauth-protected-resource/mcp" });
  assert.equal(metadata.status, 200);
  assert.equal(JSON.parse(metadata.body).resource, `${publicBaseUrl}/mcp`);
});

test("hostname desconhecido continua rejeitado", async () => {
  const response = await request({ host: "attacker.example", path: "/health" });
  assert.equal(response.status, 403);
  assert.match(response.body, /Invalid Host/);
});

test("GET e POST públicos sem Bearer retornam desafio OAuth 401", async () => {
  for (const method of ["GET", "POST"] as const) {
    const response = await request({ host: publicHostname, path: "/mcp", method });
    assert.equal(response.status, 401);
    assert.equal(response.headers["www-authenticate"], `Bearer resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource/mcp"`);
  }
});

test("headers encaminhados do Cloudflare são validados sem substituir a allowlist", async () => {
  const accepted = await request({ host: `127.0.0.1:${port}`, path: "/mcp", method: "POST", forwardedHost: publicHostname, forwardedProto: "https" });
  assert.equal(accepted.status, 401);

  const unknownForwardedHost = await request({ host: `127.0.0.1:${port}`, path: "/health", forwardedHost: "attacker.example", forwardedProto: "https" });
  assert.equal(unknownForwardedHost.status, 403);

  const wrongProto = await request({ host: publicHostname, path: "/health", forwardedHost: publicHostname, forwardedProto: "http" });
  assert.equal(wrongProto.status, 403);
});
