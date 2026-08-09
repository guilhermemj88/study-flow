export type SourceType = "exam" | "edital" | "other";
export type AnalysisStatus = "pending" | "analyzed" | "error" | "manual";

export interface StudyPlanSourceSelection {
  id: string;
  planId: string;
  useForIncidence: boolean;
  useForQuestions: boolean;
}
export interface SourceTopicStat {
  id: string;
  sourceId: string;
  subjectId: string;
  subjectName: string;
  topicId?: string;
  topicName?: string;
  subtopicText?: string;
  questionCount: number;
  incidencePercentage: number;
  analysisOrigin: "manual" | "mcp" | "imported";
}

export interface StudySource {
  id: string;
  name: string;
  sourceType: SourceType;
  institution?: string;
  year?: number;
  edition?: string;
  description?: string;
  storagePath?: string;
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  sourceUrl?: string;
  analysisStatus: AnalysisStatus;
  isAnswerKey: boolean;
  createdAt: string;
  updatedAt: string;
  planSelection?: StudyPlanSourceSelection;
  questionCount: number;
  validQuestionCount: number;
  annulledQuestionCount: number;
  topicStats: SourceTopicStat[];
}

export interface SourceDraft {
  name: string;
  sourceType: SourceType;
  institution?: string;
  year?: number;
  edition?: string;
  description?: string;
  isAnswerKey?: boolean;
}

export interface SourceLibraryData {
  sources: StudySource[];
  activePlan?: { id: string; name: string };
}
