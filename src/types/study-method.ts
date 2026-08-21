export const STUDY_MODES = ["basic", "advanced"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const REVIEW_RULES = ["day_7", "month_1", "month_2", "month_6"] as const;
export type ReviewRule = (typeof REVIEW_RULES)[number];

export interface StudyMethodCapabilities {
  adaptivePlanner: boolean;
  automaticReviews: boolean;
  performance: boolean;
  questions: boolean;
  sources: boolean;
  simpleActivityCompletion: boolean;
}

export interface StudyMethodDefinition {
  mode: StudyMode;
  label: string;
  summary: string;
  capabilities: StudyMethodCapabilities;
}

