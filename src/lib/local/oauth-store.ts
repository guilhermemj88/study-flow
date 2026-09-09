import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { authenticateUser } from "@/lib/local/auth-store";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import type { LocalAuthUser } from "@/types/auth";

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_DAYS = 30;
export const MCP_SCOPES = ["studyflow:read", "studyflow:write"] as const;

interface ClientRow { id: string; client_name: string; redirect_uris_json: string; revoked_at: string | null }
interface RequestRow {
  id: string; client_id: string; redirect_uri: string; state: string | null; code_challenge: string;
  scopes: string; resource: string; expires_at: string;
}
interface CodeRow extends RequestRow { code_hash: string; user_id: string; used_at: string | null }
interface TokenRow {
  id: string; user_id: string; client_id: string; scopes: string; resource: string;
  expires_at: string; refresh_expires_at: string; revoked_at: string | null;
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function token() { return randomBytes(32).toString("base64url"); }
function splitScopes(value: string) { return [...new Set(value.split(/\s+/).filter(Boolean))]; }
function assertScopes(value: string) {
  const scopes = splitScopes(value || "studyflow:read studyflow:write");
  if (!scopes.length || scopes.some((scope) => !MCP_SCOPES.includes(scope as (typeof MCP_SCOPES)[number]))) throw new Error("Escopo OAuth inválido.");
  if (!scopes.includes("studyflow:read")) throw new Error("O escopo studyflow:read é obrigatório.");
  return scopes.join(" ");
}
function parseUris(value: string) { try { return JSON.parse(value) as string[]; } catch { return []; } }

export function getMcpPublicBaseUrl() {
  const configured = process.env.MCP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    const parsed = new URL(configured);
    const localHttp = parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) throw new Error("MCP_PUBLIC_URL deve usar HTTPS, exceto em localhost para testes.");
    if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) throw new Error("MCP_PUBLIC_URL deve conter apenas a origem pública, sem caminho, credenciais ou parâmetros.");
    return parsed.origin;
  }
  const port = process.env.MCP_PORT || "3333";
  return `http://127.0.0.1:${port}`;
}

export function getMcpResourceUrl() { return `${getMcpPublicBaseUrl()}/mcp`; }

function allowedRedirect(uri: string) {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password || parsed.hash || uri.includes("#")) return false;
    // Public MCP clients register their own HTTPS callbacks. Authorization and
    // code exchange still require the exact registered URI and PKCE S256.
    if (parsed.protocol === "https:") return true;
    if (process.env.MCP_ALLOW_INSECURE_DEV_REDIRECTS === "true" && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)) return true;
  } catch { return false; }
  return false;
}

export function registerOAuthClient(input: { clientName?: string; redirectUris: string[] }) {
  if (!input.redirectUris?.length || input.redirectUris.some((uri) => !allowedRedirect(uri))) throw new Error("redirect_uri não permitido.");
  const id = token();
  getDatabase().prepare("INSERT INTO oauth_clients (id, client_name, redirect_uris_json, created_at) VALUES (?, ?, ?, ?)")
    .run(id, input.clientName?.trim() || "ChatGPT MCP", JSON.stringify([...new Set(input.redirectUris)]), nowIso());
  return { client_id: id, client_name: input.clientName?.trim() || "ChatGPT MCP", redirect_uris: [...new Set(input.redirectUris)], token_endpoint_auth_method: "none" };
}

export function createAuthorizationRequest(input: {
  clientId: string; redirectUri: string; state?: string; codeChallenge: string;
  codeChallengeMethod: string; scope?: string; resource?: string; responseType?: string;
}) {
  const client = getDatabase().prepare("SELECT * FROM oauth_clients WHERE id = ?").get(input.clientId) as ClientRow | undefined;
  if (!client || client.revoked_at || !parseUris(client.redirect_uris_json).includes(input.redirectUri)) throw new Error("Cliente OAuth ou redirect_uri inválido.");
  if (input.responseType !== "code") throw new Error("Somente response_type=code é aceito.");
  if (input.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) throw new Error("PKCE S256 é obrigatório.");
  const resource = input.resource || getMcpResourceUrl();
  if (resource !== getMcpResourceUrl()) throw new Error("Resource OAuth inválido.");
  const id = token(); const createdAt = nowIso(); const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  getDatabase().prepare(`INSERT INTO oauth_requests
    (id, client_id, redirect_uri, state, code_challenge, scopes, resource, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.clientId, input.redirectUri, input.state ?? null, input.codeChallenge, assertScopes(input.scope ?? ""), resource, expiresAt, createdAt);
  return { id, clientName: client.client_name, redirectUri: input.redirectUri, scopes: assertScopes(input.scope ?? "") };
}

export function getAuthorizationRequestDetails(requestId: string) {
  return getDatabase().prepare(`SELECT r.id, c.client_name AS clientName, r.redirect_uri AS redirectUri, r.scopes
    FROM oauth_requests r JOIN oauth_clients c ON c.id = r.client_id
    WHERE r.id = ? AND r.expires_at > ? AND c.revoked_at IS NULL`).get(requestId, nowIso()) as
    { id: string; clientName: string; redirectUri: string; scopes: string } | undefined;
}

export function authorizeWithPassword(requestId: string, email: string, password: string) {
  const database = getDatabase();
  const request = database.prepare("SELECT * FROM oauth_requests WHERE id = ? AND expires_at > ?").get(requestId, nowIso()) as RequestRow | undefined;
  if (!request) throw new Error("Solicitação OAuth expirada ou inválida.");
  const user = authenticateUser(email, password);
  if (!user) throw new Error("E-mail ou senha incorretos.");
  const rawCode = token(); const timestamp = nowIso(); const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  database.transaction(() => {
    database.prepare(`INSERT INTO oauth_authorization_codes
      (id, code_hash, user_id, client_id, redirect_uri, code_challenge, scopes, resource, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), hash(rawCode), user.id, request.client_id, request.redirect_uri, request.code_challenge, request.scopes, request.resource, expiresAt, timestamp);
    database.prepare("DELETE FROM oauth_requests WHERE id = ?").run(requestId);
  })();
  const redirect = new URL(request.redirect_uri);
  redirect.searchParams.set("code", rawCode);
  if (request.state) redirect.searchParams.set("state", request.state);
  return redirect.toString();
}

function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(actual); const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

function issueTokens(userId: string, clientId: string, scopes: string, resource: string) {
  const accessToken = token(); const refreshToken = token(); const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const database = getDatabase();
  database.prepare(`INSERT INTO oauth_tokens
    (id, user_id, client_id, access_token_hash, refresh_token_hash, scopes, resource,
     expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), userId, clientId, hash(accessToken), hash(refreshToken), scopes, resource, expiresAt, refreshExpiresAt, timestamp);
  database.prepare("UPDATE oauth_clients SET last_authorized_at = ? WHERE id = ?").run(timestamp, clientId);
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refreshToken, scope: scopes, resource };
}

export function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string }) {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM oauth_authorization_codes WHERE code_hash = ?").get(hash(input.code)) as CodeRow | undefined;
  const client = database.prepare("SELECT revoked_at FROM oauth_clients WHERE id = ?").get(input.clientId) as { revoked_at: string | null } | undefined;
  if (!row || !client || client.revoked_at || row.used_at || row.expires_at <= nowIso() || row.client_id !== input.clientId || row.redirect_uri !== input.redirectUri) throw new Error("Código OAuth inválido ou expirado.");
  if ((input.resource || row.resource) !== row.resource || !pkceMatches(input.codeVerifier, row.code_challenge)) throw new Error("Validação PKCE/resource falhou.");
  return database.transaction(() => {
    database.prepare("UPDATE oauth_authorization_codes SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return issueTokens(row.user_id, row.client_id, row.scopes, row.resource);
  })();
}

export function refreshAccessToken(input: { refreshToken: string; clientId: string; scope?: string; resource?: string }) {
  const database = getDatabase();
  const row = database.prepare(`SELECT ot.* FROM oauth_tokens ot
    JOIN oauth_clients oc ON oc.id = ot.client_id
    WHERE ot.refresh_token_hash = ? AND ot.revoked_at IS NULL AND oc.revoked_at IS NULL
    AND ot.refresh_expires_at > ?`).get(hash(input.refreshToken), nowIso()) as TokenRow | undefined;
  if (!row || row.client_id !== input.clientId || (input.resource && input.resource !== row.resource)) throw new Error("Refresh token inválido ou expirado.");
  const requested = input.scope ? assertScopes(input.scope) : row.scopes;
  const granted = new Set(splitScopes(row.scopes));
  if (splitScopes(requested).some((scope) => !granted.has(scope))) throw new Error("O refresh não pode ampliar escopos.");
  return database.transaction(() => {
    database.prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE id = ?").run(nowIso(), row.id);
    return issueTokens(row.user_id, row.client_id, requested, row.resource);
  })();
}

export function resolveAccessToken(rawToken: string): { user: LocalAuthUser; scopes: string[]; resource: string; clientId: string } | null {
  const database = getDatabase();
  const row = database.prepare(`SELECT ot.user_id, ot.client_id, ot.scopes, ot.resource, u.id, u.email, u.display_name, u.role
    FROM oauth_tokens ot
    JOIN users u ON u.id = ot.user_id
    JOIN oauth_clients oc ON oc.id = ot.client_id
    WHERE ot.access_token_hash = ? AND ot.revoked_at IS NULL AND oc.revoked_at IS NULL AND ot.expires_at > ?`)
    .get(hash(rawToken), nowIso()) as { user_id: string; client_id: string; scopes: string; resource: string; id: string; email: string; display_name: string; role: "admin" | "user" } | undefined;
  if (!row || row.resource !== getMcpResourceUrl()) return null;
  database.prepare("UPDATE oauth_clients SET last_used_at = ? WHERE id = ?").run(nowIso(), row.client_id);
  return { user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role }, scopes: splitScopes(row.scopes), resource: row.resource, clientId: row.client_id };
}
