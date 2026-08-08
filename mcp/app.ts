import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getMcpPublicBaseUrl, resolveAccessToken } from "@/lib/local/oauth-store";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { registerOAuthRoutes } from "./oauth";
import { createStudyFlowMcpServer } from "./tools";

export function createStudyFlowMcpApp(host = process.env.MCP_HOST || "127.0.0.1") {
  const publicUrl = new URL(getMcpPublicBaseUrl());
  const allowedHosts = [...new Set(["127.0.0.1", "localhost", "[::1]", publicUrl.hostname])];
  const app = createMcpExpressApp({ host, allowedHosts });
  getDatabase();
  registerOAuthRoutes(app);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "study-flow-mcp", transport: "streamable-http", database: "sqlite-local" }));

  app.post("/mcp", async (req, res) => {
    const authorization = req.headers.authorization;
    const rawToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const access = rawToken ? resolveAccessToken(rawToken) : null;
    if (!access) {
      const metadata = `${getMcpPublicBaseUrl()}/.well-known/oauth-protected-resource/mcp`;
      res.set("WWW-Authenticate", `Bearer resource_metadata="${metadata}"`).status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "OAuth Bearer token ausente, inválido ou expirado." }, id: null });
      return;
    }
    getDatabase().prepare(`INSERT INTO mcp_audit_log
      (id, user_id, client_id, tool_name, success, resource_id, error_message, created_at)
      VALUES (?, ?, ?, '__mcp_connection__', 1, NULL, NULL, ?)`).run(newId(), access.user.id, access.clientId, nowIso());
    const server = createStudyFlowMcpServer(access.user.id, access.scopes);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => { void transport.close(); void server.close(); });
    } catch (error) {
      console.error("Falha MCP:", error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erro interno do servidor MCP." }, id: null });
    }
  });

  for (const method of ["get", "delete"] as const) app[method]("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
  return app;
}
