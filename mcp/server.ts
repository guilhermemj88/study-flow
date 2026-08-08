import { loadEnvConfig } from "@next/env";
import { getMcpPublicBaseUrl } from "@/lib/local/oauth-store";
import { createStudyFlowMcpApp } from "./app";
import { getMcpHostValidationConfig } from "./host-validation";

loadEnvConfig(process.cwd());

const host = process.env.MCP_HOST || "127.0.0.1";
const port = Number(process.env.MCP_PORT || 3333);
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("MCP_HOST deve permanecer em loopback; exponha o MCP somente pelo túnel HTTPS.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MCP_PORT inválida.");

const httpServer = createStudyFlowMcpApp(host).listen(port, host, () => {
  console.log(`Study Flow MCP em http://${host}:${port}/mcp`);
  console.log(`URL pública configurada: ${getMcpPublicBaseUrl()}`);
  console.log(`Hosts MCP permitidos: ${getMcpHostValidationConfig().allowedHostnames.join(", ")}`);
});
httpServer.on("error", (error) => { console.error(error); process.exit(1); });

function shutdown() { httpServer.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
