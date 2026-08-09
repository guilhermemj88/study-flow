import { createHash } from "node:crypto";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { ensureSubjectAndTopic } from "@/lib/local/study-store";
import type { ActivityPriority, ErrorReason } from "@/types/activity";
import type {
  PlanMutationResult,
  PlanSettings,
  PlanSettingsUpdate,
  PlannedActivityPreview,
  PriorityTopic,
  ReviewRecommendation,
  StudyPlanPreview,
  WeeklyAvailability,
} from "@/types/planner";

const DEFAULT_AVAILABILITY: WeeklyAvailability = { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 180, sun: 0 };
const ERROR_FACTORS: Record<ErrorReason, number> = {
  did_not_know: 1.8,
  forgot: 1.5,
  confused_concepts: 1.6,
  interpretation: 1.3,
  inattention: 1.1,
  other: 1.2,
};

interface SettingsRow {
  study_plan_id: string; availability_json: string; session_minutes: PlanSettings["sessionMinutes"];
  daily_limit_minutes: number; first_review_days: number; second_review_days: number;
  reinforcement_days: number; exercise_questions: PlanSettings["exerciseQuestions"];
  last_incidence_signature: string | null; last_generated_at: string | null; configured_at: string | null; exam_date: string | null;
}

interface IncidenceRow {
  source_id: string; subject_id: string; subject_name: string; topic_id: string | null;
  topic_name: string | null; subtopic_text: string | null; question_count: number; incidence_percentage: number;
}

interface IncidenceAggregate {
  subjectId: string; subject: string; topicId: string; topic: string; subtopic?: string;
  questionCount: number; incidence: number;
}

interface GenericIncidenceAggregate {
  subjectId: string; subject: string; topicId?: string; questionCount: number; incidence: number;
}

interface AttemptRow {
  subject_id: string | null; topic_id: string | null; subtopic_text: string | null;
  correct: number; error_reason: ErrorReason | null; answered_at: string;
}

interface ErrorRow {
  subject_id: string; topic_id: string | null; subtopic_text: string | null;
  error_count: number; error_reason: ErrorReason; created_at: string;
}

interface PlannerActivityRow {
  id: string; subject_id: string; topic_id: string; activity_type: PlannedActivityPreview["type"];
  scheduled_date: string; estimated_minutes: number; question_count: number | null;
  priority: ActivityPriority; status: "planned" | "attention" | "completed";
  planning_origin: "manual" | "incidence" | "performance"; focus_label: string | null;
  subtopic_text: string | null; sequence_key: string | null; sequence_step: string | null;
  adaptive_reason: string | null; planner_error_reason: ErrorReason | null;
  base_weight: number | null; adaptive_weight: number | null; notes: string | null;
}

function parseAvailability(value: string): WeeklyAvailability {
  try {
    const parsed = JSON.parse(value) as Partial<WeeklyAvailability>;
    return { ...DEFAULT_AVAILABILITY, ...parsed };
  } catch {
    return { ...DEFAULT_AVAILABILITY };
  }
}

function isoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new Error("Data inválida.");
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function taxonomyKey(input: { subjectId: string; topicId?: string; subtopic?: string }) {
  return `${input.subjectId}:${input.topicId ?? "general"}:${input.subtopic?.trim().toLowerCase() ?? ""}`;
}

function stablePart(value?: string) {
  return createHash("sha1").update(value?.trim().toLowerCase() || "-").digest("hex").slice(0, 10);
}

function isGenericTopic(value?: string | null) {
  if (!value?.trim()) return true;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return normalized === "geral" || normalized === "general";
}

function weekdayKey(value: string): keyof WeeklyAvailability {
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(`${value}T12:00:00Z`).getUTCDay()];
}

function priorityFromWeight(weight: number, maximum: number, adaptive: boolean): ActivityPriority {
  const relative = maximum ? weight / maximum : 0;
  if (adaptive && relative >= 0.7) return "critical";
  if (relative >= 0.65) return "high";
  if (relative >= 0.25) return "medium";
  return "low";
}

export class LocalPlannerStore {
  constructor(private readonly userId: string) {}

  private activePlan() {
    const plan = getDatabase().prepare("SELECT id, exam_date FROM study_plans WHERE user_id = ? AND active = 1 LIMIT 1")
      .get(this.userId) as { id: string; exam_date: string | null } | undefined;
    if (!plan) throw new Error("Nenhum plano de estudos ativo foi encontrado.");
    return plan;
  }

  getSettings(): PlanSettings {
    const database = getDatabase();
    const plan = this.activePlan();
    let row = database.prepare(`SELECT ps.*, sp.exam_date FROM study_plan_settings ps
      JOIN study_plans sp ON sp.id = ps.study_plan_id AND sp.user_id = ps.user_id
      WHERE ps.user_id = ? AND ps.study_plan_id = ?`).get(this.userId, plan.id) as SettingsRow | undefined;
    if (!row) {
      const timestamp = nowIso();
      database.prepare(`INSERT INTO study_plan_settings (
        id, user_id, study_plan_id, availability_json, session_minutes, daily_limit_minutes,
        first_review_days, second_review_days, reinforcement_days, exercise_questions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 45, 180, 2, 6, 10, 20, ?, ?)`).run(newId(), this.userId, plan.id, JSON.stringify(DEFAULT_AVAILABILITY), timestamp, timestamp);
      row = database.prepare(`SELECT ps.*, sp.exam_date FROM study_plan_settings ps
        JOIN study_plans sp ON sp.id = ps.study_plan_id AND sp.user_id = ps.user_id
        WHERE ps.user_id = ? AND ps.study_plan_id = ?`).get(this.userId, plan.id) as SettingsRow;
    }
    return {
      planId: row.study_plan_id,
      examDate: row.exam_date ?? undefined,
      availability: parseAvailability(row.availability_json),
      sessionMinutes: row.session_minutes,
      dailyLimitMinutes: row.daily_limit_minutes,
      firstReviewDays: row.first_review_days,
      secondReviewDays: row.second_review_days,
      reinforcementDays: row.reinforcement_days,
      exerciseQuestions: row.exercise_questions,
      configuredAt: row.configured_at ?? undefined,
      lastGeneratedAt: row.last_generated_at ?? undefined,
    };
  }

  updateSettings(input: PlanSettingsUpdate) {
    const current = this.getSettings();
    const availability = { ...current.availability, ...input.availability };
    const sessionMinutes = input.sessionMinutes ?? current.sessionMinutes;
    const dailyLimitMinutes = Math.trunc(input.dailyLimitMinutes ?? current.dailyLimitMinutes);
    const firstReviewDays = Math.trunc(input.firstReviewDays ?? current.firstReviewDays);
    const secondReviewDays = Math.trunc(input.secondReviewDays ?? current.secondReviewDays);
    const reinforcementDays = Math.trunc(input.reinforcementDays ?? current.reinforcementDays);
    const exerciseQuestions = input.exerciseQuestions ?? current.exerciseQuestions;
    if (![30, 45, 60, 90].includes(sessionMinutes)) throw new Error("Duração de sessão inválida.");
    if (![10, 20, 30, 50].includes(exerciseQuestions)) throw new Error("Quantidade de exercícios inválida.");
    if (dailyLimitMinutes < sessionMinutes || dailyLimitMinutes > 720) throw new Error("O limite diário deve comportar ao menos uma sessão.");
    for (const [day, minutes] of Object.entries(availability)) {
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > dailyLimitMinutes) throw new Error(`Disponibilidade inválida para ${day}.`);
    }
    if (!Object.values(availability).some((minutes) => minutes >= sessionMinutes)) throw new Error("Informe ao menos um dia com tempo para uma sessão.");
    if (!(firstReviewDays >= 1 && secondReviewDays > firstReviewDays && reinforcementDays > secondReviewDays)) {
      throw new Error("Os intervalos devem crescer da primeira revisão até o reforço.");
    }
    const examDate = input.examDate === undefined ? current.examDate ?? null : input.examDate.trim() ? isoDate(input.examDate) : null;
    const configuredAt = examDate ? nowIso() : null;
    const database = getDatabase();
    database.transaction(() => {
      database.prepare(`UPDATE study_plan_settings SET availability_json = ?, session_minutes = ?, daily_limit_minutes = ?,
        first_review_days = ?, second_review_days = ?, reinforcement_days = ?, exercise_questions = ?, configured_at = ?, updated_at = ?
        WHERE user_id = ? AND study_plan_id = ?`).run(JSON.stringify(availability), sessionMinutes, dailyLimitMinutes,
        firstReviewDays, secondReviewDays, reinforcementDays, exerciseQuestions, configuredAt, nowIso(), this.userId, current.planId);
      database.prepare("UPDATE study_plans SET exam_date = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(examDate, nowIso(), current.planId, this.userId);
    })();
    return this.getSettings();
  }

  private incidenceData() {
    const database = getDatabase();
    const plan = this.activePlan();
    const rows = database.prepare(`SELECT sts.source_id, sts.subject_id, s.name AS subject_name,
      sts.topic_id, t.name AS topic_name, sts.subtopic_text, sts.question_count, sts.incidence_percentage
      FROM source_topic_stats sts
      JOIN study_plan_sources pss ON pss.source_id = sts.source_id AND pss.user_id = sts.user_id
        AND pss.study_plan_id = ? AND pss.use_for_incidence = 1
      JOIN sources src ON src.id = sts.source_id AND src.user_id = sts.user_id AND src.is_answer_key = 0
      JOIN subjects s ON s.id = sts.subject_id AND s.user_id = sts.user_id
      LEFT JOIN topics t ON t.id = sts.topic_id AND t.user_id = sts.user_id
      WHERE sts.user_id = ? ORDER BY s.name, t.name, sts.subtopic_text`).all(plan.id, this.userId) as IncidenceRow[];
    const sourceCount = new Set(rows.map((row) => row.source_id)).size;
    const classifiedQuestionCount = (database.prepare(`SELECT COUNT(*) AS total FROM questions q
      JOIN study_plan_sources pss ON pss.source_id = q.source_id AND pss.user_id = q.user_id
      JOIN sources src ON src.id = q.source_id AND src.user_id = q.user_id AND src.is_answer_key = 0
      WHERE q.user_id = ? AND pss.study_plan_id = ? AND pss.use_for_incidence = 1
        AND EXISTS (SELECT 1 FROM source_topic_stats sts WHERE sts.user_id = q.user_id AND sts.source_id = q.source_id)`)
      .get(this.userId, plan.id) as { total: number }).total;
    const persistedQuestionCount = rows.reduce((sum, row) => sum + Math.max(0, row.question_count), 0);
    const analyzedQuestionCount = classifiedQuestionCount || persistedQuestionCount;
    const aggregated = new Map<string, IncidenceAggregate>();
    const genericBySubject = new Map<string, GenericIncidenceAggregate>();
    for (const row of rows) {
      const subtopic = row.subtopic_text?.trim() || undefined;
      if (isGenericTopic(row.topic_name) && !subtopic) {
        const current = genericBySubject.get(row.subject_id) ?? {
          subjectId: row.subject_id,
          subject: row.subject_name,
          topicId: row.topic_id ?? undefined,
          questionCount: 0,
          incidence: 0,
        };
        current.questionCount += Math.max(0, row.question_count);
        current.incidence += Math.max(0, row.incidence_percentage);
        genericBySubject.set(row.subject_id, current);
        continue;
      }
      let topicId = row.topic_id;
      let topic = row.topic_name;
      if (!topicId) {
        const ensured = ensureSubjectAndTopic(this.userId, row.subject_name, "Geral");
        topicId = ensured.topic.id;
        topic = ensured.topic.name;
      }
      const key = taxonomyKey({ subjectId: row.subject_id, topicId, subtopic });
      const current = aggregated.get(key) ?? { subjectId: row.subject_id, subject: row.subject_name, topicId, topic: topic ?? "Geral", subtopic, questionCount: 0, incidence: 0 };
      current.questionCount += Math.max(0, row.question_count);
      current.incidence += Math.max(0, row.incidence_percentage);
      aggregated.set(key, current);
    }

    for (const generic of genericBySubject.values()) {
      const specificItems = [...aggregated.values()].filter((item) => item.subjectId === generic.subjectId);
      if (specificItems.length) {
        const specificEvidence = specificItems.map((item) => Math.max(item.questionCount, item.incidence / 100, 0.01));
        const totalSpecificEvidence = specificEvidence.reduce((sum, value) => sum + value, 0) || 1;
        specificItems.forEach((item, index) => {
          const share = specificEvidence[index] / totalSpecificEvidence;
          item.questionCount += generic.questionCount * share;
          item.incidence += generic.incidence * share;
        });
        continue;
      }
      const topic = generic.topicId
        ? { id: generic.topicId, name: "Geral" }
        : ensureSubjectAndTopic(this.userId, generic.subject, "Geral").topic;
      const key = taxonomyKey({ subjectId: generic.subjectId, topicId: topic.id });
      aggregated.set(key, {
        subjectId: generic.subjectId,
        subject: generic.subject,
        topicId: topic.id,
        topic: topic.name,
        questionCount: generic.questionCount,
        incidence: generic.incidence,
      });
    }
    const items = [...aggregated.values()];
    const evidence = items.map((item) => Math.max(item.questionCount, item.incidence / 100, 0.01));
    const totalEvidence = evidence.reduce((sum, value) => sum + value, 0) || 1;
    const minimumCoverage = items.length ? Math.min(0.05, 0.5 / items.length) : 0;
    const floored = evidence.map((value) => Math.max(value / totalEvidence, minimumCoverage));
    const floorTotal = floored.reduce((sum, value) => sum + value, 0) || 1;
    const baseItems = items.map((item, index) => ({ ...item, incidenceWeight: floored[index] / floorTotal }));
    const signature = createHash("sha256").update(JSON.stringify(rows.map((row) => [row.source_id, row.subject_id, row.topic_id, row.subtopic_text, row.question_count, row.incidence_percentage]))).digest("hex");
    return { plan, sourceCount, analyzedQuestionCount, baseItems, signature };
  }

  getPriorityTopics(): PriorityTopic[] {
    const database = getDatabase();
    const incidence = this.incidenceData();
    const attempts = database.prepare(`SELECT q.subject_id, q.topic_id, q.subtopic_text, qa.correct, qa.error_reason, qa.answered_at
      FROM question_attempts qa JOIN questions q ON q.id = qa.question_id AND q.user_id = qa.user_id
      WHERE qa.user_id = ? AND q.question_status = 'valid' ORDER BY qa.answered_at DESC`).all(this.userId) as AttemptRow[];
    const errors = database.prepare(`SELECT subject_id, topic_id, subtopic_text, error_count, error_reason, created_at
      FROM activity_error_details WHERE user_id = ? ORDER BY created_at DESC`).all(this.userId) as ErrorRow[];
    const scored = incidence.baseItems.map((item) => {
      const matches = (candidate: { subject_id: string | null; topic_id: string | null; subtopic_text: string | null }) => (
        candidate.subject_id === item.subjectId && candidate.topic_id === item.topicId
        && (!item.subtopic || candidate.subtopic_text?.trim().toLowerCase() === item.subtopic.trim().toLowerCase())
      );
      const itemAttempts = attempts.filter(matches);
      const itemErrors = errors.filter(matches);
      const hasPerformanceHistory = itemAttempts.length > 0 || itemErrors.length > 0;
      const accuracy = itemAttempts.length ? itemAttempts.filter((attempt) => attempt.correct).length / itemAttempts.length : 1;
      let successStreak = 0;
      for (const attempt of itemAttempts) {
        if (!attempt.correct) break;
        successStreak += 1;
      }
      const performanceFactor = Math.max(0.65, Math.min(1.8, 1 + (1 - accuracy) * 0.8 - Math.min(successStreak * 0.08, 0.35)));
      const reasons = [
        ...itemErrors.flatMap((error) => Array.from({ length: Math.min(error.error_count, 10) }, () => ({ reason: error.error_reason, at: error.created_at }))),
        ...itemAttempts.filter((attempt) => !attempt.correct && attempt.error_reason).map((attempt) => ({ reason: attempt.error_reason as ErrorReason, at: attempt.answered_at })),
      ];
      const strongest = reasons.sort((a, b) => ERROR_FACTORS[b.reason] - ERROR_FACTORS[a.reason])[0];
      const mostRecent = [...reasons].sort((a, b) => b.at.localeCompare(a.at))[0];
      const errorReasonFactor = strongest ? ERROR_FACTORS[strongest.reason] : 1;
      const recencyFactor = mostRecent ? 1 + Math.max(0, 14 - daysSince(mostRecent.at)) / 14 * 0.3 : 1;
      return {
        subjectId: item.subjectId,
        subject: item.subject,
        topicId: item.topicId,
        topic: item.topic,
        subtopic: item.subtopic,
        questionCount: item.questionCount,
        incidenceWeight: item.incidenceWeight,
        performanceFactor,
        errorReasonFactor,
        recencyFactor,
        rawPriority: Math.max(item.incidenceWeight * performanceFactor * errorReasonFactor * recencyFactor, item.incidenceWeight * 0.65),
        recentErrorReason: strongest?.reason,
        recentErrorAt: mostRecent?.at,
        successStreak,
        hasPerformanceHistory,
      };
    });
    const total = scored.reduce((sum, item) => sum + item.rawPriority, 0) || 1;
    return scored.map(({ rawPriority, ...item }) => ({
      ...item,
      incidenceWeight: round(item.incidenceWeight),
      performanceFactor: round(item.performanceFactor, 3),
      errorReasonFactor: round(item.errorReasonFactor, 3),
      recencyFactor: round(item.recencyFactor, 3),
      priorityWeight: round(rawPriority / total),
    })).sort((a, b) => b.priorityWeight - a.priorityWeight);
  }

  private availableDates(startDate: string, endDate: string, settings: PlanSettings) {
    const database = getDatabase();
    const existing = database.prepare(`SELECT scheduled_date, estimated_minutes FROM activities
      WHERE user_id = ? AND study_plan_id = ? AND scheduled_date BETWEEN ? AND ?
        AND (planning_origin = 'manual' OR status = 'completed')`).all(this.userId, settings.planId, startDate, endDate) as Array<{ scheduled_date: string; estimated_minutes: number }>;
    const occupied = new Map<string, number>();
    for (const activity of existing) occupied.set(activity.scheduled_date, (occupied.get(activity.scheduled_date) ?? 0) + activity.estimated_minutes);
    const capacity = new Map<string, number>();
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      const available = Math.min(settings.availability[weekdayKey(date)], settings.dailyLimitMinutes);
      const sessions = Math.max(0, Math.floor((available - (occupied.get(date) ?? 0)) / settings.sessionMinutes));
      if (sessions) capacity.set(date, sessions);
    }
    return capacity;
  }

  private capacitySummary(startDate: string, endDate: string, settings: PlanSettings, schedulableMinutes: number) {
    const start = new Date(`${startDate}T12:00:00Z`).getTime();
    const end = new Date(`${endDate}T12:00:00Z`).getTime();
    const daysRemaining = Math.max(0, Math.round((end - start) / 86_400_000));
    const weeklyMinutes = Object.values(settings.availability)
      .reduce((sum, minutes) => sum + Math.min(minutes, settings.dailyLimitMinutes), 0);
    let totalAvailableMinutes = 0;
    for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
      totalAvailableMinutes += Math.min(settings.availability[weekdayKey(current)], settings.dailyLimitMinutes);
    }
    return {
      daysRemaining,
      weeksRemaining: round(daysRemaining / 7, 1),
      weeklyMinutes,
      totalAvailableMinutes,
      schedulableMinutes,
    };
  }

  preview(input: { startDate?: string } = {}): StudyPlanPreview {
    const settings = this.getSettings();
    const startDate = isoDate(input.startDate ?? new Date().toISOString().slice(0, 10));
    const endDate = settings.examDate && settings.examDate >= startDate ? settings.examDate : addDays(startDate, 55);
    const incidence = this.incidenceData();
    const priorities = this.getPriorityTopics();
    const capacity = this.availableDates(startDate, endDate, settings);
    const totalSlots = [...capacity.values()].reduce((sum, value) => sum + value, 0);
    const capacitySummary = this.capacitySummary(startDate, endDate, settings, totalSlots * settings.sessionMinutes);
    const cycleCount = totalSlots ? Math.max(1, Math.floor(totalSlots / 4)) : 0;
    const allocation = new Map<string, number>();
    for (let index = 0; index < cycleCount && priorities.length; index += 1) {
      let selected: PriorityTopic;
      if (index < priorities.length) selected = priorities[index];
      else selected = [...priorities].sort((a, b) => (b.priorityWeight / ((allocation.get(taxonomyKey(b)) ?? 0) + 1)) - (a.priorityWeight / ((allocation.get(taxonomyKey(a)) ?? 0) + 1)))[0];
      const key = taxonomyKey(selected);
      allocation.set(key, (allocation.get(key) ?? 0) + 1);
    }
    const sequenceItems: PriorityTopic[] = [];
    const used = new Map<string, number>();
    let previousKey = "";
    while (sequenceItems.length < cycleCount) {
      const candidates = priorities.filter((item) => (used.get(taxonomyKey(item)) ?? 0) < (allocation.get(taxonomyKey(item)) ?? 0));
      if (!candidates.length) break;
      const selected = [...candidates].sort((a, b) => {
        const aKey = taxonomyKey(a); const bKey = taxonomyKey(b);
        const aPenalty = aKey === previousKey ? 0.25 : 1;
        const bPenalty = bKey === previousKey ? 0.25 : 1;
        return (b.priorityWeight * bPenalty / ((used.get(bKey) ?? 0) + 1)) - (a.priorityWeight * aPenalty / ((used.get(aKey) ?? 0) + 1));
      })[0];
      const key = taxonomyKey(selected);
      used.set(key, (used.get(key) ?? 0) + 1);
      previousKey = key;
      sequenceItems.push(selected);
    }

    const availableDates = [...capacity.keys()].sort();
    const usedTopicDates = new Set<string>();
    const takeDate = (target: string, topicKey: string) => {
      const date = availableDates.find((candidate) => candidate >= target && (capacity.get(candidate) ?? 0) > 0 && !usedTopicDates.has(`${topicKey}:${candidate}`));
      if (!date) return undefined;
      capacity.set(date, (capacity.get(date) ?? 0) - 1);
      usedTopicDates.add(`${topicKey}:${date}`);
      return date;
    };
    const maximum = priorities[0]?.priorityWeight ?? 1;
    const activities: PlannedActivityPreview[] = [];
    const cycleIndexes = new Map<string, number>();
    let studyCursor = startDate;
    for (const item of sequenceItems) {
      const key = taxonomyKey(item);
      const cycleIndex = cycleIndexes.get(key) ?? 0;
      cycleIndexes.set(key, cycleIndex + 1);
      const studyDate = takeDate(studyCursor, key);
      if (!studyDate) continue;
      studyCursor = studyDate;
      const dates = {
        study: studyDate,
        review: takeDate(addDays(studyDate, settings.firstReviewDays), key),
        exercise: takeDate(addDays(studyDate, settings.secondReviewDays), key),
        reinforcement: takeDate(addDays(studyDate, settings.reinforcementDays), key),
      };
      const sequenceKey = `base:${item.subjectId}:${item.topicId ?? "general"}:${stablePart(item.subtopic)}:${cycleIndex}`;
      const adaptive = Boolean(item.recentErrorReason);
      for (const step of ["study", "review", "exercise", "reinforcement"] as const) {
        const date = dates[step];
        if (!date) continue;
        const performanceOrigin = step === "reinforcement" && adaptive;
        activities.push({
          sequenceKey,
          sequenceStep: step,
          type: step,
          subjectId: item.subjectId,
          subject: item.subject,
          topicId: item.topicId,
          topic: item.topic,
          subtopic: item.subtopic,
          focusLabel: item.subtopic || item.topic,
          date,
          estimatedMinutes: settings.sessionMinutes,
          questionCount: step === "exercise" ? settings.exerciseQuestions : undefined,
          priority: priorityFromWeight(item.priorityWeight, maximum, performanceOrigin),
          planningOrigin: performanceOrigin ? "performance" : "incidence",
          adaptiveReason: performanceOrigin ? "Reforço por desempenho" : undefined,
          errorReason: performanceOrigin ? item.recentErrorReason : undefined,
          baseWeight: item.incidenceWeight,
          adaptiveWeight: item.priorityWeight,
        });
      }
    }
    const settingsRow = getDatabase().prepare("SELECT last_incidence_signature, last_generated_at FROM study_plan_settings WHERE user_id = ? AND study_plan_id = ?")
      .get(this.userId, settings.planId) as { last_incidence_signature: string | null; last_generated_at: string | null };
    const activityBreakdown = activities.reduce((counts, activity) => {
      counts[activity.type] += 1;
      return counts;
    }, { study: 0, exercise: 0, review: 0, reinforcement: 0 });
    const minimumCoverageMinutes = priorities.length * 4 * settings.sessionMinutes;
    return {
      startDate,
      endDate,
      sourceCount: incidence.sourceCount,
      analyzedQuestionCount: incidence.analyzedQuestionCount,
      subjectCount: new Set(priorities.map((item) => item.subjectId)).size,
      topicCount: new Set(priorities.map((item) => `${item.subjectId}:${item.topicId}`)).size,
      totalMinutes: activities.reduce((sum, activity) => sum + activity.estimatedMinutes, 0),
      activityCount: activities.length,
      estimatedSessions: activities.length,
      activityBreakdown,
      capacity: capacitySummary,
      capacityInsufficient: capacitySummary.schedulableMinutes < minimumCoverageMinutes,
      minimumCoverageMinutes,
      hasIncidenceData: incidence.sourceCount > 0 && priorities.length > 0,
      hasPerformanceHistory: priorities.some((item) => item.hasPerformanceHistory),
      incidenceChanged: Boolean(settingsRow.last_generated_at && settingsRow.last_incidence_signature !== incidence.signature),
      hasGeneratedPlan: Boolean(settingsRow.last_generated_at),
      priorities,
      activities,
    };
  }

  private apply(preview: StudyPlanPreview): PlanMutationResult {
    const database = getDatabase();
    const settings = this.getSettings();
    const incidence = this.incidenceData();
    const existing = database.prepare(`SELECT id, subject_id, topic_id, activity_type, scheduled_date, estimated_minutes,
      question_count, priority, status, planning_origin, focus_label, subtopic_text, sequence_key, sequence_step,
      adaptive_reason, planner_error_reason, base_weight, adaptive_weight, notes
      FROM activities WHERE user_id = ? AND study_plan_id = ? AND sequence_key IS NOT NULL`).all(this.userId, settings.planId) as PlannerActivityRow[];
    const desiredKeys = new Set(preview.activities.map((activity) => `${activity.sequenceKey}:${activity.sequenceStep}`));
    let created = 0; let updated = 0; let removed = 0; let unchanged = 0;
    database.transaction(() => {
      for (const activity of preview.activities) {
        const match = existing.find((row) => row.sequence_key === activity.sequenceKey && row.sequence_step === activity.sequenceStep);
        if (match?.status === "completed" || (match && match.scheduled_date < preview.startDate)) { unchanged += 1; continue; }
        const status = ["high", "critical"].includes(activity.priority) ? "attention" : "planned";
        if (match) {
          const changed = match.subject_id !== activity.subjectId || match.topic_id !== activity.topicId || match.activity_type !== activity.type
            || match.scheduled_date !== activity.date || match.estimated_minutes !== activity.estimatedMinutes
            || match.question_count !== (activity.questionCount ?? null) || match.priority !== activity.priority || match.status !== status
            || match.planning_origin !== activity.planningOrigin || match.focus_label !== activity.focusLabel
            || match.subtopic_text !== (activity.subtopic ?? null) || match.adaptive_reason !== (activity.adaptiveReason ?? null)
            || match.planner_error_reason !== (activity.errorReason ?? null) || match.base_weight !== activity.baseWeight || match.adaptive_weight !== activity.adaptiveWeight;
          if (!changed) { unchanged += 1; continue; }
          database.prepare(`UPDATE activities SET subject_id = ?, topic_id = ?, activity_type = ?, scheduled_date = ?,
            estimated_minutes = ?, question_count = ?, priority = ?, status = ?, planning_origin = ?, focus_label = ?,
            subtopic_text = ?, adaptive_reason = ?, planner_error_reason = ?, base_weight = ?, adaptive_weight = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`).run(activity.subjectId, activity.topicId, activity.type, activity.date,
              activity.estimatedMinutes, activity.questionCount ?? null, activity.priority, status, activity.planningOrigin,
              activity.focusLabel, activity.subtopic ?? null, activity.adaptiveReason ?? null, activity.errorReason ?? null,
              activity.baseWeight, activity.adaptiveWeight, nowIso(), match.id, this.userId);
          updated += 1;
        } else {
          const timestamp = nowIso();
          database.prepare(`INSERT INTO activities (
            id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date, estimated_minutes,
            question_count, priority, status, exercise_origin, notes, created_at, updated_at, planning_origin,
            focus_label, subtopic_text, sequence_key, sequence_step, adaptive_reason, planner_error_reason,
            base_weight, adaptive_weight
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
              newId(), this.userId, settings.planId, activity.subjectId, activity.topicId, activity.type, activity.date,
              activity.estimatedMinutes, activity.questionCount ?? null, activity.priority, status,
              activity.type === "exercise" ? "question_bank" : "manual",
              activity.planningOrigin === "performance" ? "Reforço por desempenho gerado automaticamente." : "Atividade gerada pela incidência das fontes selecionadas.",
              timestamp, timestamp, activity.planningOrigin, activity.focusLabel, activity.subtopic ?? null,
              activity.sequenceKey, activity.sequenceStep, activity.adaptiveReason ?? null, activity.errorReason ?? null,
              activity.baseWeight, activity.adaptiveWeight,
            );
          created += 1;
        }
      }
      for (const row of existing) {
        if (row.status === "completed" || row.scheduled_date < preview.startDate || !row.sequence_key || !row.sequence_step) continue;
        if (!desiredKeys.has(`${row.sequence_key}:${row.sequence_step}`)) {
          database.prepare("DELETE FROM activities WHERE id = ? AND user_id = ?").run(row.id, this.userId);
          removed += 1;
        }
      }
      database.prepare(`UPDATE study_plan_settings SET last_incidence_signature = ?, last_generated_at = ?, updated_at = ?
        WHERE user_id = ? AND study_plan_id = ?`).run(incidence.signature, nowIso(), nowIso(), this.userId, settings.planId);
    })();
    return { preview, created, updated, removed, unchanged };
  }

  generateStudyPlan(input: { startDate?: string; confirmed?: boolean } = {}) {
    const settings = this.getSettings();
    if (input.confirmed !== true) throw new Error("Confirme explicitamente a prévia antes de gerar o plano.");
    if (!settings.configuredAt || !settings.examDate) throw new Error("Configure a data da prova e sua disponibilidade antes de gerar o plano.");
    const startDate = input.startDate ?? new Date().toISOString().slice(0, 10);
    if (settings.examDate < startDate) throw new Error("A data da prova deve ser igual ou posterior ao início do plano.");
    return this.apply(this.preview(input));
  }

  recalculateFuturePlan(input: { startDate?: string } = {}) {
    return this.apply(this.preview(input));
  }

  hasGeneratedPlan() {
    return Boolean(this.getSettings().lastGeneratedAt);
  }

  getReviewRecommendations(limit = 10): ReviewRecommendation[] {
    return this.getPriorityTopics().slice(0, Math.max(1, Math.min(50, limit))).map((item) => ({
      subject: item.subject,
      topic: item.topic,
      subtopic: item.subtopic,
      priorityWeight: item.priorityWeight,
      reason: item.recentErrorReason
        ? `Erro recente com fator ${item.errorReasonFactor.toFixed(1)}.`
        : item.successStreak >= 3 ? `${item.successStreak} acertos sucessivos reduziram o reforço.` : "Prioridade baseada na incidência.",
      recommendedType: item.recentErrorReason ? "reinforcement" : item.successStreak >= 3 ? "exercise" : "review",
    }));
  }
}
