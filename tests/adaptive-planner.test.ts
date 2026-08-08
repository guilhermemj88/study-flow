import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { createUser } from "../src/lib/local/auth-store";
import { closeDatabaseForTests } from "../src/lib/local/database";
import { LocalPlannerStore } from "../src/lib/local/planner-store";
import { LocalQuestionStore } from "../src/lib/local/question-store";
import { LocalSourceStore } from "../src/lib/local/source-store";
import { LocalStudyStore } from "../src/lib/local/study-store";
import type { ErrorReason } from "../src/types/activity";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-planner-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;
process.env.MCP_PUBLIC_URL = "http://127.0.0.1:3333";

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

function user(label: string) {
  return createUser({ displayName: label, email: `${label.toLowerCase().replaceAll(" ", "-")}@planner.test`, password: "senha-segura" });
}

function addSource(userId: string, name: string, items: Array<{ subject: string; topic: string; subtopic?: string; questionCount: number; incidencePercentage: number }>) {
  const sources = new LocalSourceStore(userId);
  const sourceId = sources.create({ name, sourceType: "exam", year: 2030 });
  sources.saveTopicsByName(sourceId, items);
  return sourceId;
}

function allDays(minutes: number) {
  return { mon: minutes, tue: minutes, wed: minutes, thu: minutes, fri: minutes, sat: minutes, sun: minutes };
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

test("plano inicial pondera incidência, garante cobertura mínima e respeita espaçamento", () => {
  const account = user("Distribuicao");
  addSource(account.id, "Prova ponderada", [
    { subject: "Direito", topic: "Constitucional", questionCount: 80, incidencePercentage: 80 },
    { subject: "Direito", topic: "Administrativo", questionCount: 20, incidencePercentage: 20 },
    { subject: "Português", topic: "Semântica", questionCount: 0, incidencePercentage: 0.1 },
  ]);
  const planner = new LocalPlannerStore(account.id);
  planner.updateSettings({
    examDate: "2030-02-28",
    availability: allDays(60),
    sessionMinutes: 30,
    dailyLimitMinutes: 60,
    firstReviewDays: 1,
    secondReviewDays: 2,
    reinforcementDays: 3,
    exerciseQuestions: 30,
  });

  const preview = planner.preview({ startDate: "2030-01-01" });
  const studies = preview.activities.filter((activity) => activity.sequenceStep === "study");
  const byTopic = new Map<string, number>();
  for (const activity of studies) byTopic.set(activity.topic, (byTopic.get(activity.topic) ?? 0) + 1);
  assert.ok((byTopic.get("Constitucional") ?? 0) > (byTopic.get("Administrativo") ?? 0) * 2);
  assert.ok((byTopic.get("Semântica") ?? 0) >= 1, "tema de baixa incidência deve manter cobertura mínima");

  const firstKey = studies[0].sequenceKey;
  const sequence = preview.activities.filter((activity) => activity.sequenceKey === firstKey);
  const dateByStep = new Map(sequence.map((activity) => [activity.sequenceStep, activity.date]));
  assert.ok(daysBetween(dateByStep.get("study")!, dateByStep.get("review")!) >= 1);
  assert.ok(daysBetween(dateByStep.get("study")!, dateByStep.get("exercise")!) >= 2);
  assert.ok(daysBetween(dateByStep.get("study")!, dateByStep.get("reinforcement")!) >= 3);
  assert.equal(sequence.find((activity) => activity.sequenceStep === "exercise")?.questionCount, 30);
});

test("calendário usa somente dias disponíveis e obedece ao limite diário", () => {
  const account = user("Disponibilidade");
  addSource(account.id, "Prova semanal", [{ subject: "Matemática", topic: "Álgebra", questionCount: 10, incidencePercentage: 100 }]);
  const planner = new LocalPlannerStore(account.id);
  planner.updateSettings({
    examDate: "2030-03-31",
    availability: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    sessionMinutes: 30,
    dailyLimitMinutes: 60,
    firstReviewDays: 1,
    secondReviewDays: 2,
    reinforcementDays: 3,
  });
  const preview = planner.preview({ startDate: "2030-01-01" });
  const perDay = new Map<string, number>();
  for (const activity of preview.activities) {
    assert.equal(new Date(`${activity.date}T12:00:00Z`).getUTCDay(), 1);
    perDay.set(activity.date, (perDay.get(activity.date) ?? 0) + activity.estimatedMinutes);
  }
  assert.ok([...perDay.values()].every((minutes) => minutes <= 60));
});

test("motivos de erro aplicam os fatores adaptativos configurados", () => {
  const account = user("Fatores");
  const reasons: Array<[ErrorReason, number]> = [
    ["did_not_know", 1.8], ["forgot", 1.5], ["confused_concepts", 1.6],
    ["interpretation", 1.3], ["inattention", 1.1], ["other", 1.2],
  ];
  const sourceId = addSource(account.id, "Prova com erros", reasons.map(([reason], index) => ({
    subject: "Tecnologia", topic: `Tema ${index + 1}`, subtopic: reason, questionCount: 1, incidencePercentage: 10,
  })));
  const questions = new LocalQuestionStore(account.id);
  const questionIds = questions.saveQuestionsByName(sourceId, reasons.map(([reason], index) => ({
    questionNumber: index + 1,
    statement: `Questão ${reason}`,
    subject: "Tecnologia",
    topic: `Tema ${index + 1}`,
    subtopic: reason,
    correctAlternative: "A",
    alternatives: [{ label: "A", text: "Correta" }, { label: "B", text: "Incorreta" }],
  })));
  questionIds.forEach((questionId, index) => {
    const sessionId = questions.createSession([questionId]);
    const answer = questions.answer(sessionId, "B");
    const session = questions.getSession(sessionId);
    questions.setErrorReason(session.questions[0].sessionQuestionId, answer.attemptId, reasons[index][0]);
    questions.complete(sessionId);
  });
  const priorities = new LocalPlannerStore(account.id).getPriorityTopics();
  for (const [reason, factor] of reasons) {
    const item = priorities.find((priority) => priority.subtopic === reason);
    assert.equal(item?.errorReasonFactor, factor);
    assert.equal(item?.recentErrorReason, reason);
  }
});

test("sequência de acertos reduz prioridade sem eliminar cobertura", () => {
  const account = user("Acertos");
  const sourceId = addSource(account.id, "Prova de acertos", [
    { subject: "Português", topic: "Dominado", questionCount: 10, incidencePercentage: 50 },
    { subject: "Português", topic: "Sem histórico", questionCount: 10, incidencePercentage: 50 },
  ]);
  const questions = new LocalQuestionStore(account.id);
  const [questionId] = questions.saveQuestionsByName(sourceId, [{
    questionNumber: 1, statement: "Questão dominada", subject: "Português", topic: "Dominado", correctAlternative: "A",
    alternatives: [{ label: "A", text: "Correta" }, { label: "B", text: "Incorreta" }],
  }]);
  for (let index = 0; index < 3; index += 1) {
    const sessionId = questions.createSession([questionId]);
    questions.answer(sessionId, "A");
    questions.complete(sessionId);
  }
  const priorities = new LocalPlannerStore(account.id).getPriorityTopics();
  const dominated = priorities.find((item) => item.topic === "Dominado")!;
  const untouched = priorities.find((item) => item.topic === "Sem histórico")!;
  assert.equal(dominated.successStreak, 3);
  assert.ok(dominated.performanceFactor >= 0.65);
  assert.ok(dominated.priorityWeight > 0);
  assert.ok(dominated.priorityWeight < untouched.priorityWeight);
});

test("nova incidência apenas avisa; recálculo preserva concluídas e não duplica", () => {
  const account = user("Recalculo");
  const sourceId = addSource(account.id, "Prova inicial", [{ subject: "Direito", topic: "Civil", questionCount: 10, incidencePercentage: 100 }]);
  const planner = new LocalPlannerStore(account.id);
  planner.updateSettings({ examDate: "2030-02-28", availability: allDays(60), sessionMinutes: 30, dailyLimitMinutes: 60, firstReviewDays: 1, secondReviewDays: 2, reinforcementDays: 3 });
  const generated = planner.generateStudyPlan({ startDate: "2030-01-01" });
  assert.ok(generated.created > 0);
  const study = new LocalStudyStore(account.id);
  const completed = study.load().activities.find((activity) => activity.planningOrigin !== "manual")!;
  study.updateActivity(completed.id, { status: "completed" });
  const idsBeforeIncidence = study.load().activities.map((activity) => activity.id).sort();

  new LocalSourceStore(account.id).saveTopicsByName(sourceId, [
    { subject: "Direito", topic: "Civil", questionCount: 10, incidencePercentage: 80 },
    { subject: "Direito", topic: "Processo Civil", questionCount: 2, incidencePercentage: 20 },
  ]);
  const changedPreview = planner.preview({ startDate: "2030-01-01" });
  assert.equal(changedPreview.incidenceChanged, true);
  assert.ok(changedPreview.priorities.some((item) => item.topic === "Processo Civil"));
  assert.ok(changedPreview.priorities.find((item) => item.topic === "Civil")!.priorityWeight < 1);
  assert.deepEqual(study.load().activities.map((activity) => activity.id).sort(), idsBeforeIncidence, "prévia não deve gravar nem recalcular");

  planner.recalculateFuturePlan({ startDate: "2030-01-01" });
  assert.equal(study.load().activities.find((activity) => activity.id === completed.id)?.status, "completed");
  const stable = planner.recalculateFuturePlan({ startDate: "2030-01-01" });
  assert.equal(stable.created, 0);
  assert.equal(stable.updated, 0);
  assert.equal(stable.removed, 0);
  const generatedRows = study.load().activities.filter((activity) => activity.sequenceKey);
  assert.equal(new Set(generatedRows.map((activity) => `${activity.sequenceKey}:${activity.sequenceStep}`)).size, generatedRows.length);
});

test("somente fontes marcadas para incidência entram no cálculo global", () => {
  const account = user("Fontes Ativas");
  addSource(account.id, "Fonte ativa", [{ subject: "Medicina", topic: "Pneumologia", questionCount: 4, incidencePercentage: 100 }]);
  const excludedId = addSource(account.id, "Fonte excluída", [{ subject: "Medicina", topic: "Dermatologia", questionCount: 100, incidencePercentage: 100 }]);
  const sources = new LocalSourceStore(account.id);
  const planId = sources.load().activePlan!.id;
  sources.setPlanSelection(excludedId, planId, { useForIncidence: false, useForQuestions: true });
  const planner = new LocalPlannerStore(account.id);
  const excluded = planner.preview({ startDate: "2030-01-01" });
  assert.equal(excluded.sourceCount, 1);
  assert.ok(excluded.priorities.some((item) => item.topic === "Pneumologia"));
  assert.ok(!excluded.priorities.some((item) => item.topic === "Dermatologia"));
  sources.setPlanSelection(excludedId, planId, { useForIncidence: true, useForQuestions: true });
  assert.ok(planner.preview({ startDate: "2030-01-01" }).priorities.some((item) => item.topic === "Dermatologia"));
});

test("planejador e ferramentas MCP mantêm isolamento por usuário", async () => {
  const alice = user("Planner Alice");
  const bob = user("Planner Bob");
  addSource(alice.id, "Fonte privada", [{ subject: "Direito", topic: "Penal", questionCount: 5, incidencePercentage: 100 }]);
  assert.ok(new LocalPlannerStore(alice.id).getPriorityTopics().length > 0);
  assert.equal(new LocalPlannerStore(bob.id).getPriorityTopics().length, 0);

  const server = createStudyFlowMcpServer(alice.id, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "planner-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listed = await client.listTools();
  for (const tool of ["get_plan_settings", "update_plan_settings", "generate_study_plan", "preview_study_plan", "recalculate_future_plan", "get_priority_topics", "get_review_recommendations"]) {
    assert.ok(listed.tools.some((item) => item.name === tool), `${tool} deve ser publicado pelo MCP`);
  }
  const priorityResult = await client.callTool({ name: "get_priority_topics", arguments: {} });
  assert.equal(priorityResult.isError, undefined);
  const generated = await client.callTool({ name: "generate_study_plan", arguments: { startDate: "2030-01-01" } });
  assert.equal(generated.isError, undefined);
  assert.ok(new LocalStudyStore(alice.id).load().activities.some((activity) => activity.planningOrigin !== "manual"));
  const recalculated = await client.callTool({ name: "recalculate_future_plan", arguments: { startDate: "2030-01-01" } });
  assert.equal(recalculated.isError, undefined);
  assert.equal(new LocalPlannerStore(bob.id).getPriorityTopics().length, 0);
  assert.equal(new LocalStudyStore(bob.id).load().activities.length, 0);
  await client.close();
  await server.close();
});
