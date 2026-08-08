import { getDatabase, newId, nowIso } from "@/lib/local/database";
import type { UserRole } from "@/types/auth";

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface OAuthClientSummary {
  id: string;
  name: string;
  createdAt: string;
  lastAuthorizedAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  redirectHosts: string[];
  isChatGpt: boolean;
}

export interface McpLogSummary {
  id: string;
  createdAt: string;
  user: { id: string; displayName: string; email: string };
  toolName: string;
  success: boolean;
  errorMessage: string | null;
  clientId: string | null;
}

export interface AdminAuditSummary {
  id: string;
  createdAt: string;
  admin: { id: string; displayName: string; email: string };
  action: string;
  success: boolean;
  durationMs: number;
  errorMessage: string | null;
}

function compactError(value: unknown) {
  if (!value) return null;
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [removido]")
    .replace(/([?&](?:code|token|secret|password)=)[^&\s]+/gi, "$1[removido]")
    .slice(0, 300);
}

function redirectHosts(value: string) {
  try {
    return [...new Set((JSON.parse(value) as string[]).map((uri) => new URL(uri).hostname))];
  } catch {
    return [];
  }
}

export function listAdminUsers(): AdminUserSummary[] {
  const rows = getDatabase().prepare(`SELECT id, display_name, email, role, created_at
    FROM users ORDER BY display_name COLLATE NOCASE, email COLLATE NOCASE`).all() as Array<{
      id: string; display_name: string; email: string; role: UserRole; created_at: string;
    }>;
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role, createdAt: row.created_at }));
}

export function setUserRole(userId: string, role: UserRole): AdminUserSummary {
  if (role !== "admin" && role !== "user") throw new Error("Papel inválido.");
  const database = getDatabase();
  return database.transaction(() => {
    const target = database.prepare("SELECT id, display_name, email, role, created_at FROM users WHERE id = ?").get(userId) as
      | { id: string; display_name: string; email: string; role: UserRole; created_at: string }
      | undefined;
    if (!target) throw new Error("Usuário não encontrado.");
    if (target.role === "admin" && role === "user") {
      const count = database.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get() as { total: number };
      if (count.total <= 1) throw new Error("Não é possível remover o último administrador.");
    }
    if (target.role !== role) database.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, nowIso(), userId);
    return { id: target.id, displayName: target.display_name, email: target.email, role, createdAt: target.created_at };
  })();
}

export function listOAuthClients(): OAuthClientSummary[] {
  const rows = getDatabase().prepare(`SELECT id, client_name, redirect_uris_json, created_at,
    last_authorized_at, last_used_at, revoked_at FROM oauth_clients ORDER BY created_at DESC`).all() as Array<{
      id: string; client_name: string; redirect_uris_json: string; created_at: string;
      last_authorized_at: string | null; last_used_at: string | null; revoked_at: string | null;
    }>;
  return rows.map((row) => {
    const hosts = redirectHosts(row.redirect_uris_json);
    return {
      id: row.id,
      name: row.client_name,
      createdAt: row.created_at,
      lastAuthorizedAt: row.last_authorized_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      redirectHosts: hosts,
      isChatGpt: hosts.includes("chatgpt.com"),
    };
  });
}

export function revokeOAuthClient(clientId: string): OAuthClientSummary {
  const database = getDatabase();
  database.transaction(() => {
    const timestamp = nowIso();
    const result = database.prepare("UPDATE oauth_clients SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(timestamp, clientId);
    if (!result.changes) throw new Error("Cliente OAuth não encontrado.");
    database.prepare("UPDATE oauth_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE client_id = ?").run(timestamp, clientId);
  })();
  const client = listOAuthClients().find((item) => item.id === clientId);
  if (!client) throw new Error("Cliente OAuth não encontrado.");
  return client;
}

export function listMcpLogs(limit = 100): McpLogSummary[] {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const rows = getDatabase().prepare(`SELECT l.id, l.created_at, l.tool_name, l.success, l.error_message, l.client_id,
    u.id AS user_id, u.display_name, u.email
    FROM mcp_audit_log l JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC LIMIT ?`).all(safeLimit) as Array<{
      id: string; created_at: string; tool_name: string; success: number; error_message: string | null; client_id: string | null;
      user_id: string; display_name: string; email: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    user: { id: row.user_id, displayName: row.display_name, email: row.email },
    toolName: row.tool_name === "__mcp_connection__" ? "Conexão MCP autenticada" : row.tool_name,
    success: Boolean(row.success),
    errorMessage: compactError(row.error_message),
    clientId: row.client_id,
  }));
}

export function listAdminAudits(limit = 50): AdminAuditSummary[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = getDatabase().prepare(`SELECT a.id, a.created_at, a.action, a.success, a.duration_ms, a.error_message,
    u.id AS user_id, u.display_name, u.email
    FROM admin_audit_log a JOIN users u ON u.id = a.admin_user_id
    ORDER BY a.created_at DESC LIMIT ?`).all(safeLimit) as Array<{
      id: string; created_at: string; action: string; success: number; duration_ms: number; error_message: string | null;
      user_id: string; display_name: string; email: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    admin: { id: row.user_id, displayName: row.display_name, email: row.email },
    action: row.action,
    success: Boolean(row.success),
    durationMs: row.duration_ms,
    errorMessage: compactError(row.error_message),
  }));
}

export function recordAdminAudit(input: { adminUserId: string; action: string; success: boolean; durationMs: number; error?: unknown }) {
  getDatabase().prepare(`INSERT INTO admin_audit_log
    (id, admin_user_id, action, success, duration_ms, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), input.adminUserId, input.action, Number(input.success), Math.max(0, Math.trunc(input.durationMs)), compactError(input.error), nowIso(),
    );
}

export function getChatGptConnectionEvidence() {
  const clients = listOAuthClients().filter((client) => client.isChatGpt && !client.revokedAt);
  const database = getDatabase();
  const evidence = clients.map((client) => {
    const authorization = database.prepare(`SELECT MAX(created_at) AS at FROM oauth_tokens
      WHERE client_id = ? AND revoked_at IS NULL AND refresh_expires_at > ?`).get(client.id, nowIso()) as { at: string | null };
    const call = database.prepare(`SELECT MAX(created_at) AS at FROM mcp_audit_log
      WHERE client_id = ? AND success = 1`).get(client.id) as { at: string | null };
    return { clientId: client.id, clientName: client.name, authorizedAt: authorization.at, authenticatedCallAt: call.at };
  });
  return {
    registered: clients.length > 0,
    authorized: evidence.some((item) => Boolean(item.authorizedAt)),
    authenticatedCall: evidence.some((item) => Boolean(item.authenticatedCallAt)),
    connected: evidence.some((item) => Boolean(item.authorizedAt && item.authenticatedCallAt)),
    evidence,
  };
}
