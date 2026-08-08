import type { Metadata } from "next";
import { AdminMcpLogsPage } from "@/components/admin/admin-mcp-logs-page";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/server-session";
import { listAdminAudits, listMcpLogs } from "@/lib/local/admin-store";

export const metadata: Metadata = { title: "Logs MCP" };
export const dynamic = "force-dynamic";

export default async function AdminMcpLogsRoute() {
  await requireAdmin();
  return <AppShell><AdminMcpLogsPage audits={listAdminAudits(100)} logs={listMcpLogs(200)} /></AppShell>;
}
