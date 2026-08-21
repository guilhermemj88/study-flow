import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { buildBasicReviewSchedule, getStudyMethod } from "@/lib/study-methods";
import type {
  ActivityDraft,
  ActivityResult,
  ErrorReason,
  QuestionAttemptSummary,
  StudyActivity,
  StudyData,
  StudyPlan,
  StudyPlanDraft,
  StudySubject,
} from "@/types/activity";
import type { ReviewRule, StudyMode } from "@/types/study-method";

type SqliteDatabase = ReturnType<typeof getDatabase>;

interface SubjectRow { id: string; name: string }
interface TopicRow { id: string; subject_id: string; name: string }
interface PlanRow {
  id: string;
  name: string;
  target_exam_name: string | null;
  exam_date: string | null;
  study_mode: StudyMode;
  active: number;
  archived_at: string | null;
  deleted_at: string | null;
}
interface ActivityRow {
  id: string; study_plan_id: string | null; subject_id: string; topic_id: string;
  activity_type: StudyActivity["type"]; scheduled_date: string; estimated_minutes: number;
  question_count: number | null; priority: StudyActivity["priority"]; status: StudyActivity["status"];
  exercise_origin: StudyActivity["exerciseOrigin"]; linked_study_activity_id: string | null;
  notes: string | null; completed_at: string | null; created_at: string;
  planning_origin: StudyActivity["planningOrigin"]; focus_label: string | null; subtopic_text: string | null;
  sequence_key: string | null; sequence_step: string | null; adaptive_reason: string | null;
  planner_error_reason: ErrorReason | null; base_weight: number | null; adaptive_weight: number | null;
  review_sequence: number | null; review_rule: ReviewRule | null;
  deleted_at: string | null;
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

function mapPlan(row: PlanRow): StudyPlan {
  return {
    id: row.id,
    name: row.name,
    targetExamName: row.target_exam_name ?? undefined,
    examDate: row.exam_date ?? undefined,
    studyMode: row.study_mode,
    active: Boolean(row.active),
    archivedAt: row.archived_at ?? undefined,
  };
}

function brazilTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
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

  private planRow(planId?: string | null): PlanRow {
    const row = getDatabase().prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
      FROM study_plans WHERE user_id = ? AND ${planId ? "id = ?" : "active = 1"}
        AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`)
      .get(...(planId ? [this.userId, planId] : [this.userId])) as PlanRow | undefined;
    if (!row) throw new Error(planId ? "Calendário não encontrado." : "Nenhum calendário ativo foi encontrado.");
    return row;
  }

  load(): StudyData {
    const database = getDatabase();
    const subjectsRows = database.prepare("SELECT id, name FROM subjects WHERE user_id = ? ORDER BY name").all(this.userId) as SubjectRow[];
    const topicRows = database.prepare("SELECT id, subject_id, name FROM topics WHERE user_id = ? ORDER BY name").all(this.userId) as TopicRow[];
    const planRows = database.prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
      FROM study_plans WHERE user_id = ? AND archived_at IS NULL AND deleted_at IS NULL
      ORDER BY active DESC, created_at, name`).all(this.userId) as PlanRow[];
    const planRow = planRows.find((plan) => Boolean(plan.active));
    const activityRows = planRow
      ? database.prepare("SELECT * FROM activities WHERE user_id = ? AND study_plan_id = ? AND deleted_at IS NULL ORDER BY scheduled_date, created_at").all(this.userId, planRow.id) as ActivityRow[]
      : [];
    const resultRows = planRow
      ? database.prepare(`SELECT results.* FROM activity_results results
          JOIN activities activity ON activity.id = results.activity_id AND activity.user_id = results.user_id
          WHERE results.user_id = ? AND activity.study_plan_id = ? AND activity.deleted_at IS NULL`).all(this.userId, planRow.id) as ResultRow[]
      : [];
    const errorRows = planRow
      ? database.prepare(`SELECT details.* FROM activity_error_details details
          JOIN activities activity ON activity.id = details.activity_id AND activity.user_id = details.user_id
          WHERE details.user_id = ? AND activity.study_plan_id = ? AND activity.deleted_at IS NULL`).all(this.userId, planRow.id) as ErrorDetailRow[]
      : [];
    const attemptRows = database.prepare(`SELECT qa.id, qa.activity_id, qa.correct, qa.answered_at,
      s.name AS subject_name, t.name AS topic_name
      FROM question_attempts qa
      JOIN questions q ON q.id = qa.question_id AND q.user_id = qa.user_id
      LEFT JOIN subjects s ON s.id = q.subject_id AND s.user_id = q.user_id
      LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
      WHERE qa.user_id = ? AND q.question_status = 'valid' ORDER BY qa.answered_at DESC`).all(this.userId) as AttemptSummaryRow[];

    const subjects = subjectsRows.map<StudySubject>((subject) => {
      const records = topicRows.filter((topic) => topic.subject_id === subject.id);
      return { id: subject.id, name: subject.name, topics: records.map((topic) => topic.name), topicRecords: records.map(({ id, name }) => ({ id, name })) };
    });
    const subjectNames = new Map(subjectsRows.map((subject) => [subject.id, subject.name]));
    const topicNames = new Map(topicRows.map((topic) => [topic.id, topic.name]));
    const results = new Map(resultRows.map((result) => [result.activity_id, result]));
    const activities = activityRows.map((activity) => this.mapActivity(activity, subjectNames, topicNames, results.get(activity.id), errorRows.filter((detail) => detail.activity_id === activity.id)));
    const plans = planRows.map(mapPlan);
    const activePlan = plans.find((plan) => plan.active);
    const attemptSummaries: QuestionAttemptSummary[] = attemptRows.flatMap((attempt) => attempt.subject_name ? [{ id: attempt.id, activityId: attempt.activity_id ?? undefined, subject: attempt.subject_name, topic: attempt.topic_name ?? undefined, correct: Boolean(attempt.correct), answeredAt: attempt.answered_at }] : []);
    return { activities, subjects, activePlan, plans, attemptSummaries };
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
      reviewSequence: row.review_sequence ?? undefined,
      reviewRule: row.review_rule ?? undefined,
      planningOrigin: row.planning_origin ?? "manual",
      focusLabel: row.focus_label ?? undefined,
      subtopic: row.subtopic_text ?? undefined,
      sequenceKey: row.sequence_key ?? undefined,
      sequenceStep: row.sequence_step ?? undefined,
      adaptiveReason: row.adaptive_reason ?? undefined,
      plannerErrorReason: row.planner_error_reason ?? undefined,
      baseWeight: row.base_weight ?? undefined,
      adaptiveWeight: row.adaptive_weight ?? undefined,
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

  private syncBasicReviews(database: SqliteDatabase, original: {
    id: string;
    planId: string;
    subjectId: string;
    topicId: string;
    date: string;
    priority: StudyActivity["priority"];
    focusLabel?: string | null;
    subtopic?: string | null;
  }) {
    const timestamp = nowIso();
    const existing = database.prepare(`SELECT id, status, review_sequence FROM activities
      WHERE user_id = ? AND study_plan_id = ? AND linked_study_activity_id = ?
        AND activity_type = 'review' AND review_sequence IS NOT NULL`)
      .all(this.userId, original.planId, original.id) as Array<{ id: string; status: StudyActivity["status"]; review_sequence: number }>;
    const bySequence = new Map(existing.map((review) => [review.review_sequence, review]));

    for (const review of buildBasicReviewSchedule(original.date)) {
      const current = bySequence.get(review.sequence);
      if (current) {
        if (current.status === "planned" || current.status === "attention") {
          database.prepare(`UPDATE activities SET subject_id = ?, topic_id = ?, scheduled_date = ?, priority = ?,
            focus_label = ?, subtopic_text = ?, review_rule = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`)
            .run(original.subjectId, original.topicId, review.date, original.priority, original.focusLabel ?? null,
              original.subtopic ?? null, review.rule, timestamp, current.id, this.userId);
        }
        continue;
      }
      database.prepare(`INSERT INTO activities (
        id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date,
        estimated_minutes, question_count, priority, status, exercise_origin,
        linked_study_activity_id, notes, completed_at, created_at, updated_at,
        planning_origin, focus_label, subtopic_text, review_sequence, review_rule
      ) VALUES (?, ?, ?, ?, ?, 'review', ?, 15, NULL, ?, 'planned', 'manual', ?, NULL, NULL, ?, ?, 'manual', ?, ?, ?, ?)`)
        .run(newId(), this.userId, original.planId, original.subjectId, original.topicId, review.date,
          original.priority, original.id, timestamp, timestamp, original.focusLabel ?? null,
          original.subtopic ?? null, review.sequence, review.rule);
    }
  }

  createActivity(draft: ActivityDraft): StudyActivity {
    const database = getDatabase();
    const id = newId();
    const timestamp = nowIso();
    const created = database.transaction(() => {
      const { subject, topic } = ensureSubjectAndTopic(this.userId, draft.subject, draft.topic);
      const plan = this.planRow(draft.planId);
      const method = getStudyMethod(plan.study_mode);
      if (plan.study_mode === "basic" && draft.type !== "study" && draft.type !== "review") {
        throw new Error("O modo Básico aceita apenas estudos e revisões.");
      }
      if (draft.linkedStudyActivityId) {
        const linked = database.prepare("SELECT study_plan_id FROM activities WHERE id = ? AND user_id = ?")
          .get(draft.linkedStudyActivityId, this.userId) as { study_plan_id: string | null } | undefined;
        if (!linked || linked.study_plan_id !== plan.id) throw new Error("A atividade vinculada não pertence a este calendário.");
      }
      database.prepare(`INSERT INTO activities (
        id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date,
        estimated_minutes, question_count, priority, status, exercise_origin,
        linked_study_activity_id, notes, completed_at, created_at, updated_at,
        planning_origin, focus_label, subtopic_text, sequence_key, sequence_step,
        adaptive_reason, planner_error_reason, base_weight, adaptive_weight,
        review_sequence, review_rule
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, plan.id, subject.id, topic.id, draft.type, draft.date, draft.estimatedMinutes,
          draft.questionCount ?? null, draft.priority, draft.status, draft.exerciseOrigin ?? "manual",
          draft.linkedStudyActivityId ?? null, draft.notes ?? null, draft.status === "completed" ? timestamp : null,
          timestamp, timestamp, draft.planningOrigin ?? "manual", draft.focusLabel ?? null, draft.subtopic ?? null,
          draft.sequenceKey ?? null, draft.sequenceStep ?? null, draft.adaptiveReason ?? null,
          draft.plannerErrorReason ?? null, draft.baseWeight ?? null, draft.adaptiveWeight ?? null,
          draft.reviewSequence ?? null, draft.reviewRule ?? null);
      if (method.capabilities.automaticReviews && draft.type === "study" && !draft.reviewSequence) {
        this.syncBasicReviews(database, {
          id,
          planId: plan.id,
          subjectId: subject.id,
          topicId: topic.id,
          date: draft.date,
          priority: draft.priority,
          focusLabel: draft.focusLabel,
          subtopic: draft.subtopic,
        });
      }
      return { subject, topic, plan };
    })();
    return {
      ...draft,
      id,
      planId: created.plan.id,
      subjectId: created.subject.id,
      topicId: created.topic.id,
      createdAt: timestamp,
      completedAt: draft.status === "completed" ? timestamp : undefined,
    };
  }

  updateActivity(id: string, updates: Partial<StudyActivity>) {
    const database = getDatabase();
    database.transaction(() => {
      const existing = database.prepare("SELECT * FROM activities WHERE id = ? AND user_id = ?").get(id, this.userId) as ActivityRow | undefined;
      if (!existing) throw new Error("Atividade não encontrada.");
      const plan = this.planRow(existing.study_plan_id);
      const nextType = updates.type ?? existing.activity_type;
      if (plan.study_mode === "basic" && nextType !== "study" && nextType !== "review") {
        throw new Error("O modo Básico aceita apenas estudos e revisões.");
      }
      if (updates.linkedStudyActivityId) {
        const linked = database.prepare("SELECT study_plan_id FROM activities WHERE id = ? AND user_id = ?")
          .get(updates.linkedStudyActivityId, this.userId) as { study_plan_id: string | null } | undefined;
        if (!linked || linked.study_plan_id !== plan.id) throw new Error("A atividade vinculada não pertence a este calendário.");
      }
      let subjectId = updates.subjectId ?? existing.subject_id;
      let topicId = updates.topicId ?? existing.topic_id;
      if (updates.subject || updates.topic) {
        const currentSubject = database.prepare("SELECT name FROM subjects WHERE id = ? AND user_id = ?").get(existing.subject_id, this.userId) as { name: string };
        const currentTopic = database.prepare("SELECT name FROM topics WHERE id = ? AND user_id = ?").get(existing.topic_id, this.userId) as { name: string };
        const resolved = ensureSubjectAndTopic(this.userId, updates.subject ?? currentSubject.name, updates.topic ?? currentTopic.name);
        subjectId = resolved.subject.id;
        topicId = resolved.topic.id;
      }
      const nextStatus = updates.status ?? existing.status;
      const completedAt = updates.completedAt !== undefined
        ? updates.completedAt
        : nextStatus === "completed" ? existing.completed_at ?? nowIso()
          : updates.status ? null : existing.completed_at;
      database.prepare(`UPDATE activities SET subject_id = ?, topic_id = ?, activity_type = ?,
        scheduled_date = ?, estimated_minutes = ?, question_count = ?, priority = ?, status = ?, exercise_origin = ?,
        linked_study_activity_id = ?, notes = ?, completed_at = ?, planning_origin = ?, focus_label = ?,
        subtopic_text = ?, adaptive_reason = ?, planner_error_reason = ?, base_weight = ?, adaptive_weight = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`)
        .run(subjectId, topicId, nextType, updates.date ?? existing.scheduled_date,
          updates.estimatedMinutes ?? existing.estimated_minutes,
          updates.questionCount === undefined ? existing.question_count : updates.questionCount,
          updates.priority ?? existing.priority, nextStatus, updates.exerciseOrigin ?? existing.exercise_origin,
          updates.linkedStudyActivityId ?? existing.linked_study_activity_id,
          updates.notes === undefined ? existing.notes : updates.notes, completedAt,
          updates.planningOrigin ?? existing.planning_origin, updates.focusLabel === undefined ? existing.focus_label : updates.focusLabel,
          updates.subtopic === undefined ? existing.subtopic_text : updates.subtopic,
          updates.adaptiveReason === undefined ? existing.adaptive_reason : updates.adaptiveReason,
          updates.plannerErrorReason === undefined ? existing.planner_error_reason : updates.plannerErrorReason,
          updates.baseWeight === undefined ? existing.base_weight : updates.baseWeight,
          updates.adaptiveWeight === undefined ? existing.adaptive_weight : updates.adaptiveWeight,
          nowIso(), id, this.userId);

      const canRefreshReviews = getStudyMethod(plan.study_mode).capabilities.automaticReviews
        && existing.activity_type === "study"
        && existing.review_sequence === null
        && existing.status !== "completed"
        && existing.status !== "not_done"
        && nextType === "study";
      if (canRefreshReviews) {
        this.syncBasicReviews(database, {
          id,
          planId: plan.id,
          subjectId,
          topicId,
          date: updates.date ?? existing.scheduled_date,
          priority: updates.priority ?? existing.priority,
          focusLabel: updates.focusLabel === undefined ? existing.focus_label : updates.focusLabel,
          subtopic: updates.subtopic === undefined ? existing.subtopic_text : updates.subtopic,
        });
      }
    })();
  }

  completeActivity(activityId: string, result: ActivityResult) {
    const database = getDatabase();
    const activity = database.prepare(`SELECT activity.subject_id, activity.topic_id, activity.study_plan_id,
      plan.study_mode FROM activities activity
      JOIN study_plans plan ON plan.id = activity.study_plan_id AND plan.user_id = activity.user_id
      WHERE activity.id = ? AND activity.user_id = ?`).get(activityId, this.userId) as {
        subject_id: string; topic_id: string; study_plan_id: string; study_mode: StudyMode;
      } | undefined;
    if (!activity) throw new Error("Atividade não encontrada.");
    const timestamp = nowIso();
    if (getStudyMethod(activity.study_mode).capabilities.simpleActivityCompletion) {
      database.prepare("UPDATE activities SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(timestamp, timestamp, activityId, this.userId);
      return;
    }
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
    const database = getDatabase();
    database.transaction(() => {
      const activity = database.prepare(`SELECT activity.id, activity.activity_type, activity.review_sequence,
        plan.study_mode FROM activities activity
        LEFT JOIN study_plans plan ON plan.id = activity.study_plan_id AND plan.user_id = activity.user_id
        WHERE activity.id = ? AND activity.user_id = ?`).get(id, this.userId) as {
          id: string; activity_type: StudyActivity["type"]; review_sequence: number | null; study_mode: StudyMode | null;
        } | undefined;
      if (!activity) throw new Error("Atividade não encontrada.");
      if (activity.study_mode === "basic" && activity.activity_type === "study" && activity.review_sequence === null) {
        database.prepare(`DELETE FROM activities WHERE user_id = ? AND linked_study_activity_id = ?
          AND activity_type = 'review' AND status IN ('planned', 'attention') AND scheduled_date >= ?`)
          .run(this.userId, id, brazilTodayKey());
        const preservedHistory = database.prepare("SELECT 1 FROM activities WHERE user_id = ? AND linked_study_activity_id = ? LIMIT 1")
          .get(this.userId, id);
        if (preservedHistory) {
          database.prepare("UPDATE activities SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
            .run(nowIso(), nowIso(), id, this.userId);
          return;
        }
      } else if (activity.study_mode === "advanced") {
        const linked = database.prepare("SELECT 1 FROM activities WHERE user_id = ? AND linked_study_activity_id = ? LIMIT 1")
          .get(this.userId, id);
        if (linked) throw new Error("A atividade ainda possui exercícios ou revisões vinculados.");
      }
      database.prepare("DELETE FROM activities WHERE id = ? AND user_id = ?").run(id, this.userId);
    })();
  }

  createPlan(draft: StudyPlanDraft): StudyPlan {
    const name = draft.name.trim();
    if (name.length < 2) throw new Error("Informe um nome com pelo menos 2 caracteres.");
    getStudyMethod(draft.studyMode);
    const database = getDatabase();
    const id = newId();
    const timestamp = nowIso();
    database.transaction(() => {
      database.prepare("UPDATE study_plans SET active = 0, updated_at = ? WHERE user_id = ? AND active = 1")
        .run(timestamp, this.userId);
      database.prepare(`INSERT INTO study_plans (id, user_id, name, active, study_mode, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)`)
        .run(id, this.userId, name, draft.studyMode, timestamp, timestamp);
    })();
    return { id, name, studyMode: draft.studyMode, active: true };
  }

  activatePlan(id: string): StudyPlan {
    const database = getDatabase();
    const plan = this.planRow(id);
    if (plan.active) return mapPlan(plan);
    const timestamp = nowIso();
    database.transaction(() => {
      database.prepare("UPDATE study_plans SET active = 0, updated_at = ? WHERE user_id = ? AND active = 1")
        .run(timestamp, this.userId);
      database.prepare("UPDATE study_plans SET active = 1, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(timestamp, id, this.userId);
    })();
    return { ...mapPlan(plan), active: true };
  }

  listPlans(options: { archived?: boolean } = {}): StudyPlan[] {
    const archived = Boolean(options.archived);
    const rows = getDatabase().prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
      FROM study_plans
      WHERE user_id = ? AND deleted_at IS NULL
        AND archived_at IS ${archived ? "NOT NULL" : "NULL"}
      ORDER BY ${archived ? "archived_at DESC" : "active DESC, created_at, name"}`)
      .all(this.userId) as PlanRow[];
    return rows.map(mapPlan);
  }

  renamePlan(id: string, rawName: string): StudyPlan {
    const name = rawName.trim();
    if (!name) throw new Error("Informe um nome para o calendário.");
    const database = getDatabase();
    const row = database.prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
      FROM study_plans WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
      .get(id, this.userId) as PlanRow | undefined;
    if (!row) throw new Error("Calendário não encontrado.");
    database.prepare("UPDATE study_plans SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(name, nowIso(), id, this.userId);
    return { ...mapPlan(row), name };
  }

  archivePlan(id: string): StudyPlan {
    const database = getDatabase();
    const timestamp = nowIso();
    return database.transaction(() => {
      const plan = this.planRow(id);
      const alternatives = database.prepare(`SELECT id, active FROM study_plans
        WHERE user_id = ? AND id <> ? AND archived_at IS NULL AND deleted_at IS NULL
        ORDER BY active DESC, created_at, id`).all(this.userId, id) as Array<{ id: string; active: number }>;
      if (!alternatives.length) {
        throw new Error("Crie outro calendário antes de arquivar o único calendário disponível.");
      }
      if (plan.active || !alternatives.some((item) => Boolean(item.active))) {
        if (plan.active) {
          database.prepare("UPDATE study_plans SET active = 0, updated_at = ? WHERE id = ? AND user_id = ?")
            .run(timestamp, id, this.userId);
        }
        database.prepare("UPDATE study_plans SET active = 1, updated_at = ? WHERE id = ? AND user_id = ?")
          .run(timestamp, alternatives[0].id, this.userId);
      }
      database.prepare("UPDATE study_plans SET active = 0, archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(timestamp, timestamp, id, this.userId);
      return { ...mapPlan(plan), active: false, archivedAt: timestamp };
    })();
  }

  restorePlan(id: string): StudyPlan {
    const database = getDatabase();
    const timestamp = nowIso();
    return database.transaction(() => {
      const plan = database.prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
        FROM study_plans WHERE id = ? AND user_id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL`)
        .get(id, this.userId) as PlanRow | undefined;
      if (!plan) throw new Error("Calendário arquivado não encontrado.");
      const hasActive = database.prepare(`SELECT 1 FROM study_plans
        WHERE user_id = ? AND active = 1 AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`)
        .get(this.userId);
      const active = hasActive ? 0 : 1;
      database.prepare("UPDATE study_plans SET archived_at = NULL, active = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(active, timestamp, id, this.userId);
      return { ...mapPlan(plan), active: Boolean(active), archivedAt: undefined };
    })();
  }

  deletePlan(id: string): StudyPlan {
    const database = getDatabase();
    const timestamp = nowIso();
    return database.transaction(() => {
      const plan = database.prepare(`SELECT id, name, target_exam_name, exam_date, study_mode, active, archived_at, deleted_at
        FROM study_plans WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
        .get(id, this.userId) as PlanRow | undefined;
      if (!plan) throw new Error("Calendário não encontrado.");
      const existingCount = database.prepare("SELECT COUNT(*) total FROM study_plans WHERE user_id = ? AND deleted_at IS NULL")
        .get(this.userId) as { total: number };
      if (existingCount.total <= 1) throw new Error("Não é possível excluir o único calendário existente.");

      const remainingActive = database.prepare(`SELECT id FROM study_plans
        WHERE user_id = ? AND id <> ? AND active = 1 AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`)
        .get(this.userId, id) as { id: string } | undefined;
      if (!remainingActive) {
        const replacement = database.prepare(`SELECT id FROM study_plans
          WHERE user_id = ? AND id <> ? AND archived_at IS NULL AND deleted_at IS NULL
          ORDER BY created_at, id LIMIT 1`).get(this.userId, id) as { id: string } | undefined;
        if (!replacement) throw new Error("Crie ou restaure outro calendário antes de excluir o calendário ativo.");
        if (plan.active) {
          database.prepare("UPDATE study_plans SET active = 0, updated_at = ? WHERE id = ? AND user_id = ?")
            .run(timestamp, id, this.userId);
        }
        database.prepare("UPDATE study_plans SET active = 1, updated_at = ? WHERE id = ? AND user_id = ?")
          .run(timestamp, replacement.id, this.userId);
      }
      database.prepare(`UPDATE study_plans
        SET active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .run(timestamp, timestamp, id, this.userId);
      return { ...mapPlan(plan), active: false };
    })();
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
