import { getDatabase, newId, nowIso } from "@/lib/local/database";
import type {
  ActivityDraft,
  ActivityResult,
  ErrorReason,
  QuestionAttemptSummary,
  StudyActivity,
  StudyData,
  StudyPlan,
  StudySubject,
} from "@/types/activity";

interface SubjectRow { id: string; name: string }
interface TopicRow { id: string; subject_id: string; name: string }
interface PlanRow { id: string; name: string; target_exam_name: string | null; exam_date: string | null }
interface ActivityRow {
  id: string; study_plan_id: string | null; subject_id: string; topic_id: string;
  activity_type: StudyActivity["type"]; scheduled_date: string; estimated_minutes: number;
  question_count: number | null; priority: StudyActivity["priority"]; status: StudyActivity["status"];
  exercise_origin: StudyActivity["exerciseOrigin"]; linked_study_activity_id: string | null;
  notes: string | null; completed_at: string | null; created_at: string;
}
interface ResultRow {
  activity_id: string; actual_minutes: number | null; questions_answered: number | null;
  correct_answers: number | null; wrong_answers: number | null; accuracy: number | null;
  perceived_difficulty: ActivityResult["perceivedDifficulty"]; error_reasons_json: string;
  study_methods_json: string; notes: string | null;
}
interface ErrorDetailRow {
  activity_id: string; topic_id: string | null; topic_text: string | null; subtopic_text: string | null;
  error_count: number; error_reason: ErrorReason; notes: string | null;
}
interface AttemptSummaryRow {
  id: string; activity_id: string | null; correct: number; answered_at: string;
  subject_name: string | null; topic_name: string | null;
}

function parseArray<T>(value: string): T[] {
  try { return JSON.parse(value) as T[]; } catch { return []; }
}

export function ensureSubjectAndTopic(userId: string, subjectName: string, topicName: string) {
  const database = getDatabase();
  const timestamp = nowIso();
  let subject = database.prepare("SELECT id, name FROM subjects WHERE user_id = ? AND name = ? COLLATE NOCASE")
    .get(userId, subjectName.trim()) as SubjectRow | undefined;
  if (!subject) {
    subject = { id: newId(), name: subjectName.trim() };
    database.prepare("INSERT INTO subjects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(subject.id, userId, subject.name, timestamp, timestamp);
  }
  let topic = database.prepare("SELECT id, subject_id, name FROM topics WHERE user_id = ? AND subject_id = ? AND name = ? COLLATE NOCASE")
    .get(userId, subject.id, topicName.trim()) as TopicRow | undefined;
  if (!topic) {
    topic = { id: newId(), subject_id: subject.id, name: topicName.trim() };
    database.prepare("INSERT INTO topics (id, user_id, subject_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(topic.id, userId, subject.id, topic.name, timestamp, timestamp);
  }
  return { subject, topic };
}

export function ensureTaxonomyByNames(userId: string, subjectName?: string, topicName?: string) {
  if (!subjectName?.trim()) return { subjectId: undefined, topicId: undefined };
  const fallbackTopic = topicName?.trim() || "Geral";
  const result = getDatabase().transaction(() => ensureSubjectAndTopic(userId, subjectName, fallbackTopic))();
  return { subjectId: result.subject.id, topicId: topicName?.trim() ? result.topic.id : undefined };
}

export class LocalStudyStore {
  constructor(private readonly userId: string) {}

  load(): StudyData {
    const database = getDatabase();
    const subjectsRows = database.prepare("SELECT id, name FROM subjects WHERE user_id = ? ORDER BY name").all(this.userId) as SubjectRow[];
    const topicRows = database.prepare("SELECT id, subject_id, name FROM topics WHERE user_id = ? ORDER BY name").all(this.userId) as TopicRow[];
    const planRow = database.prepare("SELECT id, name, target_exam_name, exam_date FROM study_plans WHERE user_id = ? AND active = 1 LIMIT 1").get(this.userId) as PlanRow | undefined;
    const activityRows = database.prepare("SELECT * FROM activities WHERE user_id = ? ORDER BY scheduled_date, created_at").all(this.userId) as ActivityRow[];
    const resultRows = database.prepare("SELECT * FROM activity_results WHERE user_id = ?").all(this.userId) as ResultRow[];
    const errorRows = database.prepare("SELECT * FROM activity_error_details WHERE user_id = ?").all(this.userId) as ErrorDetailRow[];
    const attemptRows = database.prepare(`SELECT qa.id, qa.activity_id, qa.correct, qa.answered_at,
      s.name AS subject_name, t.name AS topic_name
      FROM question_attempts qa
      JOIN questions q ON q.id = qa.question_id AND q.user_id = qa.user_id
      LEFT JOIN subjects s ON s.id = q.subject_id AND s.user_id = q.user_id
      LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
      WHERE qa.user_id = ? ORDER BY qa.answered_at DESC`).all(this.userId) as AttemptSummaryRow[];

    const subjects = subjectsRows.map<StudySubject>((subject) => {
      const records = topicRows.filter((topic) => topic.subject_id === subject.id);
      return { id: subject.id, name: subject.name, topics: records.map((topic) => topic.name), topicRecords: records.map(({ id, name }) => ({ id, name })) };
    });
    const subjectNames = new Map(subjectsRows.map((subject) => [subject.id, subject.name]));
    const topicNames = new Map(topicRows.map((topic) => [topic.id, topic.name]));
    const results = new Map(resultRows.map((result) => [result.activity_id, result]));
    const activities = activityRows.map((activity) => this.mapActivity(activity, subjectNames, topicNames, results.get(activity.id), errorRows.filter((detail) => detail.activity_id === activity.id)));
    const activePlan: StudyPlan | undefined = planRow ? { id: planRow.id, name: planRow.name, targetExamName: planRow.target_exam_name ?? undefined, examDate: planRow.exam_date ?? undefined } : undefined;
    const attemptSummaries: QuestionAttemptSummary[] = attemptRows.flatMap((attempt) => attempt.subject_name ? [{ id: attempt.id, activityId: attempt.activity_id ?? undefined, subject: attempt.subject_name, topic: attempt.topic_name ?? undefined, correct: Boolean(attempt.correct), answeredAt: attempt.answered_at }] : []);
    return { activities, subjects, activePlan, attemptSummaries };
  }

  private mapActivity(row: ActivityRow, subjectNames: Map<string, string>, topicNames: Map<string, string>, result?: ResultRow, errorRows: ErrorDetailRow[] = []): StudyActivity {
    return {
      id: row.id,
      planId: row.study_plan_id ?? undefined,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      type: row.activity_type,
      subject: subjectNames.get(row.subject_id) ?? "Matéria",
      topic: topicNames.get(row.topic_id) ?? "Assunto",
      date: row.scheduled_date,
      estimatedMinutes: row.estimated_minutes,
      questionCount: row.question_count ?? undefined,
      priority: row.priority,
      status: row.status,
      exerciseOrigin: row.exercise_origin ?? "manual",
      linkedStudyActivityId: row.linked_study_activity_id ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      result: result ? {
        actualMinutes: result.actual_minutes ?? undefined,
        questionsAnswered: result.questions_answered ?? undefined,
        correctAnswers: result.correct_answers ?? undefined,
        wrongAnswers: result.wrong_answers ?? undefined,
        accuracy: result.accuracy ?? undefined,
        perceivedDifficulty: result.perceived_difficulty,
        errorReasons: parseArray(result.error_reasons_json),
        studyMethods: parseArray(result.study_methods_json),
        notes: result.notes ?? undefined,
        errorDetails: errorRows.map((detail) => ({ topicId: detail.topic_id ?? undefined, topicText: detail.topic_text ?? (detail.topic_id ? topicNames.get(detail.topic_id) : undefined) ?? "Tema", subtopicText: detail.subtopic_text ?? undefined, errorCount: detail.error_count, errorReason: detail.error_reason, notes: detail.notes ?? undefined })),
      } : undefined,
    };
  }

  createActivity(draft: ActivityDraft): StudyActivity {
    const database = getDatabase();
    const id = newId();
    const timestamp = nowIso();
    const created = database.transaction(() => {
      const { subject, topic } = ensureSubjectAndTopic(this.userId, draft.subject, draft.topic);
      const planId = draft.planId ?? (database.prepare("SELECT id FROM study_plans WHERE user_id = ? AND active = 1 LIMIT 1").get(this.userId) as { id: string } | undefined)?.id;
      database.prepare(`INSERT INTO activities (
        id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date,
        estimated_minutes, question_count, priority, status, exercise_origin,
        linked_study_activity_id, notes, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, planId ?? null, subject.id, topic.id, draft.type, draft.date, draft.estimatedMinutes, draft.questionCount ?? null, draft.priority, draft.status, draft.exerciseOrigin ?? "manual", draft.linkedStudyActivityId ?? null, draft.notes ?? null, draft.status === "completed" ? timestamp : null, timestamp, timestamp);
      return { subject, topic, planId };
    })();
    return { ...draft, id, planId: created.planId, subjectId: created.subject.id, topicId: created.topic.id, createdAt: timestamp, completedAt: draft.status === "completed" ? timestamp : undefined };
  }

  updateActivity(id: string, updates: Partial<StudyActivity>) {
    const database = getDatabase();
    const existing = database.prepare("SELECT * FROM activities WHERE id = ? AND user_id = ?").get(id, this.userId) as ActivityRow | undefined;
    if (!existing) throw new Error("Atividade não encontrada.");
    let subjectId = updates.subjectId ?? existing.subject_id;
    let topicId = updates.topicId ?? existing.topic_id;
    if (updates.subject || updates.topic) {
      const currentSubject = database.prepare("SELECT name FROM subjects WHERE id = ? AND user_id = ?").get(existing.subject_id, this.userId) as { name: string };
      const currentTopic = database.prepare("SELECT name FROM topics WHERE id = ? AND user_id = ?").get(existing.topic_id, this.userId) as { name: string };
      const resolved = database.transaction(() => ensureSubjectAndTopic(this.userId, updates.subject ?? currentSubject.name, updates.topic ?? currentTopic.name))();
      subjectId = resolved.subject.id;
      topicId = resolved.topic.id;
    }
    const completedAt = updates.completedAt !== undefined
      ? updates.completedAt
      : updates.status === "completed" ? existing.completed_at ?? nowIso()
        : updates.status ? null : existing.completed_at;
    database.prepare(`UPDATE activities SET study_plan_id = ?, subject_id = ?, topic_id = ?, activity_type = ?,
      scheduled_date = ?, estimated_minutes = ?, question_count = ?, priority = ?, status = ?, exercise_origin = ?,
      linked_study_activity_id = ?, notes = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(updates.planId ?? existing.study_plan_id, subjectId, topicId, updates.type ?? existing.activity_type,
        updates.date ?? existing.scheduled_date, updates.estimatedMinutes ?? existing.estimated_minutes,
        updates.questionCount === undefined ? existing.question_count : updates.questionCount,
        updates.priority ?? existing.priority, updates.status ?? existing.status, updates.exerciseOrigin ?? existing.exercise_origin,
        updates.linkedStudyActivityId ?? existing.linked_study_activity_id, updates.notes === undefined ? existing.notes : updates.notes,
        completedAt, nowIso(), id, this.userId);
  }

  completeActivity(activityId: string, result: ActivityResult) {
    const database = getDatabase();
    const activity = database.prepare("SELECT subject_id, topic_id FROM activities WHERE id = ? AND user_id = ?").get(activityId, this.userId) as { subject_id: string; topic_id: string } | undefined;
    if (!activity) throw new Error("Atividade não encontrada.");
    const timestamp = nowIso();
    database.transaction(() => {
      database.prepare("UPDATE activities SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(timestamp, timestamp, activityId, this.userId);
      database.prepare(`INSERT INTO activity_results (
        id, user_id, activity_id, actual_minutes, questions_answered, correct_answers, wrong_answers,
        accuracy, perceived_difficulty, error_reasons_json, study_methods_json, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, activity_id) DO UPDATE SET actual_minutes = excluded.actual_minutes,
        questions_answered = excluded.questions_answered, correct_answers = excluded.correct_answers,
        wrong_answers = excluded.wrong_answers, accuracy = excluded.accuracy,
        perceived_difficulty = excluded.perceived_difficulty, error_reasons_json = excluded.error_reasons_json,
        study_methods_json = excluded.study_methods_json, notes = excluded.notes, updated_at = excluded.updated_at`)
        .run(newId(), this.userId, activityId, result.actualMinutes ?? null, result.questionsAnswered ?? null,
          result.correctAnswers ?? null, result.wrongAnswers ?? null, result.accuracy ?? null, result.perceivedDifficulty,
          JSON.stringify(result.errorReasons ?? []), JSON.stringify(result.studyMethods ?? []), result.notes ?? null, timestamp, timestamp);
      database.prepare("DELETE FROM activity_error_details WHERE activity_id = ? AND user_id = ?").run(activityId, this.userId);
      const insertDetail = database.prepare(`INSERT INTO activity_error_details (
        id, user_id, activity_id, subject_id, topic_id, topic_text, subtopic_text, error_count,
        error_reason, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const detail of result.errorDetails ?? []) {
        insertDetail.run(newId(), this.userId, activityId, activity.subject_id, detail.topicId ?? activity.topic_id,
          detail.topicText, detail.subtopicText ?? null, detail.errorCount, detail.errorReason, detail.notes ?? null, timestamp, timestamp);
      }
    })();
  }

  deleteActivity(id: string) {
    const info = getDatabase().prepare("DELETE FROM activities WHERE id = ? AND user_id = ?").run(id, this.userId);
    if (!info.changes) throw new Error("Atividade não encontrada.");
  }

  createSubject(name: string): StudySubject {
    const id = newId(); const timestamp = nowIso();
    getDatabase().prepare("INSERT INTO subjects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, this.userId, name.trim(), timestamp, timestamp);
    return { id, name: name.trim(), topics: [], topicRecords: [] };
  }

  updateSubject(id: string, updates: Partial<StudySubject>) {
    const database = getDatabase();
    const current = database.prepare("SELECT id, name FROM subjects WHERE id = ? AND user_id = ?").get(id, this.userId) as SubjectRow | undefined;
    if (!current) throw new Error("Matéria não encontrada.");
    database.transaction(() => {
      if (updates.name?.trim() && updates.name.trim() !== current.name) database.prepare("UPDATE subjects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(updates.name.trim(), nowIso(), id, this.userId);
      if (updates.topics) {
        const rows = database.prepare("SELECT id, subject_id, name FROM topics WHERE subject_id = ? AND user_id = ?").all(id, this.userId) as TopicRow[];
        const wanted = new Set(updates.topics.map((name) => name.trim().toLowerCase()).filter(Boolean));
        for (const row of rows.filter((topic) => !wanted.has(topic.name.toLowerCase()))) database.prepare("DELETE FROM topics WHERE id = ? AND user_id = ?").run(row.id, this.userId);
        const currentNames = new Set(rows.map((topic) => topic.name.toLowerCase()));
        for (const name of updates.topics.map((item) => item.trim()).filter(Boolean)) {
          if (!currentNames.has(name.toLowerCase())) database.prepare("INSERT INTO topics (id, user_id, subject_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(newId(), this.userId, id, name, nowIso(), nowIso());
        }
      }
    })();
  }

  deleteSubject(id: string) {
    const info = getDatabase().prepare("DELETE FROM subjects WHERE id = ? AND user_id = ?").run(id, this.userId);
    if (!info.changes) throw new Error("Matéria não encontrada ou ainda está em uso.");
  }

  listCalendar(dateFrom: string, dateTo: string) {
    return this.load().activities.filter((activity) => activity.date >= dateFrom && activity.date <= dateTo);
  }
}
