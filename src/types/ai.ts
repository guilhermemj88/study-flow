export interface AiAvailability {
  available: boolean;
  providerLabel: "Study Flow AI";
  model: string | null;
  reason: "disabled" | "not_configured" | null;
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ReviewAdvice {
  summary: string;
  recommendations: Array<{ subject: string; topic: string; reason: string; minutes: number }>;
}

export interface SourceSummary {
  summary: string;
  keyPoints: string[];
}
