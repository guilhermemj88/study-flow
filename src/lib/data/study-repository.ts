import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toRepositoryError } from "@/lib/data/repository-error";
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

interface DbSubject { id: string; name: string }
interface DbTopic { id: string; subject_id: string; name: string }
interface DbPlan { id: string; name: string; target_exam_name: string | null; exam_date: string | null }
interface DbActivity {
  id: string;
  study_plan_id: string | null;
  subject_id: string;
  topic_id: string;
  activity_type: StudyActivity["type"];
  scheduled_date: string;
  estimated_minutes: number;
  question_count: number | null;
  priority: StudyActivity["priority"];
  status: StudyActivity["status"];
  exercise_origin: StudyActivity["exerciseOrigin"];
  linked_study_activity_id: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}
interface DbResult {
  activity_id: string;
  actual_minutes: number | null;
  questions_answered: number | null;
  correct_answers: number | null;
  wrong_answers: number | null;
  accuracy: number | null;
  perceived_difficulty: ActivityResult["perceivedDifficulty"];
  error_reasons: ErrorReason[];
  study_methods: ActivityResult["studyMethods"];
  notes: string | null;
}
interface DbAttempt {
  id: string;
  question_id: string;
  activity_id: string | null;
  correct: boolean;
  answered_at: string;
}
interface DbQuestionReference { id: string; subject_id: string | null; topic_id: string | null }
interface DbErrorDetail {
  activity_id: string;
  topic_id: string | null;
  topic_text: string | null;
  subtopic_text: string | null;
  error_count: number;
  error_reason: ErrorReason;
  notes: string | null;
}

function requireData<T>(data: T | null, error: { message?: string } | null, message: string): T {
  if (error || data === null) throw toRepositoryError(error, message);
  return data;
}

export class StudyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async userId() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) throw toRepositoryError(error, "Sua sessão expirou. Entre novamente.");
    return data.user.id;
  }

  async load(): Promise<StudyData> {
    await this.userId();
    const [subjectsResponse, topicsResponse, plansResponse, activitiesResponse, resultsResponse, errorDetailsResponse, attemptsResponse, questionRefsResponse] = await Promise.all([
      this.supabase.from("subjects").select("id,name").order("name"),
      this.supabase.from("topics").select("id,subject_id,name").order("name"),
      this.supabase.from("study_plans").select("id,name,target_exam_name,exam_date").eq("active", true).limit(1).maybeSingle(),
      this.supabase.from("activities").select("*").order("scheduled_date").order("created_at"),
      this.supabase.from("activity_results").select("activity_id,actual_minutes,questions_answered,correct_answers,wrong_answers,accuracy,perceived_difficulty,error_reasons,study_methods,notes"),
      this.supabase.from("activity_error_details").select("activity_id,topic_id,topic_text,subtopic_text,error_count,error_reason,notes"),
      this.supabase.from("question_attempts").select("id,question_id,activity_id,correct,answered_at").order("answered_at", { ascending: false }),
      this.supabase.from("questions").select("id,subject_id,topic_id"),
    ]);

    const subjectRows = requireData(subjectsResponse.data as DbSubject[] | null, subjectsResponse.error, "Não foi possível carregar as matérias.");
    const topicRows = requireData(topicsResponse.data as DbTopic[] | null, topicsResponse.error, "Não foi possível carregar os assuntos.");
    const activityRows = requireData(activitiesResponse.data as DbActivity[] | null, activitiesResponse.error, "Não foi possível carregar o calendário.");
    const resultRows = requireData(resultsResponse.data as DbResult[] | null, resultsResponse.error, "Não foi possível carregar os resultados.");
    const errorDetailRows = requireData(errorDetailsResponse.data as DbErrorDetail[] | null, errorDetailsResponse.error, "Não foi possível carregar os detalhes de erro.");
    const attemptRows = requireData(attemptsResponse.data as DbAttempt[] | null, attemptsResponse.error, "Não foi possível carregar o histórico de questões.");
    const questionRefs = requireData(questionRefsResponse.data as DbQuestionReference[] | null, questionRefsResponse.error, "Não foi possível carregar as referências das questões.");
    if (plansResponse.error) throw toRepositoryError(plansResponse.error, "Não foi possível carregar o plano ativo.");

    const subjects = subjectRows.map<StudySubject>((subject) => {
      const records = topicRows.filter((topic) => topic.subject_id === subject.id);
      return { id: subject.id, name: subject.name, topics: records.map((topic) => topic.name), topicRecords: records.map(({ id, name }) => ({ id, name })) };
    });
    const subjectNames = new Map(subjectRows.map((subject) => [subject.id, subject.name]));
    const topicNames = new Map(topicRows.map((topic) => [topic.id, topic.name]));
    const results = new Map(resultRows.map((result) => [result.activity_id, result]));
    const questions = new Map(questionRefs.map((question) => [question.id, question]));

    const activities = activityRows.map((row) => this.mapActivity(
      row,
      subjectNames,
      topicNames,
      results.get(row.id),
      errorDetailRows.filter((detail) => detail.activity_id === row.id),
    ));
    const attemptSummaries = attemptRows.flatMap<QuestionAttemptSummary>((attempt) => {
      const question = questions.get(attempt.question_id);
      const subject = question?.subject_id ? subjectNames.get(question.subject_id) : undefined;
      if (!question || !subject) return [];
      return [{
        id: attempt.id,
        activityId: attempt.activity_id ?? undefined,
        subject,
        topic: question.topic_id ? topicNames.get(question.topic_id) : undefined,
        correct: attempt.correct,
        answeredAt: attempt.answered_at,
      }];
    });
    const planRow = plansResponse.data as DbPlan | null;
    const activePlan: StudyPlan | undefined = planRow ? {
      id: planRow.id,
      name: planRow.name,
      targetExamName: planRow.target_exam_name ?? undefined,
      examDate: planRow.exam_date ?? undefined,
    } : undefined;

    return { activities, subjects, activePlan, attemptSummaries };
  }

  private mapActivity(
    row: DbActivity,
    subjectNames: Map<string, string>,
    topicNames: Map<string, string>,
    result?: DbResult,
    errorDetails: DbErrorDetail[] = [],
  ): StudyActivity {
    return {
      id: row.id,
      planId: row.study_plan_id ?? undefined,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      type: row.activity_type,
      subject: subjectNames.get(row.subject_id) ?? "Matéria removida",
      topic: topicNames.get(row.topic_id) ?? "Assunto removido",
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
        accuracy: result.accuracy === null ? undefined : Number(result.accuracy),
        perceivedDifficulty: result.perceived_difficulty,
        errorReasons: result.error_reasons ?? [],
        studyMethods: result.study_methods ?? [],
        errorDetails: errorDetails.map((detail) => ({
          topicId: detail.topic_id ?? undefined,
          topicText: detail.topic_text ?? (detail.topic_id ? topicNames.get(detail.topic_id) : undefined) ?? "Tema não informado",
          subtopicText: detail.subtopic_text ?? undefined,
          errorCount: detail.error_count,
          errorReason: detail.error_reason,
          notes: detail.notes ?? undefined,
        })),
        notes: result.notes ?? undefined,
      } : undefined,
    };
  }

  private async ensureSubjectAndTopic(userId: string, subjectName: string, topicName: string) {
    const { data: loadedSubject, error: subjectError } = await this.supabase
      .from("subjects").select("id,name").ilike("name", subjectName).limit(1).maybeSingle();
    if (subjectError) throw toRepositoryError(subjectError, "Não foi possível localizar a matéria.");
    let subject = loadedSubject;
    if (!subject) {
      const response = await this.supabase.from("subjects").insert({ user_id: userId, name: subjectName }).select("id,name").single();
      subject = requireData(response.data, response.error, "Não foi possível criar a matéria.");
    }

    const { data: loadedTopic, error: topicError } = await this.supabase
      .from("topics").select("id,name").eq("subject_id", subject.id).ilike("name", topicName).limit(1).maybeSingle();
    if (topicError) throw toRepositoryError(topicError, "Não foi possível localizar o assunto.");
    let topic = loadedTopic;
    if (!topic) {
      const response = await this.supabase.from("topics").insert({ user_id: userId, subject_id: subject.id, name: topicName }).select("id,name").single();
      topic = requireData(response.data, response.error, "Não foi possível criar o assunto.");
    }
    return { subject, topic };
  }

  private async activePlanId() {
    const response = await this.supabase.from("study_plans").select("id").eq("active", true).limit(1).maybeSingle();
    if (response.error) throw toRepositoryError(response.error, "Não foi possível localizar o plano ativo.");
    return response.data?.id as string | undefined;
  }

  async createActivity(draft: ActivityDraft): Promise<StudyActivity> {
    const userId = await this.userId();
    const { subject, topic } = await this.ensureSubjectAndTopic(userId, draft.subject, draft.topic);
    const planId = draft.planId ?? await this.activePlanId();
    const response = await this.supabase.from("activities").insert({
      user_id: userId,
      study_plan_id: planId,
      subject_id: subject.id,
      topic_id: topic.id,
      activity_type: draft.type,
      scheduled_date: draft.date,
      estimated_minutes: draft.estimatedMinutes,
      question_count: draft.questionCount ?? null,
      priority: draft.priority,
      status: draft.status,
      exercise_origin: draft.exerciseOrigin ?? "manual",
      linked_study_activity_id: draft.linkedStudyActivityId ?? null,
      notes: draft.notes ?? null,
    }).select("*").single();
    const row = requireData(response.data as DbActivity | null, response.error, "Não foi possível adicionar a atividade.");
    return this.mapActivity(row, new Map([[subject.id, subject.name]]), new Map([[topic.id, topic.name]]));
  }

  async updateActivity(id: string, updates: Partial<StudyActivity>): Promise<void> {
    const userId = await this.userId();
    let subjectId = updates.subjectId;
    let topicId = updates.topicId;
    if (updates.subject && updates.topic) {
      const resolved = await this.ensureSubjectAndTopic(userId, updates.subject, updates.topic);
      subjectId = resolved.subject.id;
      topicId = resolved.topic.id;
    }
    const payload: Record<string, unknown> = {};
    if (updates.type !== undefined) payload.activity_type = updates.type;
    if (updates.date !== undefined) payload.scheduled_date = updates.date;
    if (updates.estimatedMinutes !== undefined) payload.estimated_minutes = updates.estimatedMinutes;
    if (updates.questionCount !== undefined) payload.question_count = updates.questionCount;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.exerciseOrigin !== undefined) payload.exercise_origin = updates.exerciseOrigin;
    if (updates.linkedStudyActivityId !== undefined) payload.linked_study_activity_id = updates.linkedStudyActivityId;
    if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
    if (subjectId) payload.subject_id = subjectId;
    if (topicId) payload.topic_id = topicId;
    const { error } = await this.supabase.from("activities").update(payload).eq("id", id);
    if (error) throw toRepositoryError(error, "Não foi possível atualizar a atividade.");
  }

  async completeActivity(activity: StudyActivity, result: ActivityResult): Promise<void> {
    const userId = await this.userId();
    const completedAt = new Date().toISOString();
    const activityResponse = await this.supabase.from("activities").update({ status: "completed", completed_at: completedAt }).eq("id", activity.id);
    if (activityResponse.error) throw toRepositoryError(activityResponse.error, "Não foi possível concluir a atividade.");
    const resultResponse = await this.supabase.from("activity_results").upsert({
      user_id: userId,
      activity_id: activity.id,
      actual_minutes: result.actualMinutes ?? null,
      questions_answered: result.questionsAnswered ?? null,
      correct_answers: result.correctAnswers ?? null,
      wrong_answers: result.wrongAnswers ?? null,
      accuracy: result.accuracy ?? null,
      perceived_difficulty: result.perceivedDifficulty,
      error_reasons: result.errorReasons ?? [],
      study_methods: result.studyMethods ?? [],
      notes: result.notes ?? null,
    }, { onConflict: "activity_id" });
    if (resultResponse.error) throw toRepositoryError(resultResponse.error, "A atividade foi concluída, mas o resultado não pôde ser salvo.");

    const deleteResponse = await this.supabase.from("activity_error_details").delete().eq("activity_id", activity.id);
    if (deleteResponse.error) throw toRepositoryError(deleteResponse.error, "Não foi possível atualizar os detalhes de erro.");
    if (result.errorDetails?.length && activity.subjectId) {
      const detailsResponse = await this.supabase.from("activity_error_details").insert(result.errorDetails.map((detail) => ({
        user_id: userId,
        activity_id: activity.id,
        subject_id: activity.subjectId,
        topic_id: detail.topicId ?? activity.topicId ?? null,
        topic_text: detail.topicText,
        subtopic_text: detail.subtopicText ?? null,
        error_count: detail.errorCount,
        error_reason: detail.errorReason,
        notes: detail.notes ?? null,
      })));
      if (detailsResponse.error) throw toRepositoryError(detailsResponse.error, "O resultado foi salvo, mas os detalhes de erro não.");
    }
  }

  async deleteActivity(id: string) {
    const { error } = await this.supabase.from("activities").delete().eq("id", id);
    if (error) throw toRepositoryError(error, "Não foi possível excluir a atividade.");
  }

  async createSubject(name: string): Promise<StudySubject> {
    const userId = await this.userId();
    const response = await this.supabase.from("subjects").insert({ user_id: userId, name }).select("id,name").single();
    const row = requireData(response.data as DbSubject | null, response.error, "Não foi possível criar a matéria.");
    return { id: row.id, name: row.name, topics: [], topicRecords: [] };
  }

  async updateSubject(subject: StudySubject, updates: Partial<StudySubject>): Promise<void> {
    const userId = await this.userId();
    if (updates.name && updates.name !== subject.name) {
      const response = await this.supabase.from("subjects").update({ name: updates.name }).eq("id", subject.id);
      if (response.error) throw toRepositoryError(response.error, "Não foi possível renomear a matéria.");
    }
    if (updates.topics) {
      const currentRecords = subject.topicRecords ?? [];
      const wanted = new Set(updates.topics.map((topic) => topic.trim().toLowerCase()));
      const toDelete = currentRecords.filter((topic) => !wanted.has(topic.name.toLowerCase()));
      const currentNames = new Set(currentRecords.map((topic) => topic.name.toLowerCase()));
      const toCreate = updates.topics.filter((topic) => !currentNames.has(topic.trim().toLowerCase()));
      if (toDelete.length) {
        const response = await this.supabase.from("topics").delete().in("id", toDelete.map((topic) => topic.id));
        if (response.error) throw toRepositoryError(response.error, "Assuntos usados em atividades não podem ser excluídos.");
      }
      if (toCreate.length) {
        const response = await this.supabase.from("topics").insert(toCreate.map((name) => ({ user_id: userId, subject_id: subject.id, name })));
        if (response.error) throw toRepositoryError(response.error, "Não foi possível adicionar os assuntos.");
      }
      for (const record of currentRecords) {
        const replacement = updates.topics.find((topic) => topic.toLowerCase() === record.name.toLowerCase());
        if (replacement && replacement !== record.name) {
          const response = await this.supabase.from("topics").update({ name: replacement }).eq("id", record.id);
          if (response.error) throw toRepositoryError(response.error, "Não foi possível renomear o assunto.");
        }
      }
    }
  }

  async deleteSubject(id: string) {
    const { error } = await this.supabase.from("subjects").delete().eq("id", id);
    if (error) throw toRepositoryError(error, "Matérias usadas em atividades ou questões não podem ser excluídas.");
  }
}

export function getStudyRepository() {
  return new StudyRepository(createClient());
}
