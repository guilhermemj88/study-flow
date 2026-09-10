import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiIntegrationsPage } from "../src/components/ai/ai-integrations-page";
import { ChatGptPromptsPage } from "../src/components/chatgpt/chatgpt-prompts-page";
import { getMcpSkillCatalog } from "../mcp/skills/catalog";
import type { AiIntegrationOverview } from "../src/types/ai-integration";
import type { McpSkillCatalog } from "../src/types/mcp-skills";

const overview: AiIntegrationOverview = {
  identity: { displayName: "Conta de teste", email: "conta@example.test" },
  mode: "mcp",
  studyFlowAi: { available: true, providerLabel: "Study Flow AI", model: "modelo-interno", reason: null },
  allowExternalAiProcessing: false,
  mcp: { publicUrl: "https://mcp-study-flow.gmjtelecom.com.br/mcp", endpointState: "configured", status: "connected", authorizedClients: 2, lastAuthenticatedAt: "2026-09-09T12:00:00.000Z" },
};

function render(catalog: McpSkillCatalog, initialOverview = overview) {
  return renderToStaticMarkup(createElement(AiIntegrationsPage, { initialOverview, skillCatalog: catalog }));
}

test("/ia renderiza habilidades do catálogo depois da conexão e antes dos guias", () => {
  const catalog = getMcpSkillCatalog();
  assert.equal(catalog.status, "available");
  assert.equal(catalog.skills.length, 5);
  const html = render(catalog);
  assert.ok(html.indexOf('id="mcp-heading"') < html.indexOf('id="mcp-skills-heading"'));
  assert.ok(html.indexOf('id="mcp-skills-heading"') < html.indexOf('id="connection-guide-heading"'));
  for (const skill of catalog.skills) {
    assert.ok(html.includes(skill.name));
    assert.ok(html.includes(skill.description));
  }
  assert.ok(html.includes("quando suportada pelo cliente"));
  assert.ok(!html.includes("SKILL.md"));
  assert.ok(!html.includes("modelo-interno"));
  assert.equal((html.match(/Disponível<\/span>/g) ?? []).length, 5);
  // The component renders the received catalog, including future additions.
  const changed = render({ status: "available", skills: [{ name: "Nova habilidade", description: "Novo fluxo disponível." }] });
  assert.ok(changed.includes("Nova habilidade"));
  assert.ok(!changed.includes("Gerenciar calendário BASIC"));
});

test("catálogo indisponível mantém conta, URL, status e controles OAuth visíveis", () => {
  for (const catalog of [{ status: "unavailable", skills: [] }, { status: "available", skills: [] }] satisfies McpSkillCatalog[]) {
    const html = render(catalog);
    for (const text of ["Habilidades não puderam ser consultadas agora", overview.identity.displayName, overview.identity.email, overview.mcp.publicUrl!, "Conexão MCP confirmada", "Última confirmação", "2 cliente(s)", "Atualizar estado", "Revogar meus acessos MCP", "não representa monitoramento contínuo"]) {
      assert.ok(html.includes(text), text);
    }
  }
  const html = render(getMcpSkillCatalog(), { ...overview, identity: { displayName: "Outra conta", email: "outra@example.test" }, mcp: { ...overview.mcp, publicUrl: null, endpointState: "unavailable", status: "not_connected", authorizedClients: 0, lastAuthenticatedAt: null } });
  assert.ok(html.includes("Outra conta"));
  assert.ok(!html.includes(overview.identity.email));
  assert.ok(!html.includes(overview.mcp.publicUrl!));
  assert.ok(!html.includes("Conexão MCP confirmada"));
});

test("guias ChatGPT, Claude e cliente genérico preservam conexão e oferecem fallback manual", () => {
  const html = render(getMcpSkillCatalog());
  for (const client of ["ChatGPT", "Claude"]) {
    assert.ok(html.includes(`Depois de conectar, o ${client} pode usar as ferramentas do Study Flow e, quando houver suporte no cliente, consultar as Skills disponíveis`));
  }
  for (const text of ["<summary>ChatGPT</summary>", "<summary>Claude</summary>", "Qualquer cliente MCP compatível", "Streamable HTTP", "PKCE S256", "Dynamic Client Registration", "callback HTTPS", "studyflow:read", "studyflow:write", "Compatibilidade / Prompts manuais", 'href="/chatgpt"', "Tokens pessoais / Personal Access Tokens", "Indisponíveis nesta versão"]) assert.ok(html.includes(text), text);
  const prompts = renderToStaticMarkup(createElement(ChatGptPromptsPage));
  for (const text of ["Analisar fontes", "Gerar plano", "Recalcular plano", "Revisões", "Não grave o plano até eu confirmar", "preservando todas as atividades concluídas", 'href="/ia"', "Copiar prompt"]) assert.ok(prompts.includes(text), text);
});

test("catálogo MCP não invade os modos Sem IA e IA do Study Flow", () => {
  for (const mode of ["none", "study_flow"] as const) {
    const html = render(getMcpSkillCatalog(), { ...overview, mode });
    assert.ok(!html.includes('id="mcp-skills-heading"'));
    assert.ok(!html.includes('href="/chatgpt"'));
    assert.ok(html.includes("Revogar meus acessos MCP"));
    assert.equal(html.includes("Testar disponibilidade"), mode === "study_flow");
    assert.equal(html.includes("modelo-interno"), mode === "study_flow");
  }
});
