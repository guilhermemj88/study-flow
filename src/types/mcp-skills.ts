// Public metadata only: skill instructions remain on the MCP backend.
export interface McpSkillSummary {
  name: string;
  description: string;
}

export type McpSkillCatalog =
  | { status: "available"; skills: McpSkillSummary[] }
  | { status: "unavailable"; skills: [] };
