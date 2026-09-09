import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

const args = ["--import", "tsx", "mcp/server.ts"];
const baseEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", MCP_PUBLIC_URL: "https://mcp.example.test", MCP_INTERNAL_URL: "http://study-flow-mcp:3333" };

test("servidor rejeita bind externo sem opt-in exato e mantém os hosts de loopback", () => {
  for (const host of ["0.0.0.0", "::", "192.0.2.1"]) {
    for (const flag of ["", "false", "TRUE"]) {
      const result = spawnSync(process.execPath, args, { env: { ...baseEnv, MCP_HOST: host, MCP_PORT: "0", MCP_ALLOW_NON_LOOPBACK: flag }, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /MCP_HOST fora de loopback exige MCP_ALLOW_NON_LOOPBACK=true/);
    }
  }
  for (const host of ["", "127.0.0.1", "localhost", "::1"]) {
    const result = spawnSync(process.execPath, args, { env: { ...baseEnv, MCP_HOST: host, MCP_PORT: "0", MCP_ALLOW_NON_LOOPBACK: "false" }, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MCP_PORT inválida/);
    assert.doesNotMatch(result.stderr, /MCP_HOST fora de loopback/);
  }
});

test("servidor inicia em 0.0.0.0 com opt-in e mantém OAuth e proteção de Host", { timeout: 20_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "study-flow-mcp-server-"));
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const child = spawn(process.execPath, args, {
    env: { ...baseEnv, STUDY_FLOW_DATA_DIR: directory, MCP_HOST: "0.0.0.0", MCP_PORT: String(port), MCP_ALLOW_NON_LOOPBACK: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP não iniciou no prazo")), 10_000);
      let output = "";
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`MCP encerrou antes de iniciar: ${code}`)); });
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
        if (output.includes(`Study Flow MCP em http://0.0.0.0:${port}/mcp`)) { clearTimeout(timeout); resolve(); }
      });
    });
    const request = (path: string, host = "127.0.0.1") => new Promise<{ status: number; authenticate?: string }>((resolve, reject) => {
      const outgoing = httpRequest({ hostname: "127.0.0.1", port, path, headers: { host }, signal: AbortSignal.timeout(5_000) }, (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode ?? 0, authenticate: response.headers["www-authenticate"] }));
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
    assert.equal((await request("/health")).status, 200);
    assert.equal((await request("/health", "study-flow-mcp")).status, 200);
    assert.equal((await request("/health", "attacker.example")).status, 403);
    const unauthorized = await request("/mcp", "mcp.example.test");
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.authenticate ?? "", /https:\/\/mcp.example.test/);
  } finally {
    child.kill();
    await closed;
    assert.ok(!relative(tmpdir(), directory).startsWith(".."));
    rmSync(directory, { recursive: true, force: true });
  }
});
