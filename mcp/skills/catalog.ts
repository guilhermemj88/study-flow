import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { McpSkillCatalog } from "@/types/mcp-skills";

const skillsDirectory = () => join(process.cwd(), "mcp", "skills");

export interface McpSkill {
  id: string;
  name: string;
  description: string;
  content: string;
}

// These are bundled, maintainer-authored files, never user uploads or paths
// supplied by a client. Support the simple single-line frontmatter used here.
export function readMcpSkills(directory = skillsDirectory()): McpSkill[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const content = readFileSync(join(directory, entry.name, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
      const frontmatter = /^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n/.exec(content);
      const heading = /^# (.+)$/m.exec(content);
      if (!frontmatter || frontmatter[1] !== entry.name || !heading) throw new Error("Catálogo de habilidades inválido.");
      return { id: entry.name, name: heading[1], description: frontmatter[2], content };
    });
}

// Separate from connection state: failure must never block OAuth controls.
export function getMcpSkillCatalog(readSkills: () => McpSkill[] = readMcpSkills): McpSkillCatalog {
  try {
    const skills = readSkills().map(({ name, description }) => ({ name, description }));
    return skills.length ? { status: "available", skills } : { status: "unavailable", skills: [] };
  } catch {
    return { status: "unavailable", skills: [] };
  }
}
