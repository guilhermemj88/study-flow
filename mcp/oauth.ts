import type { Express, Request } from "express";
import {
  authorizeWithPassword,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  getAuthorizationRequestDetails,
  getMcpPublicBaseUrl,
  getMcpResourceUrl,
  MCP_SCOPES,
  refreshAccessToken,
  registerOAuthClient,
} from "@/lib/local/oauth-store";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

async function readForm(request: Request) {
  // Express may already have consumed the stream for form or JSON bodies.
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return Object.fromEntries(
      Object.entries(request.body).map(([key, value]) => [key, String(value ?? "")]),
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

const attempts = new Map<string, { count: number; resetAt: number }>();
function allowLogin(key: string) {
  const now = Date.now(); const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true; }
  current.count += 1; return current.count <= 20;
}

function oauthError(error: unknown) {
  return { error: "invalid_request", error_description: error instanceof Error ? error.message : "Solicitação OAuth inválida." };
}

function authorizationPage(authorization: { id: string; clientName: string; redirectUri: string; scopes: string }, error?: string) {
  const { id: requestId, clientName, redirectUri, scopes } = authorization;
  const permissions = scopes.split(" ").includes("studyflow:write") ? "leitura e gravação" : "leitura";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar Study Flow</title>
  <style>body{margin:0;background:#f4f5f7;color:#1c2430;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{background:#fff;border:1px solid #dde2e8;border-radius:16px;box-shadow:0 12px 40px #1c24301a;max-width:420px;padding:32px;width:calc(100% - 48px)}h1{font-size:24px;margin:0 0 8px}p{color:#5d6875;line-height:1.5}.notice{background:#f0f6ff;border-radius:10px;padding:12px;font-size:14px}.error{background:#fff0f0;color:#9b1c1c;border-radius:8px;padding:10px}label{display:grid;gap:6px;margin-top:16px;font-weight:600}input{border:1px solid #cbd3dc;border-radius:8px;font:inherit;padding:11px}button{background:#155eef;border:0;border-radius:8px;color:#fff;cursor:pointer;font:inherit;font-weight:700;margin-top:20px;padding:12px;width:100%}small{color:#74808d;display:block;margin-top:16px;line-height:1.4}</style></head>
  <body><main class="card"><h1>Conectar ao Study Flow</h1>
  <p><strong>${escapeHtml(clientName)}</strong> solicita acesso de ${permissions} aos seus estudos.</p>
  <div class="notice">A autenticação é individual. Este cliente acessará os dados da conta Study Flow com a qual você entrar. Confira o e-mail antes de autorizar.</div>
  <p>Aplicativo de destino: <strong>${escapeHtml(redirectUri ? new URL(redirectUri).origin : "Conexão expirada")}</strong></p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(requestId)}">
  <label>E-mail<input autocomplete="username" name="email" required type="email"></label>
  <label>Senha<input autocomplete="current-password" name="password" required type="password"></label>
  <button type="submit">Autorizar conexão</button></form>
  <small>Autorize apenas se você iniciou esta conexão e reconhece o aplicativo de destino.</small></main></body></html>`;
}

export function registerOAuthRoutes(app: Express) {
  const base = getMcpPublicBaseUrl(); const resource = getMcpResourceUrl();
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (_req, res) => res.json({ resource, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: MCP_SCOPES }));
  app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (_req, res) => res.json({
    issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: MCP_SCOPES,
  }));

  app.post("/oauth/register", (req, res) => {
    try {
      const input = req.body as { client_name?: string; redirect_uris?: string[]; token_endpoint_auth_method?: string };
      if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") throw new Error("Somente clientes públicos com token_endpoint_auth_method=none são aceitos.");
      res.set("cache-control", "no-store").status(201).json(registerOAuthClient({ clientName: input.client_name, redirectUris: input.redirect_uris ?? [] }));
    } catch (error) { res.status(400).json(oauthError(error)); }
  });

  app.get("/oauth/authorize", (req, res) => {
    try {
      const query = req.query as Record<string, string | undefined>;
      const authorization = createAuthorizationRequest({ clientId: query.client_id ?? "", redirectUri: query.redirect_uri ?? "", state: query.state, codeChallenge: query.code_challenge ?? "", codeChallengeMethod: query.code_challenge_method ?? "", scope: query.scope, resource: query.resource, responseType: query.response_type });
      res.set({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "x-frame-options": "DENY" }).send(authorizationPage(authorization));
    } catch (error) { res.status(400).json(oauthError(error)); }
  });

  app.post("/oauth/authorize", async (req, res) => {
    let requestId = "";
    try {
      if (!allowLogin(req.ip || req.socket.remoteAddress || "unknown")) { res.status(429).send("Muitas tentativas. Aguarde alguns minutos."); return; }
      const form = await readForm(req);
      requestId = form.request_id ?? "";
      res.redirect(303, authorizeWithPassword(requestId, form.email ?? "", form.password ?? ""));
    } catch (error) {
      res.status(401).set({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).send(authorizationPage(getAuthorizationRequestDetails(requestId) ?? { id: "", clientName: "Cliente MCP", redirectUri: "", scopes: "" }, error instanceof Error ? error.message : "Não foi possível autorizar."));
    }
  });

  app.post("/oauth/token", async (req, res) => {
    res.set("cache-control", "no-store");
    try {
      const form = await readForm(req);
      if (form.grant_type === "authorization_code") {
        res.json(exchangeAuthorizationCode({ code: form.code ?? "", clientId: form.client_id ?? "", redirectUri: form.redirect_uri ?? "", codeVerifier: form.code_verifier ?? "", resource: form.resource })); return;
      }
      if (form.grant_type === "refresh_token") {
        res.json(refreshAccessToken({ refreshToken: form.refresh_token ?? "", clientId: form.client_id ?? "", scope: form.scope, resource: form.resource })); return;
      }
      throw new Error("grant_type não suportado.");
    } catch (error) { res.status(400).json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "Token inválido." }); }
  });
}
