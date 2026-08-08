import type { StudyQuestion } from "@/types/question";

function questionPriority(question: StudyQuestion) {
  if (!question.lastAttempt) return 0;
  if (!question.lastAttempt.correct) return 1;
  return 2;
}
/**
 * Deterministic initial selector: unseen, last answered incorrectly, then the rest.
 * Stable tie-breakers make this function straightforward to unit test later.
 */
export function selectQuestions(questions: StudyQuestion[], amount: number): StudyQuestion[] {
  const unique = [...new Map(questions.map((question) => [question.id, question])).values()];
  return unique
    .sort((a, b) => (
      questionPriority(a) - questionPriority(b)
      || a.questionNumber - b.questionNumber
      || a.id.localeCompare(b.id)
    ))
    .slice(0, Math.max(0, amount));
}
