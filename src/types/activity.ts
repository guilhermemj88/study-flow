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
  | "mixed_concepts"
  | "interpretation"
  | "inattention";

export interface ActivityResult {
  actualMinutes?: number;
  questionsAnswered?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  accuracy?: number;
  perceivedDifficulty: PerceivedDifficulty;
  errorReasons?: ErrorReason[];
  studyMethods?: StudyMethod[];
  notes?: string;
}

export interface StudyActivity {
  id: string;
  type: ActivityType;
  subject: string;
  topic: string;
  date: string;
  estimatedMinutes: number;
  questionCount?: number;
  priority: ActivityPriority;
  status: ActivityStatus;
  notes?: string;
  createdAt: string;
  completedAt?: string;
  result?: ActivityResult;
}

export interface StudySubject {
  id: string;
  name: string;
  topics: string[];
}

export interface StudyData {
  version: 1;
  activities: StudyActivity[];
  subjects: StudySubject[];
}

export type ActivityDraft = Omit<StudyActivity, "id" | "createdAt" | "completedAt" | "result">;
