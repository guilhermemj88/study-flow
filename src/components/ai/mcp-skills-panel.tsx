import { Check } from "lucide-react";
import type { McpSkillCatalog } from "@/types/mcp-skills";

export function McpSkillsPanel({ catalog }: { catalog: McpSkillCatalog }) {
  return (
    <section className="ai-panel" aria-labelledby="mcp-skills-heading">
      <h2 id="mcp-skills-heading">Habilidades disponíveis</h2>
      <p>O Study Flow pode ensinar à sua IA como executar os principais fluxos usando as ferramentas MCP corretas.</p>
      <div className="ai-mcp-architecture">
        <p>Minha IA <span aria-hidden="true">→</span> Study Flow MCP</p>
        <dl>
          <div><dt>Tools · ferramentas</dt><dd>O que a IA pode fazer nos seus estudos.</dd></div>
          <div><dt>Skills · habilidades</dt><dd>Como usar essas ferramentas nos fluxos recomendados.</dd></div>
        </dl>
      </div>
      {catalog.status === "available" && catalog.skills.length > 0 ? (
        <ul className="ai-skills-grid">
          {catalog.skills.map((skill) => (
            <li key={skill.name}>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <span className="ai-badge"><Check size={14} aria-hidden="true" /> Disponível</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ai-feedback" role="status">Habilidades não puderam ser consultadas agora. As ferramentas MCP continuam disponíveis normalmente.</p>
      )}
      <p className="ai-help">Clientes compatíveis podem descobrir essas habilidades automaticamente. Em clientes sem suporte a Skills, use os prompts manuais disponíveis abaixo.</p>
    </section>
  );
}
