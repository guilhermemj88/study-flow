import { isIP } from "node:net";
import { getDatabase, nowIso } from "@/lib/local/database";
import { getMcpResourceUrl } from "@/lib/local/oauth-store";
import type { LocalAuthUser } from "@/types/auth";
import type { AiIntegrationOverview, AiMode } from "@/types/ai-integration";
import { getAiAvailability } from "@/lib/ai/config";
import { getAiPreference, saveAiMode } from "@/lib/local/ai-preference-store";

function publicMcpUrl(): string | null {
  if (!process.env.MCP_PUBLIC_URL?.trim()) return null;
  try {
    const url = new URL(getMcpResourceUrl());
    const host = url.hostname;
    // Do not present development addresses or internal hosts as public URLs.
    if (url.protocol !== "https:" || isIP(host) || host.startsWith("[") || !host.includes(".") ||
      /(^|\.)(localhost|local|internal|lan)$/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getAiIntegrationOverview(user: LocalAuthUser): AiIntegrationOverview {
  const database = getDatabase();
  const preference = getAiPreference(user.id);
  const publicUrl = publicMcpUrl();
  let resource: string | null = null;
  try { resource = getMcpResourceUrl(); } catch { /* Invalid deployment configuration stays server-side. */ }
  const timestamp = nowIso();
  const evidence = database.prepare(`SELECT COUNT(DISTINCT t.client_id) AS clients,
    MAX((SELECT MAX(l.created_at) FROM mcp_audit_log l
      WHERE l.user_id = t.user_id AND l.client_id = t.client_id AND l.success = 1
      AND l.created_at >= t.created_at)) AS last_call
    FROM oauth_tokens t JOIN oauth_clients c ON c.id = t.client_id
    WHERE t.user_id = ? AND t.resource = ? AND t.revoked_at IS NULL AND c.revoked_at IS NULL
      AND (t.expires_at > ? OR t.refresh_expires_at > ?)`)
    .get(user.id, resource, timestamp, timestamp) as { clients: number; last_call: string | null };
  const hasHistory = Boolean(database.prepare("SELECT 1 FROM oauth_tokens WHERE user_id = ? LIMIT 1").get(user.id));
  return {
    identity: { displayName: user.displayName, email: user.email },
    // Existing OAuth users keep their integration when upgrading.
    mode: preference?.mode ?? (evidence.clients ? "mcp" : "none"),
    studyFlowAi: getAiAvailability(),
    allowExternalAiProcessing: preference.allowExternalAiProcessing,
    mcp: {
      publicUrl,
      endpointState: publicUrl ? "configured" : "unavailable",
      status: evidence.clients ? (evidence.last_call ? "connected" : "authorized") : (hasHistory ? "inactive" : "not_connected"),
      authorizedClients: evidence.clients,
      lastAuthenticatedAt: evidence.last_call,
    },
  };
}

export function setAiMode(userId: string, mode: AiMode) {
  if (!["mcp", "none", "study_flow"].includes(mode) || (mode === "study_flow" && !getAiAvailability().available)) throw new Error("Opção de IA indisponível.");
  saveAiMode(userId, mode);
}

export function disconnectMyMcp(userId: string) {
  const database = getDatabase();
  database.transaction(() => {
    database.prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(nowIso(), userId);
    database.prepare("DELETE FROM oauth_authorization_codes WHERE user_id = ? AND used_at IS NULL").run(userId);
    setAiMode(userId, "none");
  })();
}
