import assert from "node:assert/strict";
import test from "node:test";
import { selectQuestions } from "../src/lib/study-engine/select-questions";
import type { StudyQuestion } from "../src/types/question";

function question(id: string, questionNumber: number, correct?: boolean): StudyQuestion {
  return {
    id,
    sourceId: "source-1",
    sourceName: "Prova",
    questionNumber,
    statement: id,
    correctAlternative: "A",
    alternatives: [{ label: "A", text: "Resposta", sortOrder: 0 }],
    lastAttempt: correct === undefined ? undefined : { correct, selectedAlternative: "A", answeredAt: "2026-08-08T00:00:00Z" },
  };
}

test("prioriza nunca respondidas, depois erradas e por fim acertadas", () => {
  const selected = selectQuestions([
    question("correct", 1, true),
    question("wrong", 3, false),
    question("unseen-2", 2),
    question("unseen-1", 1),
  ], 10);
  assert.deepEqual(selected.map((item) => item.id), ["unseen-1", "unseen-2", "wrong", "correct"]);
});

test("remove duplicatas e respeita a quantidade", () => {
  const duplicate = question("same", 2);
  const selected = selectQuestions([duplicate, question("later", 3), duplicate], 1);
  assert.deepEqual(selected.map((item) => item.id), ["same"]);
});
