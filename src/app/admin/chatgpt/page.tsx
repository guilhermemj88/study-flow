import type { Metadata } from "next";
import { AdminChatGptPage } from "@/components/admin/admin-chatgpt-page";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/server-session";
import { listAdminAudits, listOAuthClients } from "@/lib/local/admin-store";
import { runMcpEndpointDiagnostics } from "@/lib/local/mcp-diagnostics";

export const metadata: Metadata = { title: "ChatGPT e MCP" };
export const dynamic = "force-dynamic";

export default async function AdminChatGptRoute() {
  await requireAdmin();
  const diagnostics = await runMcpEndpointDiagnostics({ timeoutMs: 1_500 });
  return <AppShell><AdminChatGptPage initialOverview={{ diagnostics, clients: listOAuthClients(), diagnosticAudits: listAdminAudits(12) }} /></AppShell>;
}
