"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Cable, Check, Copy, ExternalLink, KeyRound, RefreshCw, ShieldCheck, Sparkles, Unplug, UserRound } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import { StudyFlowAiPanel } from "@/components/ai/study-flow-ai-panel";
import type { AiIntegrationOverview, AiMode, McpConnectionStatus } from "@/types/ai-integration";

const modes = [
  { value: "study_flow", title: "IA do Study Flow", description: "Execute tarefas de estudo pela IA integrada ao aplicativo.", icon: Sparkles, disabled: false },
  { value: "mcp", title: "Minha IA via MCP", description: "Conecte ChatGPT, Claude ou outro cliente à sua conta.", icon: Cable, disabled: false },
  { value: "none", title: "Sem IA", description: "Organize seus estudos manualmente, sem precisar conectar uma IA.", icon: Unplug, disabled: false },
] satisfies Array<{ value: AiMode; title: string; description: string; icon: typeof Bot; disabled: boolean }>;

const statuses: Record<McpConnectionStatus, { title: string; description: string }> = {
  not_connected: { title: "Não conectada", description: "Adicione a URL à sua IA e conclua o login do Study Flow para autorizar o acesso." },
  authorized: { title: "Autorizada · aguardando uso", description: "Sua autorização OAuth está ativa. Ative o Study Flow na sua IA e faça uma consulta para confirmar a conexão." },
  connected: { title: "Conexão confirmada", description: "Há uma autorização ativa e uma chamada MCP autenticada confirmada para sua conta. Isso não é um teste de disponibilidade em tempo real." },
  inactive: { title: "Autorização inativa", description: "O acesso anterior expirou, foi revogado ou pertence a um endereço anterior. Reconecte o Study Flow na sua IA." },
};

async function requestOverview(body?: object): Promise<AiIntegrationOverview> {
  const response = await fetch("/api/integrations/ai", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) window.location.replace("/login");
  if (!response.ok) throw new Error("Não foi possível atualizar sua integração. Tente novamente.");
  return response.json();
}

export function AiIntegrationsPage({ initialOverview }: { initialOverview: AiIntegrationOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const { mcp, identity, mode } = overview;
  const status = statuses[mcp.status];

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function update(body?: object) {
    setBusy(true);
    setFeedback(null);
    try {
      setOverview(await requestOverview(body));
      setConfirmDisconnect(false);
      setFeedback({ text: body ? "Preferência e autorizações atualizadas para sua conta." : "Estado da integração atualizado." });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Não foi possível salvar.", error: true });
    } finally { setBusy(false); }
  }

  async function copyUrl() {
    if (!mcp.publicUrl) return;
    try {
      await navigator.clipboard.writeText(mcp.publicUrl);
      setCopied(true);
      setFeedback({ text: "URL copiada. Cole no campo de servidor MCP da sua IA." });
    } catch {
      setFeedback({ text: "O navegador não permitiu copiar. Selecione a URL no campo e copie manualmente.", error: true });
    }
  }

  function accessControls() {
    if (!mcp.authorizedClients) return null;
    return (
      <div className="ai-access-controls">
        <p>{mcp.authorizedClients} cliente(s) com autorização ativa nesta conta. Revogar encerra esses acessos; você poderá conectar novamente pelo OAuth.</p>
        {confirmDisconnect ? (
          <div className="ai-revoke-confirm" role="group" aria-label="Confirmar revogação">
            <strong>Revogar todos os meus acessos MCP?</strong>
            <p>As IAs conectadas precisarão de um novo login. Seus estudos serão preservados.</p>
            <div className="ai-actions">
              <button className="button button--ghost" disabled={busy} onClick={() => void update({ action: "disconnect" })} type="button">Confirmar revogação</button>
              <button className="button button--ghost" disabled={busy} onClick={() => setConfirmDisconnect(false)} type="button">Cancelar</button>
            </div>
          </div>
        ) : <button className="button button--ghost" disabled={busy} onClick={() => setConfirmDisconnect(true)} type="button"><Unplug size={16} /> Revogar meus acessos MCP</button>}
      </div>
    );
  }

  return (
    <div className="standard-page ai-page">
      <PageHeading eyebrow="Sua conta, sua escolha" title="IA / Integrações" description="Escolha como a inteligência artificial participa dos seus estudos." />

      <fieldset className="ai-mode-picker" disabled={busy}>
        <legend>Como você quer usar IA?</legend>
        <div className="ai-mode-grid">
          {modes.map((option) => {
            const Icon = option.icon;
            const unavailable = option.value === "study_flow" && !overview.studyFlowAi.available;
            return (
              <label className={`ai-mode-card ${mode === option.value ? "ai-mode-card--selected" : ""} ${unavailable ? "ai-mode-card--disabled" : ""}`} key={option.value}>
                <div><Icon size={22} /><input aria-describedby={`ai-mode-${option.value}`} checked={mode === option.value} disabled={unavailable} name="ai-mode" onChange={() => void update({ action: "set_mode", mode: option.value })} type="radio" value={option.value} /></div>
                <strong>{option.title}</strong>
                <p id={`ai-mode-${option.value}`}>{option.description}</p>
                {option.value === "study_flow" ? <small>{unavailable ? "Indisponível no momento." : "Disponível"}</small> : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="ai-preference-note">Sua escolha é salva nesta conta. Para usar sua própria IA via MCP, a autorização de acesso acontece separadamente, pelo OAuth.</p>
      {feedback ? <p className={`ai-feedback ${feedback.error ? "ai-feedback--error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}

      {mode === "study_flow" ? (
        <>
          <StudyFlowAiPanel availability={overview.studyFlowAi} allowExternalAiProcessing={overview.allowExternalAiProcessing} saving={busy} onPrivacyChange={(allowed) => void update({ action: "set_privacy", allowExternalAiProcessing: allowed })} />
          {mcp.authorizedClients ? <section className="ai-panel"><h2>Seus acessos MCP</h2><p>Suas autorizações MCP anteriores continuam sob seu controle.</p>{accessControls()}</section> : null}
        </>
      ) : mode === "mcp" ? (
        <>
          <section className="ai-panel" aria-labelledby="mcp-heading">
            <header className="ai-panel-heading"><div><h2 id="mcp-heading">Conectar minha IA via MCP</h2><p>Use sua IA para consultar seus estudos e salvar alterações conforme as permissões autorizadas.</p></div><span className="ai-badge"><ShieldCheck size={14} /> OAuth individual</span></header>
            <div className="ai-identity"><UserRound size={20} /><div><strong>{identity.displayName}</strong><span>{identity.email}</span></div></div>
            <p>A autenticação é individual. No login do Study Flow aberto pela sua IA, entre com <strong>{identity.email}</strong>. É essa conta que determina quais dados a IA pode acessar.</p>
            <label className="ai-url-label" htmlFor="mcp-public-url">URL pública do MCP</label>
            <div className="ai-url-row">
              <input id="mcp-public-url" onFocus={(event) => event.target.select()} readOnly value={mcp.publicUrl ?? "URL pública indisponível"} />
              <button className="button button--primary" disabled={!mcp.publicUrl} onClick={() => void copyUrl()} type="button">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar URL"}</button>
            </div>
            <p className="ai-help">O endereço é o mesmo para todos. Cada pessoa autoriza o acesso à própria conta.</p>
            {mcp.endpointState === "unavailable" ? <p className="ai-feedback ai-feedback--error" role="status">Esta instalação ainda não tem uma URL pública HTTPS válida para conexão. Quando ela estiver disponível, aparecerá aqui. Você pode consultar as instruções abaixo.</p> : null}
            <div className="ai-connection-state" aria-live="polite">
              <div><strong>{status.title}</strong><p>{status.description}</p>{mcp.lastAuthenticatedAt ? <small>Última confirmação: <time dateTime={mcp.lastAuthenticatedAt}>{new Date(mcp.lastAuthenticatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)</time></small> : null}</div>
              <button className="button button--ghost" disabled={busy} onClick={() => void update()} type="button"><RefreshCw size={16} /> {busy ? "Atualizando…" : "Atualizar estado"}</button>
            </div>
            {accessControls()}
          </section>

          <section className="ai-panel ai-guides" aria-labelledby="connection-guide-heading">
            <h2 id="connection-guide-heading">Como conectar</h2>
            <p>Copie a URL, adicione o Study Flow na sua IA e conclua o login OAuth. Você faz a conexão com sua própria conta.</p>
            <details open>
              <summary>ChatGPT</summary>
              <ol>
                <li>No ChatGPT, abra Configurações → Segurança e login e habilite o modo de desenvolvedor, quando disponível.</li>
                <li>Abra Plugins, use o botão de adicionar e dê à conexão o nome Study Flow. Cole a URL pública completa no campo de servidor MCP.</li>
                <li>Use OAuth e conclua o login do Study Flow com o e-mail mostrado acima. Revise as permissões solicitadas.</li>
                <li>Em uma conversa, ative Study Flow no menu de ferramentas e peça: “Consulte meu calendário de estudos, sem fazer alterações”.</li>
              </ol>
              <p>A disponibilidade depende da sua conta e das regras do workspace no ChatGPT.</p>
              <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" rel="noreferrer" target="_blank">Guia oficial do ChatGPT <ExternalLink size={13} /></a>
            </details>
            <details>
              <summary>Claude</summary>
              <ol>
                <li>Abra Personalizar (Customize) → Conectores (Connectors).</li>
                <li>Use “+” → Adicionar conector personalizado. Informe Study Flow e cole a URL pública do MCP.</li>
                <li>Adicione o conector e clique em Conectar. Conclua o OAuth com sua conta Study Flow; deixe os campos opcionais de Client ID e segredo vazios.</li>
                <li>Ative Study Flow nos conectores da conversa e peça uma consulta ao seu calendário.</li>
              </ol>
              <p>Em contas Team e Enterprise, o proprietário do workspace pode precisar disponibilizar o conector antes do seu login individual.</p>
              <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" rel="noreferrer" target="_blank">Guia oficial do Claude <ExternalLink size={13} /></a>
            </details>
            <details>
              <summary>Qualquer cliente MCP compatível</summary>
              <p>Preencha os campos equivalentes no seu cliente. O formato do arquivo de configuração varia entre aplicativos.</p>
              <dl className="ai-client-config">
                <div><dt>Nome</dt><dd>Study Flow</dd></div>
                <div><dt>URL do servidor</dt><dd>{mcp.publicUrl ?? "Aguardando URL pública"}</dd></div>
                <div><dt>Transporte</dt><dd>Streamable HTTP</dd></div>
                <div><dt>Autenticação</dt><dd>OAuth 2.1 · Authorization Code com PKCE S256</dd></div>
                <div><dt>Registro de cliente</dt><dd>Automático (Dynamic Client Registration), com callback HTTPS</dd></div>
                <div><dt>Permissões</dt><dd><code>studyflow:read</code> para consultar; <code>studyflow:write</code> para salvar alterações</dd></div>
              </dl>
              <p>Use a descoberta automática de autenticação e o registro de cliente público (sem segredo). Conclua o login no navegador. Clientes sem suporte a OAuth ainda não podem se conectar.</p>
            </details>
            <details>
              <summary>Confirmar a conexão ou resolver um problema</summary>
              <ul>
                <li>Após o login, ative o conector na conversa, faça uma consulta e volte aqui para “Atualizar estado”. Só copiar a URL não conecta sua conta.</li>
                <li>Se a autorização estiver inativa, reconecte pela sua IA e faça o login novamente.</li>
                <li>Se não aparecerem seus estudos, confira o e-mail usado no OAuth e refaça a conexão com a conta exibida nesta tela.</li>
                <li>Se a IA não alcançar o serviço, confira a URL completa e tente novamente mais tarde. Acessar a URL diretamente no navegador pode pedir autenticação; isso é esperado.</li>
              </ul>
              <Link href="/chatgpt">Ver sugestões de prompts</Link>
            </details>
          </section>

          <section className="ai-panel ai-future-auth" aria-labelledby="personal-tokens-heading">
            <KeyRound size={20} /><div><h2 id="personal-tokens-heading">Tokens pessoais / Personal Access Tokens</h2><p>Indisponíveis nesta versão. Esta opção poderá atender clientes sem OAuth no futuro. Por enquanto, conecte usando OAuth individual.</p></div>
          </section>
        </>
      ) : (
        <section className="ai-panel">
          <h2>Seus estudos seguem com você</h2>
          <p>Você pode planejar, cadastrar atividades e acompanhar seu progresso sem conectar uma IA. Para ver o guia de conexão, selecione “Minha IA via MCP”.</p>
          {mcp.authorizedClients ? <p className="ai-feedback">Selecionar “Sem IA” salva sua preferência, mas as autorizações MCP anteriores continuam ativas até você revogá-las abaixo.</p> : null}
          {accessControls()}
        </section>
      )}
    </div>
  );
}
