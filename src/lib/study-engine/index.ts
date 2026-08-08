import type { ActivityResult, StudyActivity } from "@/types/activity";

export interface StudyEngineSuggestion {
  reason: string;
  suggestedDate: string;
  sourceActivityId: string;
}

// Pontos de extensão do futuro motor adaptativo. Nesta etapa, os resultados
// são persistidos sem criar atividades automaticamente.
export function processStudyResult(
  activity: StudyActivity,
  result: ActivityResult,
): StudyEngineSuggestion[] {
  void activity;
  void result;
  return [];
}

export function processExerciseResult(
  activity: StudyActivity,
  result: ActivityResult,
): StudyEngineSuggestion[] {
  void activity;
  void result;
  return [];
}

export function calculateNextReview(
  activity: StudyActivity,
  result: ActivityResult,
): string | null {
  void activity;
  void result;
  return null;
}

export function calculatePriority(
  activity: StudyActivity,
  result: ActivityResult,
): StudyActivity["priority"] {
  void result;
  return activity.priority;
}
