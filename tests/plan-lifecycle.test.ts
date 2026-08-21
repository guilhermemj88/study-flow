import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { DELETE as deleteData } from "../src/app/api/data/[...path]/route";
import { createUser, createUserSession } from "../src/lib/local/auth-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { LocalQuestionStore } from "../src/lib/local/question-store";
import { LocalSourceStore } from "../src/lib/local/source-store";
import { LocalStudyStore } from "../src/lib/local/study-store";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-plan-lifecycle-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

function account(label: string) {
  return createUser({
    displayName: label,
    email: `${label.toLowerCase().replaceAll(" ", "-")}@lifecycle.test`,
    password: "senha-segura",
  });
}

test("renomeia, arquiva e restaura calendários sem alterar BASIC ou ADVANCED", () => {
  const user = account("Ciclo Completo");
  const store = new LocalStudyStore(user.id);
  const advanced = store.load().activePlan!;
  const basic = store.createPlan({ name: "  Cronograma do cursinho  ", studyMode: "basic" });

  const renamed = store.renamePlan(basic.id, "  Residência 2027  ");
  assert.equal(renamed.name, "Residência 2027");
  assert.equal(renamed.studyMode, "basic");
  assert.throws(() => store.renamePlan(basic.id, "   "), /nome para o calendário/i);

  const archivedAdvanced = store.archivePlan(advanced.id);
  assert.ok(archivedAdvanced.archivedAt);
  assert.equal(store.load().plans.some((plan) => plan.id === advanced.id), false);
  assert.equal(store.listPlans({ archived: true })[0].id, advanced.id);
  const restoredAdvanced = store.restorePlan(advanced.id);
  assert.equal(restoredAdvanced.studyMode, "advanced");
  assert.equal(restoredAdvanced.active, false);

  store.archivePlan(basic.id);
  let loaded = store.load();
  assert.equal(loaded.activePlan?.id, advanced.id);
  assert.equal(loaded.activePlan?.studyMode, "advanced");
  assert.ok(loaded.activePlan);
  assert.equal(loaded.plans.some((plan) => plan.id === basic.id), false);

  const restoredBasic = store.restorePlan(basic.id);
  assert.equal(restoredBasic.studyMode, "basic");
  assert.equal(restoredBasic.active, false);
  loaded = store.load();
  assert.equal(loaded.plans.find((plan) => plan.id === basic.id)?.studyMode, "basic");
  assert.ok(loaded.activePlan);
});

test("impede arquivar ou excluir o único calendário utilizável", () => {
  const user = account("Protecao Unico");
  const store = new LocalStudyStore(user.id);
  const onlyPlan = store.load().activePlan!;
  assert.throws(() => store.archivePlan(onlyPlan.id), /crie outro calendário/i);
  assert.throws(() => store.deletePlan(onlyPlan.id), /único calendário/i);
  assert.equal(store.load().activePlan?.id, onlyPlan.id);
});

test("restaurar ativa o calendário quando um banco legado não possui plano ativo", () => {
  const user = account("Restauro Sem Ativo");
  const store = new LocalStudyStore(user.id);
  const advanced = store.load().activePlan!;
  const basic = store.createPlan({ name: "Plano disponível", studyMode: "basic" });
  store.archivePlan(advanced.id);
  getDatabase().prepare("UPDATE study_plans SET active = 0 WHERE user_id = ?").run(user.id);

  const restored = store.restorePlan(advanced.id);
  assert.equal(restored.active, true);
  assert.equal(restored.studyMode, "advanced");
  assert.equal(store.load().activePlan?.id, advanced.id);
  assert.equal(store.load().plans.find((plan) => plan.id === basic.id)?.active, false);
});

test("soft delete do calendário ativo preserva atividades, desempenho e histórico ADVANCED", () => {
  const user = account("Historico Advanced");
  const store = new LocalStudyStore(user.id);
  const advanced = store.load().activePlan!;
  const fallback = store.createPlan({ name: "Agenda básica", studyMode: "basic" });
  store.activatePlan(advanced.id);

  const activity = store.createActivity({
    subject: "Clínica Médica",
    topic: "Cardiologia",
    type: "exercise",
    date: "2026-09-10",
    estimatedMinutes: 45,
    questionCount: 10,
    priority: "high",
    status: "planned",
    exerciseOrigin: "question_bank",
  });
  store.completeActivity(activity.id, {
    actualMinutes: 42,
    questionsAnswered: 10,
    correctAnswers: 7,
    wrongAnswers: 3,
    accuracy: 70,
    perceivedDifficulty: "hard",
    errorReasons: ["forgot"],
    errorDetails: [{ topicText: "Cardiologia", errorCount: 3, errorReason: "forgot" }],
  });

  const sourceId = new LocalSourceStore(user.id).create({ name: "Prova histórica", sourceType: "exam" });
  const questions = new LocalQuestionStore(user.id);
  const questionId = questions.createQuestion({
    sourceId,
    questionNumber: 1,
    statement: "Questão histórica",
    questionStatus: "valid",
    correctAlternative: "A",
    alternatives: [
      { label: "A", text: "Correta", sortOrder: 0 },
      { label: "B", text: "Incorreta", sortOrder: 1 },
    ],
  });
  const sessionId = questions.createSession([questionId], activity.id);
  questions.answer(sessionId, "B");
  questions.complete(sessionId);

  store.deletePlan(advanced.id);
  const loaded = store.load();
  assert.equal(loaded.activePlan?.id, fallback.id);
  assert.equal(loaded.activePlan?.studyMode, "basic");
  assert.equal(loaded.plans.some((plan) => plan.id === advanced.id), false);

  const database = getDatabase();
  assert.equal((database.prepare("SELECT deleted_at IS NOT NULL deleted FROM study_plans WHERE id = ?").get(advanced.id) as { deleted: number }).deleted, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM activities WHERE id = ? AND study_plan_id = ?").get(activity.id, advanced.id) as { total: number }).total, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM activity_results WHERE activity_id = ?").get(activity.id) as { total: number }).total, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM activity_error_details WHERE activity_id = ?").get(activity.id) as { total: number }).total, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM question_attempts WHERE activity_id = ?").get(activity.id) as { total: number }).total, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM exercise_sessions WHERE id = ? AND activity_id = ?").get(sessionId, activity.id) as { total: number }).total, 1);
  assert.equal((database.prepare("SELECT COUNT(*) total FROM pragma_foreign_key_check").get() as { total: number }).total, 0);
});

test("API exige confirmação explícita antes de excluir um calendário", async () => {
  const user = account("Confirmacao API");
  const store = new LocalStudyStore(user.id);
  const plan = store.createPlan({ name: "Excluir pela API", studyMode: "basic" });
  const { token } = createUserSession(user.id);
  const context = { params: Promise.resolve({ path: ["plans", plan.id] }) };
  const headers = { cookie: `study_flow_session=${token}`, "content-type": "application/json" };

  const denied = await deleteData(new Request(`http://localhost/api/data/plans/${plan.id}`, { method: "DELETE", headers, body: "{}" }), context);
  assert.equal(denied.status, 400);
  assert.match(await denied.text(), /confirme explicitamente/i);
  assert.ok(store.load().plans.some((item) => item.id === plan.id));

  const deleted = await deleteData(new Request(`http://localhost/api/data/plans/${plan.id}`, {
    method: "DELETE", headers, body: JSON.stringify({ confirmed: true }),
  }), context);
  assert.equal(deleted.status, 204);
  assert.equal(store.load().plans.some((item) => item.id === plan.id), false);
  assert.ok(store.load().activePlan);
});

test("MCP lista, ativa, renomeia, arquiva e restaura sem oferecer exclusão", async () => {
  const user = account("MCP Planos");
  const store = new LocalStudyStore(user.id);
  const advanced = store.load().activePlan!;
  const basic = store.createPlan({ name: "MCP Basic", studyMode: "basic" });
  const server = createStudyFlowMcpServer(user.id, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "plan-lifecycle-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "list_plans"));
  assert.ok(tools.tools.some((tool) => tool.name === "restore_plan"));
  assert.equal(tools.tools.some((tool) => tool.name === "delete_plan"), false);

  await client.callTool({ name: "rename_plan", arguments: { planId: basic.id, name: "MCP renomeado" } });
  await client.callTool({ name: "archive_plan", arguments: { planId: basic.id } });
  const listed = await client.callTool({ name: "list_plans", arguments: {} });
  assert.match(JSON.stringify(listed.structuredContent), /MCP renomeado/);
  await client.callTool({ name: "restore_plan", arguments: { planId: basic.id } });
  await client.callTool({ name: "activate_plan", arguments: { planId: advanced.id } });
  const active = await client.callTool({ name: "get_active_plan", arguments: {} });
  assert.match(JSON.stringify(active.structuredContent), /"studyMode":"advanced"|"studyMode": "advanced"/);
  assert.match(JSON.stringify(active.structuredContent), /"active":true|"active": true/);

  await client.close();
  await server.close();
});
