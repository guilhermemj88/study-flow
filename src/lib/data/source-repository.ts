import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toRepositoryError } from "@/lib/data/repository-error";
import type {
  SourceDraft,
  SourceLibraryData,
  SourceTopicStat,
  StudySource,
} from "@/types/source";

export const SOURCE_BUCKET = "study-sources";
export const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024;
export const ALLOWED_SOURCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

interface DbSource {
  id: string; name: string; source_type: StudySource["sourceType"]; institution: string | null;
  year: number | null; edition: string | null; description: string | null; storage_path: string | null;
  original_filename: string | null; mime_type: string | null; file_size: number | null;
  analysis_status: StudySource["analysisStatus"]; created_at: string; updated_at: string;
}
interface DbPlanSource {
  id: string; study_plan_id: string; source_id: string; use_for_incidence: boolean; use_for_questions: boolean;
}
interface DbStat {
  id: string; source_id: string; subject_id: string; topic_id: string | null; subtopic_text: string | null;
  question_count: number; incidence_percentage: number; analysis_origin: SourceTopicStat["analysisOrigin"];
}

function safeFilename(filename: string) {
  const extension = filename.includes(".") ? `.${filename.split(".").pop()?.toLowerCase()}` : "";
  return `source${extension.replace(/[^.a-z0-9]/g, "")}`;
}

export function validateSourceFile(file: File) {
  if (!ALLOWED_SOURCE_MIME_TYPES.includes(file.type)) {
    throw new Error("Formato inválido. Envie PDF, JPG, PNG ou WEBP.");
  }
  if (file.size > MAX_SOURCE_FILE_SIZE) {
    throw new Error("O arquivo excede o limite de 20 MB.");
  }
}

export class SourceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async userId() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) throw toRepositoryError(error, "Sua sessão expirou. Entre novamente.");
    return data.user.id;
  }

  async load(): Promise<SourceLibraryData> {
    await this.userId();
    const [sourcesResponse, planResponse, linksResponse, questionsResponse, statsResponse, subjectsResponse, topicsResponse] = await Promise.all([
      this.supabase.from("sources").select("*").order("created_at", { ascending: false }),
      this.supabase.from("study_plans").select("id,name").eq("active", true).limit(1).maybeSingle(),
      this.supabase.from("study_plan_sources").select("id,study_plan_id,source_id,use_for_incidence,use_for_questions"),
      this.supabase.from("questions").select("id,source_id"),
      this.supabase.from("source_topic_stats").select("*"),
      this.supabase.from("subjects").select("id,name"),
      this.supabase.from("topics").select("id,name"),
    ]);
    const error = sourcesResponse.error ?? planResponse.error ?? linksResponse.error ?? questionsResponse.error ?? statsResponse.error ?? subjectsResponse.error ?? topicsResponse.error;
    if (error) throw toRepositoryError(error, "Não foi possível carregar suas fontes.");

    const rows = (sourcesResponse.data ?? []) as DbSource[];
    const links = (linksResponse.data ?? []) as DbPlanSource[];
    const questions = (questionsResponse.data ?? []) as Array<{ id: string; source_id: string }>;
    const stats = (statsResponse.data ?? []) as DbStat[];
    const plan = planResponse.data as { id: string; name: string } | null;
    const subjects = new Map(((subjectsResponse.data ?? []) as Array<{ id: string; name: string }>).map((item) => [item.id, item.name]));
    const topics = new Map(((topicsResponse.data ?? []) as Array<{ id: string; name: string }>).map((item) => [item.id, item.name]));

    const sources = rows.map<StudySource>((row) => ({
      id: row.id,
      name: row.name,
      sourceType: row.source_type,
      institution: row.institution ?? undefined,
      year: row.year ?? undefined,
      edition: row.edition ?? undefined,
      description: row.description ?? undefined,
      storagePath: row.storage_path ?? undefined,
      originalFilename: row.original_filename ?? undefined,
      mimeType: row.mime_type ?? undefined,
      fileSize: row.file_size ?? undefined,
      analysisStatus: row.analysis_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      questionCount: questions.filter((question) => question.source_id === row.id).length,
      planSelection: (() => {
        const link = links.find((item) => item.source_id === row.id && item.study_plan_id === plan?.id);
        return link ? { id: link.id, planId: link.study_plan_id, useForIncidence: link.use_for_incidence, useForQuestions: link.use_for_questions } : undefined;
      })(),
      topicStats: stats.filter((stat) => stat.source_id === row.id).map((stat) => ({
        id: stat.id,
        sourceId: stat.source_id,
        subjectId: stat.subject_id,
        subjectName: subjects.get(stat.subject_id) ?? "Matéria",
        topicId: stat.topic_id ?? undefined,
        topicName: stat.topic_id ? topics.get(stat.topic_id) : undefined,
        subtopicText: stat.subtopic_text ?? undefined,
        questionCount: stat.question_count,
        incidencePercentage: Number(stat.incidence_percentage),
        analysisOrigin: stat.analysis_origin,
      })),
    }));

    return { sources, activePlan: plan ?? undefined };
  }

  async create(draft: SourceDraft, file?: File): Promise<string> {
    const userId = await this.userId();
    if (file) validateSourceFile(file);
    const id = crypto.randomUUID();
    const response = await this.supabase.from("sources").insert({
      id,
      user_id: userId,
      name: draft.name,
      source_type: draft.sourceType,
      institution: draft.institution ?? null,
      year: draft.year ?? null,
      edition: draft.edition ?? null,
      description: draft.description ?? null,
      analysis_status: file ? "pending" : "manual",
    });
    if (response.error) throw toRepositoryError(response.error, "Não foi possível criar a fonte.");

    try {
      if (file) {
        const path = `${userId}/sources/${id}/${safeFilename(file.name)}`;
        const upload = await this.supabase.storage.from(SOURCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw toRepositoryError(upload.error, "Não foi possível enviar o arquivo.");
        const update = await this.supabase.from("sources").update({
          storage_path: path,
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
        }).eq("id", id);
        if (update.error) throw toRepositoryError(update.error, "O arquivo foi enviado, mas os metadados não foram salvos.");
      }
      const plan = await this.supabase.from("study_plans").select("id").eq("active", true).limit(1).maybeSingle();
      if (plan.error) throw toRepositoryError(plan.error, "Não foi possível localizar o plano ativo.");
      if (plan.data) {
        const link = await this.supabase.from("study_plan_sources").insert({
          user_id: userId,
          study_plan_id: plan.data.id,
          source_id: id,
          use_for_incidence: true,
          use_for_questions: true,
        });
        if (link.error) throw toRepositoryError(link.error, "A fonte foi criada, mas não pôde ser incluída no plano.");
      }
      return id;
    } catch (error) {
      if (file) {
        const path = `${userId}/sources/${id}/${safeFilename(file.name)}`;
        await this.supabase.storage.from(SOURCE_BUCKET).remove([path]);
      }
      await this.supabase.from("sources").delete().eq("id", id);
      throw error;
    }
  }

  async update(id: string, draft: Partial<SourceDraft>) {
    const payload: Record<string, unknown> = {};
    if (draft.name !== undefined) payload.name = draft.name;
    if (draft.sourceType !== undefined) payload.source_type = draft.sourceType;
    if (draft.institution !== undefined) payload.institution = draft.institution || null;
    if (draft.year !== undefined) payload.year = draft.year || null;
    if (draft.edition !== undefined) payload.edition = draft.edition || null;
    if (draft.description !== undefined) payload.description = draft.description || null;
    const { error } = await this.supabase.from("sources").update(payload).eq("id", id);
    if (error) throw toRepositoryError(error, "Não foi possível atualizar a fonte.");
  }

  async remove(source: StudySource) {
    if (source.storagePath) {
      const storageResponse = await this.supabase.storage.from(SOURCE_BUCKET).remove([source.storagePath]);
      if (storageResponse.error) throw toRepositoryError(storageResponse.error, "Não foi possível remover o arquivo privado.");
    }
    const { error } = await this.supabase.from("sources").delete().eq("id", source.id);
    if (error) throw toRepositoryError(error, "Não foi possível remover a fonte.");
  }

  async signedUrl(storagePath: string) {
    const { data, error } = await this.supabase.storage.from(SOURCE_BUCKET).createSignedUrl(storagePath, 60);
    if (error || !data) throw toRepositoryError(error, "Não foi possível abrir o arquivo.");
    return data.signedUrl;
  }

  async setPlanSelection(sourceId: string, planId: string, updates: { useForIncidence: boolean; useForQuestions: boolean }) {
    const userId = await this.userId();
    const { error } = await this.supabase.from("study_plan_sources").upsert({
      user_id: userId,
      study_plan_id: planId,
      source_id: sourceId,
      use_for_incidence: updates.useForIncidence,
      use_for_questions: updates.useForQuestions,
    }, { onConflict: "study_plan_id,source_id" });
    if (error) throw toRepositoryError(error, "Não foi possível atualizar as fontes do plano.");
  }

  async setAllPlanSources(planId: string, sources: StudySource[], active: boolean) {
    const userId = await this.userId();
    const { error } = await this.supabase.from("study_plan_sources").upsert(sources.map((source) => ({
      user_id: userId,
      study_plan_id: planId,
      source_id: source.id,
      use_for_incidence: active,
      use_for_questions: active,
    })), { onConflict: "study_plan_id,source_id" });
    if (error) throw toRepositoryError(error, "Não foi possível atualizar todas as fontes.");
  }

  async saveTopicStat(input: Omit<SourceTopicStat, "id" | "subjectName" | "topicName" | "analysisOrigin"> & { id?: string }) {
    const userId = await this.userId();
    const payload = {
      user_id: userId,
      source_id: input.sourceId,
      subject_id: input.subjectId,
      topic_id: input.topicId ?? null,
      subtopic_text: input.subtopicText ?? null,
      question_count: input.questionCount,
      incidence_percentage: input.incidencePercentage,
      analysis_origin: "manual",
    };
    const response = input.id
      ? await this.supabase.from("source_topic_stats").update(payload).eq("id", input.id)
      : await this.supabase.from("source_topic_stats").insert(payload);
    if (response.error) throw toRepositoryError(response.error, "Não foi possível salvar a incidência.");
  }
}

export function getSourceRepository() {
  return new SourceRepository(createClient());
}
