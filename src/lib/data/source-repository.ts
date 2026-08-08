import { apiRequest } from "@/lib/data/api-client";
import type { SourceDraft, SourceLibraryData, SourceTopicStat, StudySource } from "@/types/source";

export const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024;
export const ALLOWED_SOURCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function validateSourceFile(file: File) {
  if (!ALLOWED_SOURCE_MIME_TYPES.includes(file.type)) throw new Error("Formato inválido. Envie PDF, JPG, PNG ou WEBP.");
  if (file.size > MAX_SOURCE_FILE_SIZE) throw new Error("O arquivo excede o limite de 20 MB.");
}

export class SourceRepository {
  load() { return apiRequest<SourceLibraryData>("sources"); }
  create(draft: SourceDraft, file?: File) {
    if (file) validateSourceFile(file);
    const body = new FormData();
    body.set("draft", JSON.stringify(draft));
    if (file) body.set("file", file);
    return apiRequest<string>("sources", { method: "POST", body });
  }
  update(id: string, draft: Partial<SourceDraft>) { return apiRequest<void>(`sources/${id}`, { method: "PATCH", body: JSON.stringify(draft) }); }
  remove(source: StudySource) { return apiRequest<void>(`sources/${source.id}`, { method: "DELETE" }); }
  async signedUrl(storagePath: string) {
    const sourceId = storagePath.split("/")[2];
    if (!sourceId) throw new Error("Caminho de arquivo inválido.");
    return `/api/data/sources/${encodeURIComponent(sourceId)}/file`;
  }
  setPlanSelection(sourceId: string, planId: string, updates: { useForIncidence: boolean; useForQuestions: boolean }) {
    return apiRequest<void>(`plan-sources/${sourceId}`, { method: "PUT", body: JSON.stringify({ planId, ...updates }) });
  }
  setAllPlanSources(planId: string, sources: StudySource[], active: boolean) {
    return apiRequest<void>("plan-sources", { method: "PUT", body: JSON.stringify({ planId, sourceIds: sources.map((source) => source.id), active }) });
  }
  saveTopicStat(input: Omit<SourceTopicStat, "id" | "subjectName" | "topicName" | "analysisOrigin"> & { id?: string }) {
    return apiRequest<void>("source-stats", { method: "POST", body: JSON.stringify(input) });
  }
}

export function getSourceRepository() { return new SourceRepository(); }
