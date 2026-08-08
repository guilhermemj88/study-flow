import type { ActivityPriority, ActivityType, ErrorReason } from "@/types/activity";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type WeeklyAvailability = Record<WeekdayKey, number>;

export interface PlanSettings {
  planId: string;
  examDate?: string;
  availability: WeeklyAvailability;
  sessionMinutes: 30 | 45 | 60 | 90;
  dailyLimitMinutes: number;
  firstReviewDays: number;
  secondReviewDays: number;
  reinforcementDays: number;
  exerciseQuestions: 10 | 20 | 30 | 50;
  lastGeneratedAt?: string;
}

export type PlanSettingsUpdate = Omit<Partial<Omit<PlanSettings, "planId" | "lastGeneratedAt">>, "availability"> & {
  availability?: Partial<WeeklyAvailability>;
};

export interface PriorityTopic {
  subjectId: string;
  subject: string;
  topicId?: string;
  topic: string;
  subtopic?: string;
  questionCount: number;
  incidenceWeight: number;
  performanceFactor: number;
  errorReasonFactor: number;
  recencyFactor: number;
  priorityWeight: number;
  recentErrorReason?: ErrorReason;
  recentErrorAt?: string;
  successStreak: number;
}

export interface PlannedActivityPreview {
  sequenceKey: string;
  sequenceStep: "study" | "review" | "exercise" | "reinforcement";
  type: ActivityType;
  subjectId: string;
  subject: string;
  topicId?: string;
  topic: string;
  subtopic?: string;
  focusLabel: string;
  date: string;
  estimatedMinutes: number;
  questionCount?: number;
  priority: ActivityPriority;
  planningOrigin: "incidence" | "performance";
  adaptiveReason?: string;
  errorReason?: ErrorReason;
  baseWeight: number;
  adaptiveWeight: number;
}

export interface StudyPlanPreview {
  startDate: string;
  endDate: string;
  sourceCount: number;
  analyzedQuestionCount: number;
  subjectCount: number;
  topicCount: number;
  totalMinutes: number;
  activityCount: number;
  incidenceChanged: boolean;
  hasGeneratedPlan: boolean;
  priorities: PriorityTopic[];
  activities: PlannedActivityPreview[];
}

export interface PlanMutationResult {
  preview: StudyPlanPreview;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export interface ReviewRecommendation {
  subject: string;
  topic: string;
  subtopic?: string;
  priorityWeight: number;
  reason: string;
  recommendedType: "review" | "reinforcement" | "exercise";
}
