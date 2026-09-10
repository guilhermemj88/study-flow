import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { readMcpSkills, type McpSkill } from "./catalog";

export function registerMcpSkills(server: McpServer, readSkills: () => McpSkill[] = readMcpSkills) {
  const read = () => {
    try { return readSkills(); }
    catch { throw new Error("Habilidades não puderam ser consultadas agora."); }
  };
  const get = (id: string) => {
    const skill = read().find((item) => item.id === id);
    if (!skill) throw new Error("Habilidade não encontrada.");
    return skill;
  };
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("list_skills", {
    title: "Consultar habilidades do Study Flow",
    description: "Lista os fluxos recomendados. Consulte get_skill antes de executar um desses fluxos.",
    inputSchema: {}, annotations,
  }, () => ({ content: [{ type: "text", text: JSON.stringify({ skills: read().map(({ id, name, description }) => ({ id, name, description })) }) }] }));
  server.registerTool("get_skill", {
    title: "Consultar instruções de uma habilidade",
    description: "Lê uma habilidade oficial pelo identificador retornado no catálogo. Não executa nem autoriza gravações.",
    inputSchema: { id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64) }, annotations,
  }, ({ id }) => ({ content: [{ type: "text", text: get(id).content }] }));

  // MCP resources offer discovery to supporting clients; this does not assert
  // universal/native Skills support. The tools above are the explicit fallback.
  let skills: McpSkill[];
  try { skills = readSkills(); } catch { return; }
  for (const skill of skills) {
    server.registerResource(skill.id, `studyflow://skills/${skill.id}`, {
      title: skill.name, description: skill.description, mimeType: "text/markdown",
    }, (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: get(skill.id).content }] }));
  }
}
