import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { ensureTaxonomyByNames } from "@/lib/local/study-store";
import type { ErrorReason } from "@/types/activity";
import type { ExerciseSession, QuestionDraft, QuestionFilters, StudyQuestion } from "@/types/question";

interface QuestionRow {
  id: string; source_id: string; source_name: string; question_number: number; statement: string;
  subject_id: string | null; subject_name: string | null; topic_id: string | null; topic_name: string | null;
  subtopic_text: string | null; explanation: string | null; question_status: StudyQuestion["questionStatus"];
  correct_alternative: string | null; year: number | null;
}
interface AlternativeRow { id: string; question_id: string; label: string; text: string; sort_order: number }
interface AttemptRow { id: string; question_id: string; correct: number; selected_alternative: string; answered_at: string }
interface SessionRow {
  id: string; activity_id: string | null; question_count: number; current_index: number; status: ExerciseSession["status"];
  correct_count: number; wrong_count: number;
}
interface SessionQuestionRow {
  id: string; question_id: string; position: number; selected_alternative: string | null;
  correct: number | null; error_reason: ErrorReason | null; attempt_id: string | null; answered_at: string | null;
}

export interface NamedQuestionDraft {
  questionNumber: number;
  statement: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  explanation?: string;
  questionStatus?: "valid" | "annulled";
  correctAlternative: string | null;
  year?: number;
  alternatives: Array<{ label: string; text: string; sortOrder?: number }>;
}

export class LocalQuestionStore {
  constructor(private readonly userId: string) {}

  load(filters?: Partial<QuestionFilters>, useActiveSources = true): { questions: StudyQuestion[]; activeSourceIds: string[] } {
    const database = getDatabase();
    const rows = database.prepare(`SELECT q.*, src.name AS source_name, s.name AS subject_name, t.name AS topic_name
      FROM questions q
      JOIN sources src ON src.id = q.source_id AND src.user_id = q.user_id
      LEFT JOIN subjects s ON s.id = q.subject_id AND s.user_id = q.user_id
      LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
      WHERE q.user_id = ? ORDER BY q.question_number`).all(this.userId) as QuestionRow[];
    const alternatives = database.prepare(`SELECT qa.id, qa.question_id, qa.label, qa.text, qa.sort_order
      FROM question_alternatives qa WHERE qa.user_id = ? ORDER BY qa.sort_order`).all(this.userId) as AlternativeRow[];
    const attempts = database.prepare(`SELECT id, question_id, correct, selected_alternative, answered_at
      FROM question_attempts WHERE user_id = ? ORDER BY answered_at DESC`).all(this.userId) as AttemptRow[];
    const plan = database.prepare(`SELECT id FROM study_plans
      WHERE user_id = ? AND active = 1 AND archived_at IS NULL AND deleted_at IS NULL LIMIT 1`).get(this.userId) as { id: string } | undefined;
    const activeSourceIds = plan ? (database.prepare(`SELECT source_id FROM study_plan_sources
      WHERE user_id = ? AND study_plan_id = ? AND use_for_questions = 1`).all(this.userId, plan.id) as Array<{ source_id: string }>).map((row) => row.source_id) : [];
    const selectedSources = filters?.sourceIds?.length ? filters.sourceIds : useActiveSources ? activeSourceIds : [];
    const restrictSources = Boolean(filters?.sourceIds?.length) || useActiveSources;
    const questions = rows.map<StudyQuestion>((row) => {
      const lastAttempt = attempts.find((attempt) => attempt.question_id === row.id);
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        questionNumber: row.question_number,
        statement: row.statement,
        subjectId: row.subject_id ?? undefined,
        subjectName: row.subject_name ?? undefined,
        topicId: row.topic_id ?? undefined,
        topicName: row.topic_name ?? undefined,
        subtopicText: row.subtopic_text ?? undefined,
        explanation: row.explanation ?? undefined,
        questionStatus: row.question_status,
        correctAlternative: row.correct_alternative,
        year: row.year ?? undefined,
        alternatives: alternatives.filter((item) => item.question_id === row.id).map((item) => ({ id: item.id, label: item.label, text: item.text, sortOrder: item.sort_order })),
        lastAttempt: lastAttempt ? { id: lastAttempt.id, correct: Boolean(lastAttempt.correct), selectedAlternative: lastAttempt.selected_alternative, answeredAt: lastAttempt.answered_at } : undefined,
      };
    }).filter((question) => (
      (!restrictSources || selectedSources.includes(question.sourceId))
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

  createQuestion(draft: QuestionDraft) {
    const database = getDatabase();
    const source = database.prepare("SELECT 1 FROM sources WHERE id = ? AND user_id = ?").get(draft.sourceId, this.userId);
    if (!source) throw new Error("Fonte não encontrada.");
    if (!draft.statement.trim() || !draft.alternatives.length) throw new Error("Enunciado e alternativas são obrigatórios.");
    const questionStatus = draft.questionStatus ?? "valid";
    const labels = new Set(draft.alternatives.map((item) => item.label));
    if (questionStatus === "valid") {
      if (!draft.correctAlternative || !["A", "B", "C", "D", "E"].includes(draft.correctAlternative) || !labels.has(draft.correctAlternative)) {
        throw new Error("Questões válidas exigem uma alternativa correta A, B, C, D ou E presente na lista.");
      }
    } else if (draft.correctAlternative !== null) {
      throw new Error("Questões anuladas devem ter correctAlternative=null.");
    }
    const id = newId(); const timestamp = nowIso();
    database.transaction(() => {
      database.prepare(`INSERT INTO questions (id, user_id, source_id, question_number, statement, subject_id,
        topic_id, subtopic_text, explanation, question_status, correct_alternative, year, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, draft.sourceId, draft.questionNumber, draft.statement.trim(), draft.subjectId ?? null,
          draft.topicId ?? null, draft.subtopicText ?? null, draft.explanation ?? null, questionStatus, draft.correctAlternative, draft.year ?? null, timestamp, timestamp);
      const insert = database.prepare(`INSERT INTO question_alternatives
        (id, user_id, question_id, label, text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const alternative of draft.alternatives) insert.run(newId(), this.userId, id, alternative.label, alternative.text, alternative.sortOrder, timestamp);
    })();
    return id;
  }

  saveQuestionsByName(sourceId: string, drafts: NamedQuestionDraft[]) {
    const ids: string[] = [];
    getDatabase().transaction(() => {
      for (const draft of drafts) {
        const taxonomy = ensureTaxonomyByNames(this.userId, draft.subject, draft.topic);
        ids.push(this.createQuestion({
          sourceId,
          questionNumber: draft.questionNumber,
          statement: draft.statement,
          subjectId: taxonomy.subjectId,
          topicId: taxonomy.topicId,
          subtopicText: draft.subtopic,
          explanation: draft.explanation,
          questionStatus: draft.questionStatus,
          correctAlternative: draft.correctAlternative,
          year: draft.year,
          alternatives: draft.alternatives.map((item, index) => ({ ...item, sortOrder: item.sortOrder ?? index })),
        }));
      }
    })();
    return ids;
  }

  createSession(questionIds: string[], activityId?: string) {
    if (!questionIds.length) throw new Error("Selecione ao menos uma questão.");
    const database = getDatabase();
    const placeholders = questionIds.map(() => "?").join(",");
    const count = (database.prepare(`SELECT COUNT(*) count FROM questions WHERE user_id = ? AND question_status = 'valid' AND id IN (${placeholders})`).get(this.userId, ...questionIds) as { count: number }).count;
    if (count !== questionIds.length) throw new Error("Uma ou mais questões não foram encontradas.");
    if (activityId && !database.prepare("SELECT 1 FROM activities WHERE id = ? AND user_id = ?").get(activityId, this.userId)) throw new Error("Atividade não encontrada.");
    const id = newId(); const timestamp = nowIso();
    database.transaction(() => {
      database.prepare(`INSERT INTO exercise_sessions
        (id, user_id, activity_id, question_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, activityId ?? null, questionIds.length, timestamp, timestamp);
      const insert = database.prepare(`INSERT INTO exercise_session_questions
        (id, user_id, session_id, question_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      questionIds.forEach((questionId, position) => insert.run(newId(), this.userId, id, questionId, position, timestamp, timestamp));
    })();
    return id;
  }

  getSession(id: string): ExerciseSession {
    const database = getDatabase();
    const session = database.prepare("SELECT * FROM exercise_sessions WHERE id = ? AND user_id = ?").get(id, this.userId) as SessionRow | undefined;
    if (!session) throw new Error("Sessão não encontrada.");
    const items = database.prepare(`SELECT id, question_id, position, selected_alternative, correct, error_reason, attempt_id, answered_at
      FROM exercise_session_questions WHERE session_id = ? AND user_id = ? ORDER BY position`).all(id, this.userId) as SessionQuestionRow[];
    const questionsById = new Map(this.load(undefined, false).questions.map((question) => [question.id, question]));
    const questions = items.flatMap((item) => {
      const question = questionsById.get(item.question_id);
      return question ? [{
        ...question,
        position: item.position,
        sessionQuestionId: item.id,
        selectedAlternative: item.selected_alternative ?? undefined,
        correct: item.correct === null ? undefined : Boolean(item.correct),
        errorReason: item.error_reason ?? undefined,
        lastAttempt: item.attempt_id && item.selected_alternative && item.correct !== null && item.answered_at
          ? { id: item.attempt_id, correct: Boolean(item.correct), selectedAlternative: item.selected_alternative, answeredAt: item.answered_at }
          : question.lastAttempt,
      }] : [];
    });
    return { id: session.id, activityId: session.activity_id ?? undefined, currentIndex: Math.min(session.current_index, Math.max(questions.length - 1, 0)), status: session.status, correctCount: session.correct_count, wrongCount: session.wrong_count, questions };
  }

  answer(sessionId: string, selectedAlternative: string) {
    const database = getDatabase(); const timestamp = nowIso(); const attemptId = newId();
    return database.transaction(() => {
      const session = database.prepare("SELECT * FROM exercise_sessions WHERE id = ? AND user_id = ?").get(sessionId, this.userId) as SessionRow | undefined;
      if (!session || session.status !== "in_progress") throw new Error("Sessão não encontrada ou já finalizada.");
      const item = database.prepare(`SELECT esq.*, q.correct_alternative, q.question_status FROM exercise_session_questions esq
        JOIN questions q ON q.id = esq.question_id AND q.user_id = esq.user_id
        WHERE esq.session_id = ? AND esq.user_id = ? AND esq.position = ?`).get(sessionId, this.userId, session.current_index) as (SessionQuestionRow & { correct_alternative: string | null; question_status: "valid" | "annulled" }) | undefined;
      if (!item) throw new Error("Questão atual não encontrada.");
      if (item.selected_alternative !== null) throw new Error("Esta questão já foi respondida.");
      if (item.question_status === "annulled" || !item.correct_alternative) throw new Error("Questões anuladas não entram em sessões de desempenho.");
      const validAlternative = database.prepare("SELECT 1 FROM question_alternatives WHERE question_id = ? AND user_id = ? AND label = ?").get(item.question_id, this.userId, selectedAlternative);
      if (!validAlternative) throw new Error("Alternativa inválida.");
      const correct = selectedAlternative === item.correct_alternative;
      database.prepare(`INSERT INTO question_attempts
        (id, user_id, question_id, activity_id, selected_alternative, correct, answered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(attemptId, this.userId, item.question_id, session.activity_id, selectedAlternative, Number(correct), timestamp);
      database.prepare(`UPDATE exercise_session_questions SET selected_alternative = ?, correct = ?, attempt_id = ?,
        answered_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .run(selectedAlternative, Number(correct), attemptId, timestamp, timestamp, item.id, this.userId);
      database.prepare(`UPDATE exercise_sessions SET correct_count = correct_count + ?, wrong_count = wrong_count + ?,
        updated_at = ? WHERE id = ? AND user_id = ?`).run(Number(correct), Number(!correct), timestamp, sessionId, this.userId);
      return { correct, attemptId };
    })();
  }

  setErrorReason(sessionQuestionId: string, attemptId: string, errorReason: ErrorReason) {
    const database = getDatabase();
    const item = database.prepare("SELECT attempt_id FROM exercise_session_questions WHERE id = ? AND user_id = ?").get(sessionQuestionId, this.userId) as { attempt_id: string | null } | undefined;
    if (!item || item.attempt_id !== attemptId) throw new Error("Resposta não encontrada.");
    database.transaction(() => {
      database.prepare("UPDATE exercise_session_questions SET error_reason = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(errorReason, nowIso(), sessionQuestionId, this.userId);
      database.prepare("UPDATE question_attempts SET error_reason = ? WHERE id = ? AND user_id = ?").run(errorReason, attemptId, this.userId);
    })();
  }

  advance(sessionId: string, nextIndex: number) {
    const database = getDatabase();
    const session = database.prepare("SELECT question_count, current_index FROM exercise_sessions WHERE id = ? AND user_id = ?").get(sessionId, this.userId) as { question_count: number; current_index: number } | undefined;
    if (!session || nextIndex !== session.current_index + 1 || nextIndex >= session.question_count) throw new Error("Avanço de sessão inválido.");
    const answered = database.prepare("SELECT 1 FROM exercise_session_questions WHERE session_id = ? AND user_id = ? AND position = ? AND selected_alternative IS NOT NULL").get(sessionId, this.userId, session.current_index);
    if (!answered) throw new Error("Responda a questão atual antes de avançar.");
    database.prepare("UPDATE exercise_sessions SET current_index = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(nextIndex, nowIso(), sessionId, this.userId);
  }

  complete(sessionId: string) {
    const database = getDatabase(); const timestamp = nowIso();
    database.transaction(() => {
      const session = database.prepare("SELECT * FROM exercise_sessions WHERE id = ? AND user_id = ?").get(sessionId, this.userId) as SessionRow | undefined;
      if (!session) throw new Error("Sessão não encontrada.");
      const counts = database.prepare(`SELECT COUNT(*) answered, COALESCE(SUM(correct), 0) correct
        FROM exercise_session_questions WHERE session_id = ? AND user_id = ? AND selected_alternative IS NOT NULL`).get(sessionId, this.userId) as { answered: number; correct: number };
      if (counts.answered !== session.question_count) throw new Error("Responda todas as questões antes de finalizar.");
      const wrong = counts.answered - counts.correct;
      database.prepare(`UPDATE exercise_sessions SET status = 'completed', correct_count = ?, wrong_count = ?,
        completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(counts.correct, wrong, timestamp, timestamp, sessionId, this.userId);
      if (session.activity_id) {
        const accuracy = Math.round((counts.correct / counts.answered) * 100);
        database.prepare("UPDATE activities SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(timestamp, timestamp, session.activity_id, this.userId);
        database.prepare(`INSERT INTO activity_results
          (id, user_id, activity_id, questions_answered, correct_answers, wrong_answers, accuracy,
           perceived_difficulty, error_reasons_json, study_methods_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', '[]', '[]', ?, ?)
          ON CONFLICT(user_id, activity_id) DO UPDATE SET questions_answered = excluded.questions_answered,
          correct_answers = excluded.correct_answers, wrong_answers = excluded.wrong_answers,
          accuracy = excluded.accuracy, updated_at = excluded.updated_at`)
          .run(newId(), this.userId, session.activity_id, counts.answered, counts.correct, wrong, accuracy, timestamp, timestamp);
      }
    })();
  }
}
