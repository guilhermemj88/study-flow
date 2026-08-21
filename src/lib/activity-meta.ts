import type {
  ActivityPriority,
  ActivityType,
  ErrorReason,
  PerceivedDifficulty,
  StudyActivity,
  StudyMethod,
} from "@/types/activity";
import { isPastDate } from "@/lib/date-utils";

export const activityTypeLabels: Record<ActivityType, string> = {
  study: "Estudo",
  exercise: "Exercício",
  review: "Revisão",
  reinforcement: "Reforço",
};

export const priorityLabels: Record<ActivityPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const difficultyLabels: Record<PerceivedDifficulty, string> = {
  easy: "Fácil",
  normal: "Normal",
  hard: "Difícil",
};

export const studyMethodLabels: Record<StudyMethod, string> = {
  class: "Aula",
  reading: "Leitura",
  summary: "Resumo",
  flashcards: "Flashcards",
  other: "Outro",
};

export const errorReasonLabels: Record<ErrorReason, string> = {
  did_not_know: "Não sabia o conteúdo",
  forgot: "Esqueci",
  confused_concepts: "Confundi conceitos",
  interpretation: "Interpretação",
  inattention: "Desatenção",
  other: "Outro",
};

export type VisualStatus = "on-track" | "attention" | "reinforcement" | "overdue" | "completed" | "not-done";

export function getVisualStatus(activity: StudyActivity): VisualStatus {
  if (activity.status === "completed") return "completed";
  if (activity.status === "not_done") return "not-done";
  if (isPastDate(activity.date)) return "overdue";
  if (activity.type === "reinforcement") return "reinforcement";
  if (activity.status === "attention" || ["high", "critical"].includes(activity.priority)) {
    return "attention";
  }
  return "on-track";
}

export const visualStatusLabels: Record<VisualStatus, string> = {
  "on-track": "Dentro do esperado",
  attention: "Precisa de atenção",
  reinforcement: "Reforço recomendado",
  overdue: "Atrasada",
  completed: "Concluída",
  "not-done": "Não realizada",
};

export function getActivityContentLabel(activity: StudyActivity): string {
  if (activity.focusLabel) return activity.focusLabel;
  return activity.subtopic ? `${activity.topic} — ${activity.subtopic}` : activity.topic;
}
