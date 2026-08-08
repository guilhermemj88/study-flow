"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CheckCircle2, Clipboard, ExternalLink, FlaskConical, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import type { AdminAuditSummary, OAuthClientSummary } from "@/lib/local/admin-store";
import type { DiagnosticCheck, McpEndpointDiagnostics } from "@/lib/local/mcp-diagnostics";

interface Overview {
  diagnostics: McpEndpointDiagnostics;
  clients: OAuthClientSummary[];
  diagnosticAudits: AdminAuditSummary[];
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nunca";
}

function Status({ check }: { check: DiagnosticCheck }) {
  return <span className={`admin-status admin-status--${check.ok ? "ok" : check.state}`}>{check.ok ? "OK" : check.state === "not_configured" ? "Não configurado" : check.state === "offline" ? "Offline" : "Atenção"}</span>;
}

async function post<T>(path: string): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { method: "POST" });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "A operação falhou.");
  return data;
}

export function AdminChatGptPage({ initialOverview }: { initialOverview: Overview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível atualizar o painel.");
    setOverview(await response.json() as Overview);
  }

  async function run(action: "endpoint" | "tools" | "read-write") {
    if (action === "read-write" && !window.confirm("Executar uma gravação MCP temporária e removê-la automaticamente ao final?")) return;
    setBusy(action);
    setFeedback(null);
    try {
      if (action === "endpoint") {
        const data = await post<{ diagnostics: McpEndpointDiagnostics }>("diagnostics/endpoint");
        setOverview((current) => ({ ...current, diagnostics: data.diagnostics }));
        setFeedback({ ok: true, text: "Diagnóstico de endpoints concluído." });
      } else {
        const data = await post<{ result: { ok: boolean; detail: string; cleaned?: boolean } }>(`diagnostics/${action}`);
        setFeedback({ ok: data.result.ok, text: data.result.detail });
      }
      await refresh();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "O teste falhou." });
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setFeedback({ ok: true, text: "Endpoint copiado." });
  }

  async function connectChatGpt() {
    if (!overview.diagnostics.publicEndpoint || !overview.diagnostics.publicAccess.ok) {
      setFeedback({ ok: false, text: "Configure e valide primeiro um endpoint MCP público por HTTPS." });
      return;
    }
    await copy(overview.diagnostics.publicEndpoint);
    window.open("https://chatgpt.com/plugins", "_blank", "noopener,noreferrer");
    setFeedback({ ok: true, text: "Endpoint copiado. Conclua o cadastro e o OAuth na página do ChatGPT que foi aberta." });
  }

  async function revoke(client: OAuthClientSummary) {
    if (!window.confirm(`Revogar ${client.name}? Os tokens deste cliente deixarão de funcionar.`)) return;
    setBusy(client.id);
    try {
      await post(`oauth-clients/${encodeURIComponent(client.id)}/revoke`);
      await refresh();
      setFeedback({ ok: true, text: "Cliente OAuth revogado e tokens invalidados." });
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "Não foi possível revogar." });
    } finally {
      setBusy(null);
    }
  }

  const { diagnostics } = overview;
  return (
    <div className="standard-page admin-page">
      <PageHeading
        eyebrow="Administração"
        title="ChatGPT Business e MCP"
        description="Configure e valide a ponte HTTPS. O aplicativo, o SQLite e os uploads permanecem locais."
        action={<button className="button button--primary" onClick={() => void connectChatGpt()} type="button"><Bot size={16} /> Conectar ao ChatGPT</button>}
      />

      {feedback ? <div className={`admin-feedback ${feedback.ok ? "admin-feedback--ok" : "admin-feedback--error"}`} role="status">{feedback.ok ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}{feedback.text}</div> : null}

      <section className="admin-status-grid" aria-label="Status da integração">
        {[
          ["SQLite local", diagnostics.sqlite],
          ["Servidor MCP", diagnostics.server],
          ["OAuth 2.1 + PKCE", diagnostics.oauth],
          ["Túnel HTTPS", diagnostics.tunnel],
          ["Acesso público", diagnostics.publicAccess],
        ].map(([label, check]) => <article className="admin-status-card" key={label as string}><div><strong>{label as string}</strong><Status check={check as DiagnosticCheck} /></div><p>{(check as DiagnosticCheck).detail}</p></article>)}
        <article className="admin-status-card admin-status-card--chatgpt">
          <div><strong>ChatGPT</strong><span className={`admin-status ${diagnostics.chatGpt.connected ? "admin-status--ok" : "admin-status--not_configured"}`}>{diagnostics.chatGpt.connected ? "Conectado" : "Sem evidência"}</span></div>
          <p>{diagnostics.chatGpt.connected ? "Cliente registrado, autorização ativa e chamada MCP autenticada confirmadas." : "Só será marcado como conectado após registro, OAuth e uma chamada MCP autenticada reais."}</p>
        </article>
      </section>

      <section className="admin-panel">
        <header><div><h2>Endpoints</h2><p>O 401 no endpoint MCP sem credenciais é o resultado seguro esperado.</p></div></header>
        <div className="endpoint-list">
          <div><span>Local</span><code>{diagnostics.localEndpoint}</code><button aria-label="Copiar endpoint local" className="icon-button" onClick={() => void copy(diagnostics.localEndpoint)} type="button"><Clipboard size={15} /></button></div>
          <div><span>Público HTTPS</span><code>{diagnostics.publicEndpoint ?? "Ainda não configurado"}</code><button aria-label="Copiar endpoint público" className="icon-button" disabled={!diagnostics.publicEndpoint} onClick={() => void copy(diagnostics.publicEndpoint)} type="button"><Clipboard size={15} /></button></div>
        </div>
        <div className="admin-actions">
          <button className="button button--ghost" onClick={() => void copy(diagnostics.publicEndpoint ?? diagnostics.localEndpoint)} type="button"><Clipboard size={15} /> Copiar endpoint</button>
          <button className="button button--primary" disabled={Boolean(busy)} onClick={() => void run("endpoint")} type="button"><RefreshCw size={15} /> {busy === "endpoint" ? "Testando…" : "Testar MCP"}</button>
          <button className="button button--ghost" disabled={Boolean(busy)} onClick={() => void run("tools")} type="button"><KeyRound size={15} /> Testar ferramentas</button>
          <button className="button button--ghost" disabled={Boolean(busy)} onClick={() => void run("read-write")} type="button"><FlaskConical size={15} /> Testar leitura e escrita</button>
          <a className="button button--ghost" href="#instrucoes">Ver instruções</a>
          <Link className="button button--ghost" href="/admin/mcp-logs">Ver logs</Link>
        </div>
      </section>

      <section className="admin-panel" id="instrucoes">
        <header><div><h2>Como conectar no ChatGPT Business</h2><p>Fluxo guiado; a confirmação final acontece no ChatGPT.</p></div><a className="button button--ghost" href="https://chatgpt.com/plugins" rel="noreferrer" target="_blank"><ExternalLink size={15} /> Abrir ChatGPT</a></header>
        <ol className="admin-steps">
          <li>Inicie o Study Flow e o servidor MCP local.</li>
          <li>Inicie o túnel HTTPS e defina <code>MCP_PUBLIC_URL</code> com a origem pública.</li>
          <li>No ChatGPT, ative o Modo de desenvolvedor em Configurações → Segurança e login, se a política do workspace permitir.</li>
          <li>Na página Plugins, use o botão de adicionar, informe a URL pública completa terminada em <code>/mcp</code> e escolha OAuth.</li>
          <li>Entre com sua conta local do Study Flow, revise as ferramentas e conclua a autorização.</li>
          <li>Faça uma chamada no ChatGPT e volte a este painel para confirmar a evidência de conexão.</li>
        </ol>
      </section>

      <section className="admin-panel">
        <header><div><h2>Clientes OAuth</h2><p>IDs públicos e metadados operacionais; tokens e segredos nunca são exibidos.</p></div></header>
        <div className="admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Cliente</th><th>ID</th><th>Criado</th><th>Último uso</th><th>Status</th><th /></tr></thead><tbody>
            {overview.clients.length ? overview.clients.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.redirectHosts.join(", ") || "Cliente interno"}</small></td><td><code>{client.id}</code></td><td>{formatDate(client.createdAt)}</td><td>{formatDate(client.lastUsedAt)}</td><td><span className={`admin-status ${client.revokedAt ? "admin-status--invalid" : "admin-status--ok"}`}>{client.revokedAt ? "Revogado" : "Ativo"}</span></td><td><button className="button button--ghost button--small" disabled={Boolean(client.revokedAt) || busy === client.id} onClick={() => void revoke(client)} type="button">Revogar</button></td></tr>) : <tr><td colSpan={6}>Nenhum cliente OAuth registrado.</td></tr>}
          </tbody></table>
        </div>
      </section>

      <section className="admin-panel">
        <header><div><h2>Últimos diagnósticos</h2><p>Horário, administrador, resultado e duração; sem conteúdo de payload.</p></div></header>
        <div className="audit-list">{overview.diagnosticAudits.length ? overview.diagnosticAudits.map((audit) => <div key={audit.id}><span className={`admin-result-dot ${audit.success ? "ok" : "error"}`} /><strong>{audit.action}</strong><span>{audit.admin.displayName}</span><span>{audit.durationMs} ms</span><time>{formatDate(audit.createdAt)}</time></div>) : <p className="admin-empty">Nenhum diagnóstico executado.</p>}</div>
      </section>
    </div>
  );
}
