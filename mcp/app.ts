import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type ErrorRequestHandler } from "express";
import { getMcpPublicBaseUrl, resolveAccessToken } from "@/lib/local/oauth-store";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { registerOAuthRoutes } from "./oauth";
import { createStudyFlowMcpServer } from "./tools";
import { getMcpHostValidationConfig, proxyAwareHostValidation } from "./host-validation";

export function createStudyFlowMcpApp(host = process.env.MCP_HOST || "127.0.0.1") {
  const hostValidation = getMcpHostValidationConfig();
  const app = express();
  app.use(proxyAwareHostValidation(hostValidation));
  app.use(createMcpExpressApp({ host, allowedHosts: hostValidation.allowedHostnames }));
  getDatabase();
  app.use(express.urlencoded({ extended: false }));
  registerOAuthRoutes(app);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "study-flow-mcp", transport: "streamable-http", database: "sqlite-local" }));

  app.use("/mcp", (req, res, next) => {
    const authorization = req.headers.authorization;
    const rawToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const access = rawToken ? resolveAccessToken(rawToken) : null;
    if (!access) {
      const metadata = `${getMcpPublicBaseUrl()}/.well-known/oauth-protected-resource/mcp`;
      res.set("WWW-Authenticate", `Bearer resource_metadata="${metadata}"`).status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "OAuth Bearer token ausente, inválido ou expirado." }, id: null });
      return;
    }
    res.locals.studyFlowMcpAccess = access;
    next();
  });

  app.post("/mcp", async (req, res) => {
    const access = res.locals.studyFlowMcpAccess as NonNullable<ReturnType<typeof resolveAccessToken>>;
    getDatabase().prepare(`INSERT INTO mcp_audit_log
      (id, user_id, client_id, tool_name, success, resource_id, error_message, created_at)
      VALUES (?, ?, ?, '__mcp_connection__', 1, NULL, NULL, ?)`).run(newId(), access.user.id, access.clientId, nowIso());
    const server = createStudyFlowMcpServer(access.user, access.scopes, access.clientId);
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

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "JSON inválido." }, id: null });
      return;
    }
    next(error);
  };
  app.use(jsonErrorHandler);
  return app;
}
