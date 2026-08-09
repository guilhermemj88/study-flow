import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { createUser, createUserSession, getUserBySessionToken } from "../src/lib/local/auth-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { LocalPlannerStore } from "../src/lib/local/planner-store";
import { LocalQuestionStore } from "../src/lib/local/question-store";
import { LocalSourceStore } from "../src/lib/local/source-store";
import { LocalStudyStore } from "../src/lib/local/study-store";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-access-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

const admin = createUser({ displayName: "Admin", email: "admin@target.test", password: "senha-segura" });
const user = createUser({ displayName: "Usuária", email: "user@target.test", password: "senha-segura" });
getDatabase().prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
new LocalSourceStore(admin.id).create({ name: "Fonte do admin", sourceType: "exam" });
new LocalSourceStore(user.id).create({ name: "Fonte privada da usuária", sourceType: "exam" });

async function mcpClient(userId: string) {
  const server = createStudyFlowMcpServer(userId, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "access-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test("usuário comum lê os próprios dados e não acessa outro usuário", async () => {
  const { client, server } = await mcpClient(user.id);
  const own = await client.callTool({ name: "list_sources", arguments: {} });
  assert.match(JSON.stringify(own.structuredContent), /Fonte privada da usuária/);
  assert.doesNotMatch(JSON.stringify(own.structuredContent), /Fonte do admin/);
  const denied = await client.callTool({ name: "list_sources", arguments: { targetUserEmail: admin.email } });
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied.content), /Acesso negado/i);
  await client.close(); await server.close();
});

test("admin sem alvo usa os próprios dados; com alvo pode ler e gravar para o alvo", async () => {
  const { client, server } = await mcpClient(admin.id);
  const own = await client.callTool({ name: "list_sources", arguments: {} });
  assert.match(JSON.stringify(own.structuredContent), /Fonte do admin/);
  assert.doesNotMatch(JSON.stringify(own.structuredContent), /Fonte privada da usuária/);

  const targeted = await client.callTool({ name: "list_sources", arguments: { targetUserEmail: user.email } });
  assert.match(JSON.stringify(targeted.structuredContent), /Fonte privada da usuária/);
  const created = await client.callTool({ name: "create_source", arguments: {
    targetUserEmail: user.email, name: "Criada pelo admin", sourceType: "exam", isAnswerKey: false,
  } });
  assert.equal(created.isError, undefined);
  const createdSourceId = (created.structuredContent as { sourceId: string }).sourceId;
  const savedQuestion = await client.callTool({ name: "save_questions", arguments: {
    targetUserEmail: user.email, sourceId: createdSourceId, questions: [{
      questionNumber: 1, statement: "Questão anulada pelo admin", questionStatus: "annulled", correctAlternative: null,
      alternatives: [{ label: "A", text: "Alternativa A" }, { label: "B", text: "Alternativa B" }],
    }],
  } });
  assert.equal(savedQuestion.isError, undefined);
  assert.ok(new LocalSourceStore(user.id).load().sources.some((source) => source.name === "Criada pelo admin"));
  assert.ok(!new LocalSourceStore(admin.id).load().sources.some((source) => source.name === "Criada pelo admin"));
  assert.equal(new LocalSourceStore(user.id).get(createdSourceId).annulledQuestionCount, 1);

  const audit = getDatabase().prepare(`SELECT user_id, target_user_id, tool_name, success FROM mcp_audit_log
    WHERE tool_name = 'create_source' ORDER BY created_at DESC LIMIT 1`).get() as { user_id: string; target_user_id: string; tool_name: string; success: number };
  assert.deepEqual(audit, { user_id: admin.id, target_user_id: user.id, tool_name: "create_source", success: 1 });
  await client.close(); await server.close();
});

test("admin recebe erro claro para alvo inexistente", async () => {
  const { client, server } = await mcpClient(admin.id);
  const result = await client.callTool({ name: "list_sources", arguments: { targetUserEmail: "missing@target.test" } });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /não encontrado/i);
  await client.close(); await server.close();
});

test("questão válida exige A-E e anulada aceita null sem entrar no desempenho", () => {
  const owner = createUser({ displayName: "Questões", email: "questions@target.test", password: "senha-segura" });
  const sourceId = new LocalSourceStore(owner.id).create({ name: "Prova completa", sourceType: "exam" });
  const questions = new LocalQuestionStore(owner.id);
  assert.throws(() => questions.createQuestion({
    sourceId, questionNumber: 1, statement: "Questão válida", questionStatus: "valid", correctAlternative: null,
    alternatives: [{ label: "A", text: "A", sortOrder: 0 }, { label: "B", text: "B", sortOrder: 1 }],
  }), /exigem uma alternativa correta/i);

  const validId = questions.createQuestion({
    sourceId, questionNumber: 1, statement: "Questão válida", questionStatus: "valid", correctAlternative: "A",
    alternatives: [{ label: "A", text: "A", sortOrder: 0 }, { label: "B", text: "B", sortOrder: 1 }],
  });
  const annulledId = questions.createQuestion({
    sourceId, questionNumber: 2, statement: "Questão anulada", questionStatus: "annulled", correctAlternative: null,
    alternatives: [{ label: "A", text: "A", sortOrder: 0 }, { label: "B", text: "B", sortOrder: 1 }],
  });
  const loaded = questions.load(undefined, false).questions;
  assert.equal(loaded.find((item) => item.id === annulledId)?.correctAlternative, null);
  assert.equal(loaded.find((item) => item.id === annulledId)?.questionStatus, "annulled");
  const source = new LocalSourceStore(owner.id).get(sourceId);
  assert.deepEqual([source.questionCount, source.validQuestionCount, source.annulledQuestionCount], [2, 1, 1]);
  assert.throws(() => questions.createSession([annulledId]), /foram encontradas/i);
  const sessionId = questions.createSession([validId]);
  questions.answer(sessionId, "B"); questions.complete(sessionId);
  const attempts = getDatabase().prepare("SELECT question_id FROM question_attempts WHERE user_id = ?").all(owner.id) as Array<{ question_id: string }>;
  assert.deepEqual(attempts.map((attempt) => attempt.question_id), [validId]);
});

test("gabarito permanece referência e não gera incidência independente", () => {
  const owner = createUser({ displayName: "Gabarito", email: "answer-key@target.test", password: "senha-segura" });
  const sources = new LocalSourceStore(owner.id);
  const answerKeyId = sources.create({ name: "Gabarito oficial", sourceType: "other", isAnswerKey: true });
  const answerKey = sources.get(answerKeyId);
  assert.equal(answerKey.isAnswerKey, true);
  assert.equal(answerKey.planSelection?.useForIncidence, false);
  assert.equal(answerKey.planSelection?.useForQuestions, false);
  assert.throws(() => sources.saveTopicsByName(answerKeyId, [{ subject: "Medicina", topic: "Geral", questionCount: 100, incidencePercentage: 100 }]), /não podem gerar incidência/i);
  assert.equal(new LocalPlannerStore(owner.id).preview({ startDate: "2030-01-01" }).sourceCount, 0);
});

test("prévia não grava, geração exige confirmação e respeita cada dia", () => {
  const owner = createUser({ displayName: "Capacidade", email: "capacity@target.test", password: "senha-segura" });
  const sources = new LocalSourceStore(owner.id);
  const sourceId = sources.create({ name: "Prova", sourceType: "exam" });
  sources.saveTopicsByName(sourceId, [{ subject: "Direito", topic: "Civil", questionCount: 10, incidencePercentage: 100 }]);
  const planner = new LocalPlannerStore(owner.id);
  planner.updateSettings({ examDate: "2030-03-31", availability: { mon: 60, tue: 120, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    sessionMinutes: 30, dailyLimitMinutes: 120, firstReviewDays: 1, secondReviewDays: 2, reinforcementDays: 3 });
  const before = new LocalStudyStore(owner.id).load().activities.length;
  const preview = planner.preview({ startDate: "2030-01-01" });
  assert.equal(new LocalStudyStore(owner.id).load().activities.length, before);
  assert.equal(preview.capacity.weeklyMinutes, 180);
  const perDay = new Map<string, number>();
  for (const activity of preview.activities) perDay.set(activity.date, (perDay.get(activity.date) ?? 0) + activity.estimatedMinutes);
  for (const [day, minutes] of perDay) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    assert.ok(minutes <= (weekday === 1 ? 60 : weekday === 2 ? 120 : 0));
  }
  assert.throws(() => planner.generateStudyPlan({ startDate: "2030-01-01" }), /confirme explicitamente/i);
  assert.ok(planner.generateStudyPlan({ startDate: "2030-01-01", confirmed: true }).created > 0);
});

test("capacidade insuficiente alerta, mas ainda permite uma distribuição parcial", () => {
  const owner = createUser({ displayName: "Plano curto", email: "short-plan@target.test", password: "senha-segura" });
  const sources = new LocalSourceStore(owner.id);
  const sourceId = sources.create({ name: "Prova próxima", sourceType: "exam" });
  sources.saveTopicsByName(sourceId, [{ subject: "Clínica", topic: "Urgências", questionCount: 20, incidencePercentage: 100 }]);
  const planner = new LocalPlannerStore(owner.id);
  planner.updateSettings({ examDate: "2030-01-01", availability: { mon: 0, tue: 30, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    sessionMinutes: 30, dailyLimitMinutes: 30, firstReviewDays: 1, secondReviewDays: 2, reinforcementDays: 3 });
  const preview = planner.preview({ startDate: "2030-01-01" });
  assert.equal(preview.capacityInsufficient, true);
  assert.equal(preview.activityCount, 1);
  assert.equal(preview.activities[0].estimatedMinutes, 30);
  assert.equal(planner.generateStudyPlan({ startDate: "2030-01-01", confirmed: true }).created, 1);
});

test("logout revoga a sessão, expira o cookie e impede seu reuso", async () => {
  const owner = createUser({ displayName: "Logout", email: "logout@target.test", password: "senha-segura" });
  const session = createUserSession(owner.id);
  assert.equal(getUserBySessionToken(session.token)?.id, owner.id);
  const response = await logout(new Request("http://localhost/api/auth/logout", {
    method: "POST", headers: { cookie: `study_flow_session=${session.token}` },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.equal(getUserBySessionToken(session.token), null);
});
