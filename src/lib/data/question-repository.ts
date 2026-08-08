import { apiRequest } from "@/lib/data/api-client";
import type { ErrorReason } from "@/types/activity";
import type { ExerciseSession, QuestionDraft, QuestionFilters, StudyQuestion } from "@/types/question";

export class QuestionRepository {
  load(filters?: Partial<QuestionFilters>, useActiveSources = true) {
    const query = new URLSearchParams({ active: String(useActiveSources) });
    if (filters) query.set("filters", JSON.stringify(filters));
    return apiRequest<{ questions: StudyQuestion[]; activeSourceIds: string[] }>(`questions?${query}`);
  }
  createQuestion(draft: QuestionDraft) { return apiRequest<string>("questions", { method: "POST", body: JSON.stringify(draft) }); }
  createSession(questions: StudyQuestion[], activityId?: string) { return apiRequest<string>("sessions", { method: "POST", body: JSON.stringify({ questionIds: questions.map((question) => question.id), activityId }) }); }
  getSession(id: string) { return apiRequest<ExerciseSession>(`sessions/${id}`); }
  answer(session: ExerciseSession, selectedAlternative: string) { return apiRequest<{ correct: boolean; attemptId: string }>(`sessions/${session.id}/answer`, { method: "POST", body: JSON.stringify({ selectedAlternative }) }); }
  setErrorReason(sessionQuestionId: string, attemptId: string, errorReason: ErrorReason) { return apiRequest<void>("session-error-reason", { method: "POST", body: JSON.stringify({ sessionQuestionId, attemptId, errorReason }) }); }
  advance(sessionId: string, nextIndex: number) { return apiRequest<void>(`sessions/${sessionId}/advance`, { method: "POST", body: JSON.stringify({ nextIndex }) }); }
  complete(session: ExerciseSession) { return apiRequest<void>(`sessions/${session.id}/complete`, { method: "POST" }); }
}

export function getQuestionRepository() { return new QuestionRepository(); }
