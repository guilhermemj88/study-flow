import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toRepositoryError } from "@/lib/data/repository-error";
import type { ErrorReason } from "@/types/activity";
import type {
  ExerciseSession,
  QuestionDraft,
  QuestionFilters,
  StudyQuestion,
} from "@/types/question";

interface DbQuestion {
  id: string; source_id: string; question_number: number; statement: string; subject_id: string | null;
  topic_id: string | null; subtopic_text: string | null; explanation: string | null;
  correct_alternative: string; year: number | null;
}
interface DbAlternative { id: string; question_id: string; label: string; text: string; sort_order: number }
interface DbAttempt { id: string; question_id: string; correct: boolean; selected_alternative: string; answered_at: string }

export class QuestionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async userId() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) throw toRepositoryError(error, "Sua sessão expirou. Entre novamente.");
    return data.user.id;
  }

  async load(filters?: Partial<QuestionFilters>, useActiveSources = true): Promise<{ questions: StudyQuestion[]; activeSourceIds: string[] }> {
    await this.userId();
    const [questionsResponse, alternativesResponse, attemptsResponse, sourcesResponse, planResponse, linksResponse, subjectsResponse, topicsResponse] = await Promise.all([
      this.supabase.from("questions").select("*").order("question_number"),
      this.supabase.from("question_alternatives").select("id,question_id,label,text,sort_order").order("sort_order"),
      this.supabase.from("question_attempts").select("id,question_id,correct,selected_alternative,answered_at").order("answered_at", { ascending: false }),
      this.supabase.from("sources").select("id,name"),
      this.supabase.from("study_plans").select("id").eq("active", true).limit(1).maybeSingle(),
      this.supabase.from("study_plan_sources").select("study_plan_id,source_id,use_for_questions"),
      this.supabase.from("subjects").select("id,name"),
      this.supabase.from("topics").select("id,name"),
    ]);
    const error = questionsResponse.error ?? alternativesResponse.error ?? attemptsResponse.error ?? sourcesResponse.error ?? planResponse.error ?? linksResponse.error ?? subjectsResponse.error ?? topicsResponse.error;
    if (error) throw toRepositoryError(error, "Não foi possível carregar o banco de questões.");

    const rows = (questionsResponse.data ?? []) as DbQuestion[];
    const alternatives = (alternativesResponse.data ?? []) as DbAlternative[];
    const attempts = (attemptsResponse.data ?? []) as DbAttempt[];
    const sources = new Map(((sourcesResponse.data ?? []) as Array<{ id: string; name: string }>).map((item) => [item.id, item.name]));
    const subjects = new Map(((subjectsResponse.data ?? []) as Array<{ id: string; name: string }>).map((item) => [item.id, item.name]));
    const topics = new Map(((topicsResponse.data ?? []) as Array<{ id: string; name: string }>).map((item) => [item.id, item.name]));
    const activePlanId = (planResponse.data as { id: string } | null)?.id;
    const activeSourceIds = ((linksResponse.data ?? []) as Array<{ source_id: string; study_plan_id?: string; use_for_questions: boolean }>)
      .filter((item) => item.use_for_questions && Boolean(activePlanId) && item.study_plan_id === activePlanId)
      .map((item) => item.source_id);
    const selectedSources = filters?.sourceIds?.length ? filters.sourceIds : useActiveSources ? activeSourceIds : [];
    const restrictToSelectedSources = Boolean(filters?.sourceIds?.length) || useActiveSources;

    const questions = rows.map<StudyQuestion>((row) => {
      const lastAttempt = attempts.find((attempt) => attempt.question_id === row.id);
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceName: sources.get(row.source_id) ?? "Fonte",
        questionNumber: row.question_number,
        statement: row.statement,
        subjectId: row.subject_id ?? undefined,
        subjectName: row.subject_id ? subjects.get(row.subject_id) : undefined,
        topicId: row.topic_id ?? undefined,
        topicName: row.topic_id ? topics.get(row.topic_id) : undefined,
        subtopicText: row.subtopic_text ?? undefined,
        explanation: row.explanation ?? undefined,
        correctAlternative: row.correct_alternative,
        year: row.year ?? undefined,
        alternatives: alternatives.filter((item) => item.question_id === row.id).map((item) => ({ id: item.id, label: item.label, text: item.text, sortOrder: item.sort_order })),
        lastAttempt: lastAttempt ? { id: lastAttempt.id, correct: lastAttempt.correct, selectedAlternative: lastAttempt.selected_alternative, answeredAt: lastAttempt.answered_at } : undefined,
      };
    }).filter((question) => (
      (!restrictToSelectedSources || selectedSources.includes(question.sourceId))
      && (!filters?.subjectId || question.subjectId === filters.subjectId)
      && (!filters?.topicId || question.topicId === filters.topicId)
      && (!filters?.year || question.year === filters.year)
      && (!filters?.status || filters.status === "all"
        || (filters.status === "unanswered" && !question.lastAttempt)
        || (filters.status === "wrong" && question.lastAttempt?.correct === false)
        || (filters.status === "correct" && question.lastAttempt?.correct === true))
    ));

    return { questions, activeSourceIds };
  }

  async createQuestion(draft: QuestionDraft) {
    const userId = await this.userId();
    const response = await this.supabase.from("questions").insert({
      user_id: userId,
      source_id: draft.sourceId,
      question_number: draft.questionNumber,
      statement: draft.statement,
      subject_id: draft.subjectId ?? null,
      topic_id: draft.topicId ?? null,
      subtopic_text: draft.subtopicText ?? null,
      explanation: draft.explanation ?? null,
      correct_alternative: draft.correctAlternative,
      year: draft.year ?? null,
    }).select("id").single();
    if (response.error || !response.data) throw toRepositoryError(response.error, "Não foi possível criar a questão.");
    const questionId = response.data.id as string;
    const alternativesResponse = await this.supabase.from("question_alternatives").insert(draft.alternatives.map((alternative) => ({
      user_id: userId,
      question_id: questionId,
      label: alternative.label,
      text: alternative.text,
      sort_order: alternative.sortOrder,
    })));
    if (alternativesResponse.error) {
      await this.supabase.from("questions").delete().eq("id", questionId);
      throw toRepositoryError(alternativesResponse.error, "Não foi possível salvar as alternativas.");
    }
    return questionId;
  }

  async createSession(questions: StudyQuestion[], activityId?: string) {
    const userId = await this.userId();
    const response = await this.supabase.from("exercise_sessions").insert({
      user_id: userId,
      activity_id: activityId ?? null,
      question_count: questions.length,
    }).select("id").single();
    if (response.error || !response.data) throw toRepositoryError(response.error, "Não foi possível iniciar a sessão.");
    const sessionId = response.data.id as string;
    const questionsResponse = await this.supabase.from("exercise_session_questions").insert(questions.map((question, position) => ({
      user_id: userId,
      session_id: sessionId,
      question_id: question.id,
      position,
    })));
    if (questionsResponse.error) {
      await this.supabase.from("exercise_sessions").delete().eq("id", sessionId);
      throw toRepositoryError(questionsResponse.error, "Não foi possível preparar as questões da sessão.");
    }
    return sessionId;
  }

  async getSession(id: string): Promise<ExerciseSession> {
    await this.userId();
    const sessionResponse = await this.supabase.from("exercise_sessions").select("*").eq("id", id).single();
    if (sessionResponse.error || !sessionResponse.data) throw toRepositoryError(sessionResponse.error, "Sessão não encontrada.");
    const itemsResponse = await this.supabase.from("exercise_session_questions").select("*").eq("session_id", id).order("position");
    if (itemsResponse.error) throw toRepositoryError(itemsResponse.error, "Não foi possível carregar a sessão.");
    const items = (itemsResponse.data ?? []) as Array<{ id: string; question_id: string; position: number; selected_alternative: string | null; correct: boolean | null; error_reason: ErrorReason | null }>;
    const all = await this.load(undefined, false);
    const questionsById = new Map(all.questions.map((question) => [question.id, question]));
    const questions = items.flatMap((item) => {
      const question = questionsById.get(item.question_id);
      return question ? [{
        ...question,
        position: item.position,
        sessionQuestionId: item.id,
        selectedAlternative: item.selected_alternative ?? undefined,
        correct: item.correct ?? undefined,
        errorReason: item.error_reason ?? undefined,
      }] : [];
    });
    const session = sessionResponse.data as { id: string; activity_id: string | null; current_index: number; status: ExerciseSession["status"]; correct_count: number; wrong_count: number };
    return {
      id: session.id,
      activityId: session.activity_id ?? undefined,
      currentIndex: Math.min(session.current_index, Math.max(questions.length - 1, 0)),
      status: session.status,
      correctCount: session.correct_count,
      wrongCount: session.wrong_count,
      questions,
    };
  }

  async answer(session: ExerciseSession, selectedAlternative: string, errorReason?: ErrorReason) {
    const userId = await this.userId();
    const question = session.questions[session.currentIndex];
    if (!question) throw new Error("Questão atual não encontrada.");
    const correct = selectedAlternative === question.correctAlternative;
    const answeredAt = new Date().toISOString();
    const itemResponse = await this.supabase.from("exercise_session_questions").update({
      selected_alternative: selectedAlternative,
      correct,
      error_reason: correct ? null : errorReason ?? null,
      answered_at: answeredAt,
    }).eq("id", question.sessionQuestionId);
    if (itemResponse.error) throw toRepositoryError(itemResponse.error, "Não foi possível salvar a resposta.");
    const attemptResponse = await this.supabase.from("question_attempts").insert({
      user_id: userId,
      question_id: question.id,
      activity_id: session.activityId ?? null,
      selected_alternative: selectedAlternative,
      correct,
      error_reason: correct ? null : errorReason ?? null,
      answered_at: answeredAt,
    }).select("id").single();
    if (attemptResponse.error || !attemptResponse.data) throw toRepositoryError(attemptResponse.error, "A resposta foi salva, mas o histórico não pôde ser registrado.");
    const sessionResponse = await this.supabase.from("exercise_sessions").update({
      correct_count: session.correctCount + (correct ? 1 : 0),
      wrong_count: session.wrongCount + (correct ? 0 : 1),
    }).eq("id", session.id);
    if (sessionResponse.error) throw toRepositoryError(sessionResponse.error, "Não foi possível atualizar o resultado da sessão.");
    return { correct, attemptId: attemptResponse.data.id as string };
  }

  async setErrorReason(sessionQuestionId: string, attemptId: string, errorReason: ErrorReason) {
    const [sessionQuestionResponse, attemptResponse] = await Promise.all([
      this.supabase.from("exercise_session_questions").update({ error_reason: errorReason }).eq("id", sessionQuestionId),
      this.supabase.from("question_attempts").update({ error_reason: errorReason }).eq("id", attemptId),
    ]);
    const error = sessionQuestionResponse.error ?? attemptResponse.error;
    if (error) throw toRepositoryError(error, "Não foi possível registrar o motivo do erro.");
  }

  async advance(sessionId: string, nextIndex: number) {
    const { error } = await this.supabase.from("exercise_sessions").update({ current_index: nextIndex }).eq("id", sessionId);
    if (error) throw toRepositoryError(error, "Não foi possível avançar a sessão.");
  }

  async complete(session: ExerciseSession) {
    const completedAt = new Date().toISOString();
    const response = await this.supabase.from("exercise_sessions").update({ status: "completed", completed_at: completedAt }).eq("id", session.id);
    if (response.error) throw toRepositoryError(response.error, "Não foi possível finalizar a sessão.");
    if (session.activityId) {
      const answered = session.correctCount + session.wrongCount;
      const accuracy = answered ? Math.round((session.correctCount / answered) * 100) : 0;
      const userId = await this.userId();
      const activityResponse = await this.supabase.from("activities").update({ status: "completed", completed_at: completedAt }).eq("id", session.activityId);
      if (activityResponse.error) throw toRepositoryError(activityResponse.error, "A sessão terminou, mas a atividade não foi atualizada.");
      const resultResponse = await this.supabase.from("activity_results").upsert({
        user_id: userId,
        activity_id: session.activityId,
        questions_answered: answered,
        correct_answers: session.correctCount,
        wrong_answers: session.wrongCount,
        accuracy,
        perceived_difficulty: "normal",
      }, { onConflict: "activity_id" });
      if (resultResponse.error) throw toRepositoryError(resultResponse.error, "A sessão terminou, mas o desempenho não foi atualizado.");
    }
  }
}

export function getQuestionRepository() {
  return new QuestionRepository(createClient());
}
