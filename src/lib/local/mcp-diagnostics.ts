import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getChatGptConnectionEvidence, recordAdminAudit } from "@/lib/local/admin-store";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { getMcpResourceUrl } from "@/lib/local/oauth-store";
import { getMcpInternalBaseUrl } from "@/lib/local/mcp-config";

export type DiagnosticState = "online" | "offline" | "healthy" | "warning" | "invalid" | "not_configured";

export interface DiagnosticCheck {
  state: DiagnosticState;
  ok: boolean;
  detail: string;
  checkedAt: string;
  httpStatus?: number;
}

export interface McpEndpointDiagnostics {
  localEndpoint: string;
  publicEndpoint: string | null;
  sqlite: DiagnosticCheck;
  server: DiagnosticCheck;
  oauth: DiagnosticCheck;
  tunnel: DiagnosticCheck;
  publicAccess: DiagnosticCheck;
  chatGpt: ReturnType<typeof getChatGptConnectionEvidence>;
}

type FetchLike = typeof fetch;

export function configuredPublicEndpoint() {
  const configured = process.env.MCP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!configured) return { endpoint: null, error: null };
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") return { endpoint: null, error: "A URL pública deve usar HTTPS." };
    if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
      return { endpoint: null, error: "A URL pública deve conter somente a origem HTTPS, sem caminho, credenciais ou parâmetros." };
    }
    return { endpoint: `${parsed.origin}/mcp`, error: null };
  } catch {
    return { endpoint: null, error: "MCP_PUBLIC_URL não é uma URL válida." };
  }
}

function safeNetworkError(error: unknown) {
  const root = error instanceof Error ? error : new Error(String(error));
  const cause = root.cause as { code?: string } | undefined;
  const code = cause?.code ?? "";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "Falha de DNS ao localizar o endpoint.";
  if (code.includes("CERT") || code.includes("TLS")) return "Falha de certificado TLS no endpoint HTTPS.";
  if (code === "ECONNREFUSED") return "Conexão recusada; verifique se o servidor MCP está iniciado.";
  if (root.name === "AbortError" || root.name === "TimeoutError") return "O endpoint não respondeu dentro do tempo limite.";
  if (root.message && !/fetch failed/i.test(root.message)) {
    return root.message
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [removido]")
      .replace(/([?&](?:code|token|secret|password)=)[^&\s]+/gi, "$1[removido]")
      .slice(0, 240);
  }
  return "Não foi possível conectar ao endpoint.";
}

function diagnosticFetch(fetchImpl: FetchLike, timeoutMs: number): FetchLike {
  return ((input: URL | RequestInfo, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetchImpl(input, { ...init, signal });
  }) as FetchLike;
}

async function probeHealth(baseUrl: string, fetchImpl: FetchLike, timeoutMs: number): Promise<DiagnosticCheck> {
  const checkedAt = nowIso();
  try {
    const response = await diagnosticFetch(fetchImpl, timeoutMs)(`${baseUrl}/health`, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await response.json().catch(() => null) as { status?: string; transport?: string; database?: string } | null;
    const ok = response.ok && body?.status === "ok" && body.transport === "streamable-http" && body.database === "sqlite-local";
    return { state: ok ? "online" : "warning", ok, detail: ok ? "Servidor MCP local online; transporte Streamable HTTP e SQLite confirmados." : "O endpoint /health respondeu, mas não confirmou a configuração esperada.", checkedAt, httpStatus: response.status };
  } catch (error) {
    return { state: "offline", ok: false, detail: safeNetworkError(error), checkedAt };
  }
}

async function probeOAuth(endpoint: string, fetchImpl: FetchLike, timeoutMs: number, discoveryBaseUrl?: string): Promise<DiagnosticCheck> {
  const checkedAt = nowIso();
  try {
    const response = await diagnosticFetch(fetchImpl, timeoutMs)(endpoint, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "diagnostic", method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "study-flow-admin", version: "1.0.0" } } }),
      cache: "no-store",
    });
    const challenge = response.headers.get("www-authenticate") ?? "";
    const metadataMatch = challenge.match(/resource_metadata="([^"]+)"/i);
    if (response.status !== 401 || !metadataMatch) {
      return { state: "warning", ok: false, detail: `O MCP respondeu ${response.status}, mas não publicou o desafio OAuth esperado.`, checkedAt, httpStatus: response.status };
    }
    const advertisedMetadataUrl = new URL(metadataMatch[1]);
    const metadataUrl = discoveryBaseUrl ? `${discoveryBaseUrl}${advertisedMetadataUrl.pathname}` : advertisedMetadataUrl.toString();
    const metadataResponse = await diagnosticFetch(fetchImpl, timeoutMs)(metadataUrl, { headers: { accept: "application/json" }, cache: "no-store" });
    const metadata = await metadataResponse.json().catch(() => null) as { authorization_servers?: unknown; resource?: unknown } | null;
    const ok = metadataResponse.ok && Array.isArray(metadata?.authorization_servers) && typeof metadata?.resource === "string";
    return {
      state: ok ? "healthy" : "warning",
      ok,
      detail: ok ? "401 sem credenciais recebido corretamente; descoberta OAuth disponível." : "O 401 está correto, mas os metadados OAuth não puderam ser validados.",
      checkedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    return { state: "offline", ok: false, detail: safeNetworkError(error), checkedAt };
  }
}

export async function runMcpEndpointDiagnostics(options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<McpEndpointDiagnostics> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4_000;
  const baseUrl = getMcpInternalBaseUrl();
  const localEndpoint = `${baseUrl}/mcp`;
  const configured = configuredPublicEndpoint();
  const checkedAt = nowIso();
  let sqlite: DiagnosticCheck;
  try {
    const result = getDatabase().prepare("SELECT 1 AS ok").get() as { ok: number };
    sqlite = { state: result.ok === 1 ? "healthy" : "warning", ok: result.ok === 1, detail: "Banco SQLite local acessível.", checkedAt };
  } catch {
    sqlite = { state: "offline", ok: false, detail: "Banco SQLite local indisponível.", checkedAt };
  }

  const [server, oauth, publicAccess] = await Promise.all([
    probeHealth(baseUrl, fetchImpl, timeoutMs),
    probeOAuth(localEndpoint, fetchImpl, timeoutMs, baseUrl),
    configured.endpoint
      ? probeOAuth(configured.endpoint, fetchImpl, timeoutMs)
      : Promise.resolve<DiagnosticCheck>({
          state: configured.error ? "invalid" : "not_configured",
          ok: false,
          detail: configured.error ?? "Nenhum túnel HTTPS público foi configurado.",
          checkedAt,
        }),
  ]);

  return {
    localEndpoint,
    publicEndpoint: configured.endpoint,
    sqlite,
    server,
    oauth,
    tunnel: {
      state: configured.endpoint ? "healthy" : configured.error ? "invalid" : "not_configured",
      ok: Boolean(configured.endpoint),
      detail: configured.endpoint ? "Origem HTTPS pública configurada no servidor." : configured.error ?? "Defina MCP_PUBLIC_URL depois de iniciar o túnel HTTPS.",
      checkedAt,
    },
    publicAccess,
    chatGpt: getChatGptConnectionEvidence(),
  };
}

export async function runAuditedEndpointDiagnostics(adminUserId: string, options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}) {
  const started = Date.now();
  try {
    const result = await runMcpEndpointDiagnostics(options);
    const success = result.sqlite.ok && result.server.ok && result.oauth.ok && (!result.publicEndpoint || result.publicAccess.ok);
    recordAdminAudit({ adminUserId, action: "mcp_endpoint_diagnostics", success, durationMs: Date.now() - started, error: success ? undefined : "Um ou mais componentes não passaram no diagnóstico." });
    return result;
  } catch (error) {
    recordAdminAudit({ adminUserId, action: "mcp_endpoint_diagnostics", success: false, durationMs: Date.now() - started, error });
    throw error;
  }
}

function temporaryToken(userId: string) {
  const database = getDatabase();
  const clientId = `diagnostic-${randomUUID()}`;
  const rawToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const timestamp = nowIso();
  database.transaction(() => {
    database.prepare(`INSERT INTO oauth_clients
      (id, client_name, redirect_uris_json, created_at, last_authorized_at)
      VALUES (?, '__Study Flow diagnostics__', '[]', ?, ?)`).run(clientId, timestamp, timestamp);
    database.prepare(`INSERT INTO oauth_tokens
      (id, user_id, client_id, access_token_hash, refresh_token_hash, scopes, resource,
       expires_at, refresh_expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'studyflow:read studyflow:write', ?, ?, ?, ?)`).run(
        newId(), userId, clientId,
        createHash("sha256").update(rawToken).digest("hex"),
        createHash("sha256").update(refreshToken).digest("hex"),
        getMcpResourceUrl(),
        new Date(Date.now() + 120_000).toISOString(),
        new Date(Date.now() + 120_000).toISOString(),
        timestamp,
      );
  })();
  return {
    rawToken,
    cleanup: () => database.prepare("DELETE FROM oauth_clients WHERE id = ?").run(clientId),
  };
}

async function withAuthenticatedClient<T>(userId: string, operation: (client: Client) => Promise<T>) {
  const diagnosticToken = temporaryToken(userId);
  const client = new Client({ name: "study-flow-admin-diagnostic", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${getMcpInternalBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${diagnosticToken.rawToken}` } },
    fetch: diagnosticFetch(fetch, 6_000),
  });
  try {
    await client.connect(transport);
    return await operation(client);
  } finally {
    await client.close().catch(() => undefined);
    diagnosticToken.cleanup();
  }
}

export async function runAuthenticatedToolsDiagnostic(adminUserId: string) {
  const started = Date.now();
  try {
    const tools = await withAuthenticatedClient(adminUserId, async (client) => {
      const names = ["get_current_user", "list_sources", "get_active_plan"];
      for (const name of names) {
        const result = await client.callTool({ name, arguments: {} });
        if (result.isError) throw new Error(`A ferramenta ${name} retornou erro.`);
      }
      return names;
    });
    const result = { ok: true, checkedAt: nowIso(), detail: "Autenticação OAuth e três ferramentas de leitura responderam corretamente.", tools };
    recordAdminAudit({ adminUserId, action: "mcp_authenticated_tools", success: true, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    recordAdminAudit({ adminUserId, action: "mcp_authenticated_tools", success: false, durationMs: Date.now() - started, error });
    return { ok: false, checkedAt: nowIso(), detail: safeNetworkError(error), tools: [] as string[] };
  }
}

function cleanupTemporaryActivity(userId: string, marker: string) {
  const database = getDatabase();
  database.transaction(() => {
    const subject = database.prepare("SELECT id FROM subjects WHERE user_id = ? AND name = ?").get(userId, marker) as { id: string } | undefined;
    if (!subject) return;
    database.prepare("DELETE FROM activities WHERE user_id = ? AND subject_id = ?").run(userId, subject.id);
    database.prepare("DELETE FROM topics WHERE user_id = ? AND subject_id = ?").run(userId, subject.id);
    database.prepare("DELETE FROM subjects WHERE user_id = ? AND id = ?").run(userId, subject.id);
  })();
  return (database.prepare("SELECT COUNT(*) AS total FROM subjects WHERE user_id = ? AND name = ?").get(userId, marker) as { total: number }).total === 0;
}

export async function runAuthenticatedReadWriteDiagnostic(adminUserId: string) {
  const started = Date.now();
  const marker = `__mcp_test__${randomUUID()}`;
  let cleaned = false;
  try {
    const activityId = await withAuthenticatedClient(adminUserId, async (client) => {
      const read = await client.callTool({ name: "get_current_user", arguments: {} });
      if (read.isError) throw new Error("A leitura autenticada falhou.");
      const written = await client.callTool({
        name: "create_activity",
        arguments: { subject: marker, topic: marker, type: "review", date: nowIso().slice(0, 10), estimatedMinutes: 5, priority: "low", status: "planned", notes: "Diagnóstico temporário; remoção automática." },
      });
      if (written.isError) throw new Error("A escrita autenticada falhou.");
      const structured = written.structuredContent as { activity?: { id?: string } } | undefined;
      if (!structured?.activity?.id) throw new Error("A atividade temporária não pôde ser confirmada.");
      return structured.activity.id;
    });
    const exists = getDatabase().prepare("SELECT 1 FROM activities WHERE id = ? AND user_id = ?").get(activityId, adminUserId);
    if (!exists) throw new Error("A gravação temporária não foi encontrada no SQLite.");
    cleaned = cleanupTemporaryActivity(adminUserId, marker);
    if (!cleaned) throw new Error("A limpeza automática não pôde ser confirmada.");
    const result = { ok: true, cleaned: true, checkedAt: nowIso(), detail: "Leitura e escrita MCP autenticadas concluídas; o registro temporário foi removido." };
    recordAdminAudit({ adminUserId, action: "mcp_authenticated_read_write", success: true, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    cleaned = cleanupTemporaryActivity(adminUserId, marker) || cleaned;
    recordAdminAudit({ adminUserId, action: "mcp_authenticated_read_write", success: false, durationMs: Date.now() - started, error });
    return { ok: false, cleaned, checkedAt: nowIso(), detail: safeNetworkError(error) };
  }
}
