import { PageHeading } from "@/components/ui/page-heading";
import type { AdminAuditSummary, McpLogSummary } from "@/lib/local/admin-store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

export function AdminMcpLogsPage({ logs, audits }: { logs: McpLogSummary[]; audits: AdminAuditSummary[] }) {
  return (
    <div className="standard-page admin-page">
      <PageHeading eyebrow="Administração" title="Logs MCP" description="Metadados operacionais locais. Tokens, senhas, segredos e conteúdo de payload não são registrados." />
      <section className="admin-panel">
        <header><div><h2>Chamadas MCP</h2><p>Últimas {logs.length} chamadas autenticadas e execuções de ferramentas.</p></div></header>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Horário</th><th>Usuário</th><th>Ferramenta</th><th>Resultado</th><th>Erro resumido</th></tr></thead><tbody>
          {logs.length ? logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td><strong>{log.user.displayName}</strong><small>{log.user.email}</small></td><td><code>{log.toolName}</code></td><td><span className={`admin-status ${log.success ? "admin-status--ok" : "admin-status--invalid"}`}>{log.success ? "Sucesso" : "Erro"}</span></td><td>{log.errorMessage ?? "—"}</td></tr>) : <tr><td colSpan={5}>Nenhuma chamada MCP registrada.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="admin-panel">
        <header><div><h2>Auditoria administrativa</h2><p>Diagnósticos e alterações sensíveis executados por administradores.</p></div></header>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Horário</th><th>Administrador</th><th>Ação</th><th>Duração</th><th>Resultado</th><th>Erro resumido</th></tr></thead><tbody>
          {audits.length ? audits.map((audit) => <tr key={audit.id}><td>{formatDate(audit.createdAt)}</td><td>{audit.admin.displayName}</td><td><code>{audit.action}</code></td><td>{audit.durationMs} ms</td><td><span className={`admin-status ${audit.success ? "admin-status--ok" : "admin-status--invalid"}`}>{audit.success ? "Sucesso" : "Erro"}</span></td><td>{audit.errorMessage ?? "—"}</td></tr>) : <tr><td colSpan={6}>Nenhuma ação administrativa registrada.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
