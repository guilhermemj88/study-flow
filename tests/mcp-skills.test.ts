import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getMcpSkillCatalog, readMcpSkills, type McpSkill } from "../mcp/skills/catalog";
import { registerMcpSkills } from "../mcp/skills/register";

test("catálogo da interface deriva das habilidades oficiais e só contém metadados públicos", () => {
  const skills = readMcpSkills();
  assert.equal(skills.length, 5);
  const catalog = getMcpSkillCatalog();
  assert.equal(catalog.status, "available");
  assert.deepEqual(catalog.skills, skills.map(({ name, description }) => ({ name, description })));
  for (const skill of catalog.skills) assert.deepEqual(Object.keys(skill).sort(), ["description", "name"]);
});

test("catálogo vazio, ausente ou inválido retorna indisponibilidade sem expor erro interno", () => {
  const directory = mkdtempSync(join(tmpdir(), "study-flow-skills-"));
  try {
    assert.equal(getMcpSkillCatalog(() => readMcpSkills(directory)).status, "unavailable");
    mkdirSync(join(directory, "broken"));
    writeFileSync(join(directory, "broken", "SKILL.md"), "conteúdo inválido");
    assert.equal(getMcpSkillCatalog(() => readMcpSkills(directory)).status, "unavailable");
    assert.deepEqual(getMcpSkillCatalog(() => readMcpSkills(join(directory, "missing"))), { status: "unavailable", skills: [] });
    assert.deepEqual(getMcpSkillCatalog(() => { throw new Error("/private/path?secret=value"); }), { status: "unavailable", skills: [] });
  } finally {
    assert.ok(!relative(tmpdir(), directory).startsWith(".."));
    rmSync(directory, { recursive: true, force: true });
  }
});

async function withClient(readSkills: () => McpSkill[], run: (client: Client) => Promise<void>) {
  const server = new McpServer({ name: "skills-test", version: "1.0.0" });
  registerMcpSkills(server, readSkills);
  server.registerTool("existing_tool", { inputSchema: {} }, () => ({ content: [{ type: "text", text: "ok" }] }));
  const client = new Client({ name: "skills-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("MCP permite descobrir recursos e consultar habilidades via tools sem aceitar caminhos de arquivos", async () => {
  await withClient(readMcpSkills, async (client) => {
    const list = await client.callTool({ name: "list_skills", arguments: {} });
    assert.ok(!list.isError);
    const block = (list.content as Array<{ type: string; text: string }>)[0];
    const catalog = JSON.parse(block.text);
    assert.equal(catalog.skills.length, 5);
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 5);
    for (const skill of readMcpSkills()) {
      const result = await client.callTool({ name: "get_skill", arguments: { id: skill.id } });
      assert.deepEqual(result.content, [{ type: "text", text: skill.content }]);
      const resource = await client.readResource({ uri: `studyflow://skills/${skill.id}` });
      assert.ok("text" in resource.contents[0]);
      assert.equal(resource.contents[0].text, skill.content);
    }
    for (const id of ["unknown", "../oauth", "C:/private", "analisar-fontes/SKILL.md"]) {
      assert.equal((await client.callTool({ name: "get_skill", arguments: { id } })).isError, true);
    }
  });
});

test("falha do catálogo não impede outras tools MCP e permite recuperar consulta posteriormente", async () => {
  let available = false;
  await withClient(() => {
    if (!available) throw new Error("secret internal path");
    return readMcpSkills();
  }, async (client) => {
    const failure = await client.callTool({ name: "list_skills", arguments: {} });
    assert.equal(failure.isError, true);
    assert.ok(!JSON.stringify(failure).includes("secret internal path"));
    assert.ok(!(await client.callTool({ name: "existing_tool", arguments: {} })).isError);
    available = true;
    assert.ok(!(await client.callTool({ name: "list_skills", arguments: {} })).isError);
  });
});
