import { requireAdminRequest } from "@/lib/auth/server-session";
import {
  listAdminAudits,
  listAdminUsers,
  listMcpLogs,
  listOAuthClients,
  recordAdminAudit,
  revokeOAuthClient,
  setUserRole,
} from "@/lib/local/admin-store";
import {
  runAuditedEndpointDiagnostics,
  runAuthenticatedReadWriteDiagnostic,
  runAuthenticatedToolsDiagnostic,
  runMcpEndpointDiagnostics,
} from "@/lib/local/mcp-diagnostics";
import type { UserRole } from "@/types/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

function failure(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  return json({ error: message }, /último administrador/i.test(message) ? 409 : 400);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    requireAdminRequest(request);
    const path = (await context.params).path;
    if (path[0] === "overview" && path.length === 1) {
      const diagnostics = await runMcpEndpointDiagnostics({ timeoutMs: 1_500 });
      return json({ diagnostics, clients: listOAuthClients(), diagnosticAudits: listAdminAudits(12) });
    }
    if (path[0] === "users" && path.length === 1) return json({ users: listAdminUsers() });
    if (path[0] === "oauth-clients" && path.length === 1) return json({ clients: listOAuthClients() });
    if (path[0] === "mcp-logs" && path.length === 1) {
      const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
      return json({ logs: listMcpLogs(limit), diagnosticAudits: listAdminAudits(50) });
    }
    return json({ error: "Rota administrativa não encontrada." }, 404);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = requireAdminRequest(request);
    const path = (await context.params).path;
    if (path[0] === "users" && path[1] && path[2] === "role") {
      const input = await request.json() as { role?: UserRole };
      if (input.role !== "admin" && input.role !== "user") return json({ error: "Papel inválido." }, 400);
      const started = Date.now();
      try {
        const user = setUserRole(path[1], input.role);
        recordAdminAudit({ adminUserId: admin.id, action: `user_role:${input.role}`, success: true, durationMs: Date.now() - started });
        return json({ user });
      } catch (error) {
        recordAdminAudit({ adminUserId: admin.id, action: `user_role:${input.role}`, success: false, durationMs: Date.now() - started, error });
        throw error;
      }
    }
    if (path[0] === "oauth-clients" && path[1] && path[2] === "revoke") {
      const started = Date.now();
      try {
        const client = revokeOAuthClient(path[1]);
        recordAdminAudit({ adminUserId: admin.id, action: "oauth_client_revoke", success: true, durationMs: Date.now() - started });
        return json({ client });
      } catch (error) {
        recordAdminAudit({ adminUserId: admin.id, action: "oauth_client_revoke", success: false, durationMs: Date.now() - started, error });
        throw error;
      }
    }
    if (path[0] === "diagnostics" && path[1] === "endpoint") return json({ diagnostics: await runAuditedEndpointDiagnostics(admin.id) });
    if (path[0] === "diagnostics" && path[1] === "tools") return json({ result: await runAuthenticatedToolsDiagnostic(admin.id) });
    if (path[0] === "diagnostics" && path[1] === "read-write") return json({ result: await runAuthenticatedReadWriteDiagnostic(admin.id) });
    return json({ error: "Rota administrativa não encontrada." }, 404);
  } catch (error) {
    return failure(error);
  }
}
