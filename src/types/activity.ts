export const ACTIVITY_TYPES = ["study", "exercise", "review", "reinforcement"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type ActivityPriority = (typeof PRIORITIES)[number];

export type ActivityStatus = "planned" | "attention" | "completed";
export type PerceivedDifficulty = "easy" | "normal" | "hard";

export type StudyMethod = "class" | "reading" | "summary" | "flashcards" | "other";

export type ErrorReason =
  | "did_not_know"
  | "forgot"
  | "confused_concepts"
  | "interpretation"
  | "inattention"
  | "other";

export type ExerciseOrigin = "manual" | "question_bank";

export interface ActivityErrorDetailInput {
  topicId?: string;
  topicText: string;
  subtopicText?: string;
  errorCount: number;
  errorReason: ErrorReason;
  notes?: string;
}

export interface ActivityResult {
  actualMinutes?: number;
  questionsAnswered?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  accuracy?: number;
  perceivedDifficulty: PerceivedDifficulty;
  errorReasons?: ErrorReason[];
  studyMethods?: StudyMethod[];
  errorDetails?: ActivityErrorDetailInput[];
  notes?: string;
}

export interface StudyActivity {
  id: string;
  planId?: string;
  subjectId?: string;
  topicId?: string;
  type: ActivityType;
  subject: string;
  topic: string;
  date: string;
  estimatedMinutes: number;
  questionCount?: number;
  priority: ActivityPriority;
  status: ActivityStatus;
  notes?: string;
  exerciseOrigin?: ExerciseOrigin;
  linkedStudyActivityId?: string;
  createdAt: string;
  completedAt?: string;
  result?: ActivityResult;
}

export interface StudySubject {
  id: string;
  name: string;
  topics: string[];
  topicRecords?: Array<{ id: string; name: string }>;
}

export interface StudyData {
  activities: StudyActivity[];
  subjects: StudySubject[];
  activePlan?: StudyPlan;
  attemptSummaries: QuestionAttemptSummary[];
}

export interface StudyPlan {
  id: string;
  name: string;
  targetExamName?: string;
  examDate?: string;
}

export interface QuestionAttemptSummary {
  id: string;
  activityId?: string;
  subject: string;
  topic?: string;
  correct: boolean;
  answeredAt: string;
}

export type ActivityDraft = Omit<StudyActivity, "id" | "createdAt" | "completedAt" | "result">;
