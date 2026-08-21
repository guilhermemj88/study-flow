import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { createUser } from "../src/lib/local/auth-store";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";
import { LocalStudyStore } from "../src/lib/local/study-store";
import { addDateOnlyMonths, buildBasicReviewSchedule } from "../src/lib/study-methods";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-basic-method-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

function account(label: string) {
  return createUser({ displayName: label, email: `${label.toLowerCase().replaceAll(" ", "-")}@basic.test`, password: "senha-segura" });
}

function createBasicStudy(store: LocalStudyStore, date = "2026-09-10") {
  return store.createActivity({
    subject: "Clínica Médica",
    topic: "Cardiologia",
    subtopic: "Insuficiência Cardíaca",
    focusLabel: "Aula do cronograma",
    type: "study",
    date,
    estimatedMinutes: 30,
    priority: "medium",
    status: "planned",
  });
}

test("regra de calendário gera 7 dias, 1, 2 e 6 meses a partir da data original", () => {
  assert.deepEqual(buildBasicReviewSchedule("2026-09-10").map((item) => item.date), [
    "2026-09-17",
    "2026-10-10",
    "2026-11-10",
    "2027-03-10",
  ]);
});

test("adição de meses limita o dia ao fim do mês e respeita ano bissexto", () => {
  assert.equal(addDateOnlyMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addDateOnlyMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addDateOnlyMonths("2024-02-29", 6), "2024-08-29");
  assert.equal(addDateOnlyMonths("2026-12-31", 2), "2027-02-28");
});

test("modo Basic cria quatro revisões vinculadas e não duplica ao salvar novamente", () => {
  const user = account("Criacao Basic");
  const store = new LocalStudyStore(user.id);
  const advancedPlan = store.load().activePlan!;
  assert.equal(advancedPlan.studyMode, "advanced");
  const basicPlan = store.createPlan({ name: "Cronograma do cursinho", studyMode: "basic" });
  const study = createBasicStudy(store);

  let activities = store.load().activities;
  assert.equal(activities.length, 5);
  const reviews = activities.filter((activity) => activity.type === "review");
  assert.deepEqual(reviews.map((review) => review.date), ["2026-09-17", "2026-10-10", "2026-11-10", "2027-03-10"]);
  assert.deepEqual(reviews.map((review) => review.reviewSequence), [1, 2, 3, 4]);
  assert.ok(reviews.every((review) => review.linkedStudyActivityId === study.id && review.planId === basicPlan.id));
  assert.ok(reviews.every((review) => review.subtopic === "Insuficiência Cardíaca" && review.focusLabel === "Aula do cronograma"));

  store.updateActivity(study.id, { date: "2026-09-10" });
  store.updateActivity(study.id, { notes: "Salvo novamente" });
  activities = store.load().activities;
  assert.equal(activities.length, 5);
  const duplicateGroups = getDatabase().prepare(`SELECT review_sequence, COUNT(*) total FROM activities
    WHERE linked_study_activity_id = ? GROUP BY review_sequence HAVING COUNT(*) > 1`).all(study.id);
  assert.deepEqual(duplicateGroups, []);
});

test("mover estudo atualiza apenas revisões pendentes e preserva concluídas", () => {
  const user = account("Reagendamento Basic");
  const store = new LocalStudyStore(user.id);
  store.createPlan({ name: "Agenda Basic", studyMode: "basic" });
  const study = createBasicStudy(store);
  const firstReview = store.load().activities.find((activity) => activity.reviewSequence === 1)!;
  store.updateActivity(firstReview.id, { status: "completed" });

  store.updateActivity(study.id, { date: "2026-09-12" });
  const reviews = store.load().activities.filter((activity) => activity.type === "review");
  assert.equal(reviews.find((review) => review.reviewSequence === 1)?.date, "2026-09-17");
  assert.equal(reviews.find((review) => review.reviewSequence === 1)?.status, "completed");
  assert.deepEqual(reviews.filter((review) => review.reviewSequence !== 1).map((review) => review.date), [
    "2026-10-12",
    "2026-11-12",
    "2027-03-12",
  ]);
});

test("estudo concluído não reorganiza revisões automaticamente", () => {
  const user = account("Historico Basic");
  const store = new LocalStudyStore(user.id);
  store.createPlan({ name: "Histórico Basic", studyMode: "basic" });
  const study = createBasicStudy(store);
  const originalDates = store.load().activities.filter((activity) => activity.type === "review").map((activity) => activity.date);
  store.updateActivity(study.id, { status: "completed" });
  store.updateActivity(study.id, { date: "2026-09-20" });
  assert.deepEqual(store.load().activities.filter((activity) => activity.type === "review").map((activity) => activity.date), originalDates);
});

test("excluir estudo remove revisões futuras pendentes e preserva concluídas", () => {
  const user = account("Exclusao Basic");
  const store = new LocalStudyStore(user.id);
  store.createPlan({ name: "Exclusão Basic", studyMode: "basic" });
  const study = createBasicStudy(store, "2030-09-10");
  const completedReview = store.load().activities.find((activity) => activity.reviewSequence === 1)!;
  store.updateActivity(completedReview.id, { status: "completed" });

  store.deleteActivity(study.id);
  const remaining = store.load().activities;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, completedReview.id);
  assert.equal(remaining[0].status, "completed");
  assert.equal(remaining[0].linkedStudyActivityId, study.id);
  assert.deepEqual(getDatabase().prepare("SELECT deleted_at IS NOT NULL archived FROM activities WHERE id = ?").get(study.id), { archived: 1 });
  assert.equal((getDatabase().prepare("SELECT COUNT(*) total FROM pragma_foreign_key_check").get() as { total: number }).total, 0);
});

test("calendários isolam atividades e o modo Advanced mantém o fluxo sem revisões automáticas", () => {
  const user = account("Planos Isolados");
  const store = new LocalStudyStore(user.id);
  const advanced = store.load().activePlan!;
  const advancedActivity = store.createActivity({
    subject: "Direito",
    topic: "Constitucional",
    type: "study",
    date: "2030-01-10",
    estimatedMinutes: 45,
    priority: "high",
    status: "planned",
  });
  assert.equal(store.load().activities.length, 1);

  store.createPlan({ name: "Plano Basic", studyMode: "basic" });
  createBasicStudy(store, "2030-02-10");
  assert.equal(store.load().activities.length, 5);
  assert.equal(store.load().activePlan?.studyMode, "basic");

  store.activatePlan(advanced.id);
  assert.equal(store.load().activePlan?.studyMode, "advanced");
  assert.deepEqual(store.load().activities.map((activity) => activity.id), [advancedActivity.id]);
});

test("create_activity do MCP reutiliza a regra Basic sem ferramenta paralela", async () => {
  const user = account("Mcp Basic");
  const store = new LocalStudyStore(user.id);
  store.createPlan({ name: "MCP Basic", studyMode: "basic" });
  const server = createStudyFlowMcpServer(user.id, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "basic-method-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: "create_activity",
      arguments: {
        subject: "Clínica Médica",
        topic: "Cardiologia",
        subtopic: "Insuficiência Cardíaca",
        type: "study",
        date: "2030-09-10",
      },
    });
    assert.equal(result.isError, undefined);
    assert.equal(store.load().activities.length, 5);
    assert.equal(store.load().activities.filter((activity) => activity.type === "review").length, 4);
  } finally {
    await client.close();
    await server.close();
  }
});
