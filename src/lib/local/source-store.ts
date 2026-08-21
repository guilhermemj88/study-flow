import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { getDatabase, getUploadsDirectory, newId, nowIso } from "@/lib/local/database";
import { ensureTaxonomyByNames } from "@/lib/local/study-store";
import type { SourceDraft, SourceLibraryData, SourceTopicStat, StudySource } from "@/types/source";

export const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024;
export const ALLOWED_SOURCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

interface SourceRow {
  id: string; name: string; source_type: StudySource["sourceType"]; institution: string | null;
  year: number | null; edition: string | null; description: string | null; storage_path: string | null;
  original_filename: string | null; mime_type: string | null; file_size: number | null; source_url: string | null;
  analysis_status: StudySource["analysisStatus"]; is_answer_key: number; created_at: string; updated_at: string;
}
interface LinkRow { id: string; study_plan_id: string; source_id: string; use_for_incidence: number; use_for_questions: number }
interface StatRow {
  id: string; source_id: string; subject_id: string; subject_name: string; topic_id: string | null;
  topic_name: string | null; subtopic_text: string | null; question_count: number;
  incidence_percentage: number; analysis_origin: SourceTopicStat["analysisOrigin"];
}

export interface LocalUpload {
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}

function fileExtension(upload: LocalUpload) {
  const fromName = extname(upload.name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (fromName) return fromName;
  return upload.type === "application/pdf" ? ".pdf" : upload.type === "image/png" ? ".png" : upload.type === "image/webp" ? ".webp" : ".jpg";
}

function validateUpload(upload: LocalUpload) {
  if (!ALLOWED_SOURCE_MIME_TYPES.includes(upload.type)) throw new Error("Formato inválido. Envie PDF, JPG, PNG ou WEBP.");
  if (upload.size > MAX_SOURCE_FILE_SIZE) throw new Error("O arquivo excede o limite de 20 MB.");
}

function resolveStoredFile(storagePath: string) {
  const root = resolve(getUploadsDirectory());
  const target = resolve(root, storagePath);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) throw new Error("Caminho de arquivo inválido.");
  return target;
}

export class LocalSourceStore {
  constructor(private readonly userId: string) {}

  load(): SourceLibraryData {
    const database = getDatabase();
    const sourceRows = database.prepare("SELECT * FROM sources WHERE user_id = ? ORDER BY created_at DESC").all(this.userId) as SourceRow[];
    const plan = database.prepare(`SELECT id, name FROM study_plans
      WHERE user_id = ? AND active = 1 AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`).get(this.userId) as { id: string; name: string } | undefined;
    const links = database.prepare("SELECT id, study_plan_id, source_id, use_for_incidence, use_for_questions FROM study_plan_sources WHERE user_id = ?").all(this.userId) as LinkRow[];
    const counts = database.prepare(`SELECT source_id, COUNT(*) count,
      SUM(CASE WHEN question_status = 'valid' THEN 1 ELSE 0 END) valid_count,
      SUM(CASE WHEN question_status = 'annulled' THEN 1 ELSE 0 END) annulled_count
      FROM questions WHERE user_id = ? GROUP BY source_id`).all(this.userId) as Array<{
        source_id: string; count: number; valid_count: number; annulled_count: number;
      }>;
    const statRows = database.prepare(`SELECT sts.*, s.name AS subject_name, t.name AS topic_name
      FROM source_topic_stats sts
      JOIN subjects s ON s.id = sts.subject_id AND s.user_id = sts.user_id
      LEFT JOIN topics t ON t.id = sts.topic_id AND t.user_id = sts.user_id
      WHERE sts.user_id = ? ORDER BY sts.incidence_percentage DESC`).all(this.userId) as StatRow[];
    return {
      activePlan: plan,
      sources: sourceRows.map((row) => {
        const link = links.find((item) => item.source_id === row.id && item.study_plan_id === plan?.id);
        return {
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
          sourceUrl: row.source_url ?? undefined,
          analysisStatus: row.analysis_status,
          isAnswerKey: Boolean(row.is_answer_key),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          questionCount: counts.find((item) => item.source_id === row.id)?.count ?? 0,
          validQuestionCount: counts.find((item) => item.source_id === row.id)?.valid_count ?? 0,
          annulledQuestionCount: counts.find((item) => item.source_id === row.id)?.annulled_count ?? 0,
          planSelection: link ? { id: link.id, planId: link.study_plan_id, useForIncidence: Boolean(link.use_for_incidence), useForQuestions: Boolean(link.use_for_questions) } : undefined,
          topicStats: statRows.filter((stat) => stat.source_id === row.id).map((stat) => ({ id: stat.id, sourceId: stat.source_id, subjectId: stat.subject_id, subjectName: stat.subject_name, topicId: stat.topic_id ?? undefined, topicName: stat.topic_name ?? undefined, subtopicText: stat.subtopic_text ?? undefined, questionCount: stat.question_count, incidencePercentage: stat.incidence_percentage, analysisOrigin: stat.analysis_origin })),
        } satisfies StudySource;
      }),
    };
  }

  create(draft: SourceDraft & { sourceUrl?: string }, upload?: LocalUpload) {
    if (upload) validateUpload(upload);
    const database = getDatabase();
    const id = newId(); const timestamp = nowIso();
    let storagePath: string | null = null;
    if (upload) storagePath = join(this.userId, "sources", id, `source${fileExtension(upload)}`).replaceAll("\\", "/");
    database.transaction(() => {
      database.prepare(`INSERT INTO sources (
        id, user_id, name, source_type, institution, year, edition, description, storage_path,
        original_filename, mime_type, file_size, source_url, analysis_status, is_answer_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, draft.name.trim(), draft.sourceType, draft.institution ?? null, draft.year ?? null,
          draft.edition ?? null, draft.description ?? null, storagePath, upload?.name ?? null, upload?.type ?? null,
          upload?.size ?? null, draft.sourceUrl ?? null, upload ? "pending" : "manual", Number(Boolean(draft.isAnswerKey)), timestamp, timestamp);
      const plan = database.prepare(`SELECT id FROM study_plans
        WHERE user_id = ? AND active = 1 AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`).get(this.userId) as { id: string } | undefined;
      if (plan) database.prepare(`INSERT INTO study_plan_sources (
        id, user_id, study_plan_id, source_id, use_for_incidence, use_for_questions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(newId(), this.userId, plan.id, id, Number(!draft.isAnswerKey), Number(!draft.isAnswerKey), timestamp, timestamp);
    })();
    if (upload && storagePath) {
      try {
        const target = resolveStoredFile(storagePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, upload.bytes);
      } catch (error) {
        database.prepare("DELETE FROM sources WHERE id = ? AND user_id = ?").run(id, this.userId);
        throw error;
      }
    }
    return id;
  }

  update(id: string, draft: Partial<SourceDraft & { sourceUrl?: string }>) {
    const database = getDatabase();
    const current = database.prepare("SELECT * FROM sources WHERE id = ? AND user_id = ?").get(id, this.userId) as SourceRow | undefined;
    if (!current) throw new Error("Fonte não encontrada.");
    const isAnswerKey = draft.isAnswerKey === undefined ? Boolean(current.is_answer_key) : draft.isAnswerKey;
    database.transaction(() => {
      database.prepare(`UPDATE sources SET name = ?, source_type = ?, institution = ?, year = ?, edition = ?,
        description = ?, source_url = ?, is_answer_key = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .run(draft.name ?? current.name, draft.sourceType ?? current.source_type,
          draft.institution === undefined ? current.institution : draft.institution || null,
          draft.year === undefined ? current.year : draft.year || null,
          draft.edition === undefined ? current.edition : draft.edition || null,
          draft.description === undefined ? current.description : draft.description || null,
          draft.sourceUrl === undefined ? current.source_url : draft.sourceUrl || null,
          Number(isAnswerKey), nowIso(), id, this.userId);
      if (isAnswerKey) database.prepare(`UPDATE study_plan_sources SET use_for_incidence = 0,
        use_for_questions = 0, updated_at = ? WHERE source_id = ? AND user_id = ?`).run(nowIso(), id, this.userId);
    })();
  }

  remove(id: string) {
    const database = getDatabase();
    const row = database.prepare("SELECT storage_path FROM sources WHERE id = ? AND user_id = ?").get(id, this.userId) as { storage_path: string | null } | undefined;
    if (!row) throw new Error("Fonte não encontrada.");
    database.prepare("DELETE FROM sources WHERE id = ? AND user_id = ?").run(id, this.userId);
    if (row.storage_path) {
      const target = resolveStoredFile(row.storage_path);
      if (existsSync(target)) unlinkSync(target);
    }
  }

  get(id: string) {
    const source = this.load().sources.find((item) => item.id === id);
    if (!source) throw new Error("Fonte não encontrada.");
    const analyses = getDatabase().prepare("SELECT id, status, summary, raw_content, created_at, updated_at FROM source_analyses WHERE source_id = ? AND user_id = ? ORDER BY created_at DESC").all(id, this.userId);
    return { ...source, analyses };
  }

  readFile(id: string) {
    const row = getDatabase().prepare("SELECT storage_path, original_filename, mime_type, file_size FROM sources WHERE id = ? AND user_id = ?").get(id, this.userId) as { storage_path: string | null; original_filename: string | null; mime_type: string | null; file_size: number | null } | undefined;
    if (!row?.storage_path) throw new Error("Esta fonte não possui arquivo local.");
    const path = resolveStoredFile(row.storage_path);
    if (!existsSync(path)) throw new Error("O arquivo local não foi encontrado.");
    return { bytes: readFileSync(path), filename: row.original_filename ?? "source", mimeType: row.mime_type ?? "application/octet-stream", size: row.file_size ?? undefined };
  }

  setPlanSelection(sourceId: string, planId: string, input: { useForIncidence: boolean; useForQuestions: boolean }) {
    const database = getDatabase(); const timestamp = nowIso();
    const plan = database.prepare(`SELECT 1 FROM study_plans
      WHERE id = ? AND user_id = ? AND archived_at IS NULL AND deleted_at IS NULL`).get(planId, this.userId);
    const source = database.prepare("SELECT is_answer_key FROM sources WHERE id = ? AND user_id = ?").get(sourceId, this.userId) as { is_answer_key: number } | undefined;
    if (!plan || !source) throw new Error("Plano ou fonte não encontrado.");
    database.prepare(`INSERT INTO study_plan_sources (id, user_id, study_plan_id, source_id, use_for_incidence, use_for_questions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, study_plan_id, source_id) DO UPDATE SET use_for_incidence = excluded.use_for_incidence,
        use_for_questions = excluded.use_for_questions, updated_at = excluded.updated_at`)
      .run(newId(), this.userId, planId, sourceId, Number(input.useForIncidence && !source.is_answer_key), Number(input.useForQuestions && !source.is_answer_key), timestamp, timestamp);
  }

  setAllPlanSources(planId: string, sourceIds: string[], active: boolean) {
    getDatabase().transaction(() => {
      for (const sourceId of sourceIds) this.setPlanSelection(sourceId, planId, { useForIncidence: active, useForQuestions: active });
    })();
  }

  saveTopicStat(input: { id?: string; sourceId: string; subjectId: string; topicId?: string; subtopicText?: string; questionCount: number; incidencePercentage: number; analysisOrigin?: SourceTopicStat["analysisOrigin"] }) {
    const database = getDatabase(); const timestamp = nowIso();
    const ownedSource = database.prepare("SELECT is_answer_key FROM sources WHERE id = ? AND user_id = ?").get(input.sourceId, this.userId) as { is_answer_key: number } | undefined;
    const ownedSubject = database.prepare("SELECT 1 FROM subjects WHERE id = ? AND user_id = ?").get(input.subjectId, this.userId);
    if (!ownedSource || !ownedSubject) throw new Error("Fonte ou matéria não encontrada.");
    if (ownedSource?.is_answer_key) throw new Error("Gabaritos são referências e não podem gerar incidência independente.");
    if (input.id) {
      const info = database.prepare(`UPDATE source_topic_stats SET subject_id = ?, topic_id = ?, subtopic_text = ?,
        question_count = ?, incidence_percentage = ?, analysis_origin = ?, updated_at = ? WHERE id = ? AND user_id = ? AND source_id = ?`)
        .run(input.subjectId, input.topicId ?? null, input.subtopicText ?? null, input.questionCount, input.incidencePercentage, input.analysisOrigin ?? "manual", timestamp, input.id, this.userId, input.sourceId);
      if (!info.changes) throw new Error("Incidência não encontrada.");
    } else {
      database.prepare(`INSERT INTO source_topic_stats (id, user_id, source_id, subject_id, topic_id, subtopic_text,
        question_count, incidence_percentage, analysis_origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(newId(), this.userId, input.sourceId, input.subjectId, input.topicId ?? null, input.subtopicText ?? null, input.questionCount, input.incidencePercentage, input.analysisOrigin ?? "manual", timestamp, timestamp);
    }
  }

  saveAnalysis(sourceId: string, input: { status: "pending" | "analyzed" | "error" | "manual"; summary: string; rawContent?: string }) {
    const database = getDatabase(); const timestamp = nowIso();
    const source = database.prepare("SELECT 1 FROM sources WHERE id = ? AND user_id = ?").get(sourceId, this.userId);
    if (!source) throw new Error("Fonte não encontrada.");
    database.transaction(() => {
      database.prepare("INSERT INTO source_analyses (id, user_id, source_id, status, summary, raw_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(newId(), this.userId, sourceId, input.status, input.summary, input.rawContent ?? null, timestamp, timestamp);
      database.prepare("UPDATE sources SET analysis_status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(input.status, timestamp, sourceId, this.userId);
    })();
  }

  saveTopicsByName(sourceId: string, items: Array<{ subject: string; topic?: string; subtopic?: string; questionCount: number; incidencePercentage: number }>, replace = true) {
    const database = getDatabase();
    database.transaction(() => {
      const source = database.prepare("SELECT is_answer_key FROM sources WHERE id = ? AND user_id = ?").get(sourceId, this.userId) as { is_answer_key: number } | undefined;
      if (!source) throw new Error("Fonte não encontrada.");
      if (source.is_answer_key) throw new Error("Gabaritos são referências e não podem gerar incidência independente.");
      if (replace) database.prepare("DELETE FROM source_topic_stats WHERE source_id = ? AND user_id = ?").run(sourceId, this.userId);
      for (const item of items) {
        const taxonomy = ensureTaxonomyByNames(this.userId, item.subject, item.topic);
        if (!taxonomy.subjectId) continue;
        this.saveTopicStat({ sourceId, subjectId: taxonomy.subjectId, topicId: taxonomy.topicId, subtopicText: item.subtopic, questionCount: item.questionCount, incidencePercentage: item.incidencePercentage, analysisOrigin: "mcp" });
      }
    })();
  }
}
