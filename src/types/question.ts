import type { ErrorReason } from "@/types/activity";

export interface QuestionAlternative {
  id?: string;
  label: string;
  text: string;
  sortOrder: number;
}

export interface QuestionAttemptInfo {
  id?: string;
  correct: boolean;
  selectedAlternative: string;
  answeredAt: string;
}

export interface StudyQuestion {
  id: string;
  sourceId: string;
  sourceName: string;
  questionNumber: number;
  statement: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName?: string;
  subtopicText?: string;
  explanation?: string;
  questionStatus?: "valid" | "annulled";
  correctAlternative: string | null;
  year?: number;
  alternatives: QuestionAlternative[];
  lastAttempt?: QuestionAttemptInfo;
}

export interface QuestionDraft {
  sourceId: string;
  questionNumber: number;
  statement: string;
  subjectId?: string;
  topicId?: string;
  subtopicText?: string;
  explanation?: string;
  questionStatus?: "valid" | "annulled";
  correctAlternative: string | null;
  year?: number;
  alternatives: QuestionAlternative[];
}

export type QuestionStatusFilter = "all" | "unanswered" | "wrong" | "correct";

export interface QuestionFilters {
  sourceIds: string[];
  subjectId?: string;
  topicId?: string;
  year?: number;
  status: QuestionStatusFilter;
}

export interface ExerciseSession {
  id: string;
  activityId?: string;
  currentIndex: number;
  status: "in_progress" | "completed" | "abandoned";
  correctCount: number;
  wrongCount: number;
  questions: Array<StudyQuestion & {
    position: number;
    sessionQuestionId: string;
    selectedAlternative?: string;
    correct?: boolean;
    errorReason?: ErrorReason;
  }>;
}
