"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, RotateCcw, XCircle } from "lucide-react";
import { errorReasonLabels } from "@/lib/activity-meta";
import { getQuestionRepository } from "@/lib/data/question-repository";
import type { ErrorReason } from "@/types/activity";
import type { ExerciseSession } from "@/types/question";
import { LoadingScreen } from "@/components/ui/loading-screen";

const errorReasons = Object.keys(errorReasonLabels) as ErrorReason[];

export function ExerciseSessionPage({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ExerciseSession | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getQuestionRepository().getSession(sessionId).then((loaded) => {
      if (active) { setSession(loaded); setSelected(loaded.questions[loaded.currentIndex]?.selectedAlternative ?? ""); }
    }).catch((caughtError: unknown) => {
      if (active) setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar a sessão.");
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [sessionId]);

  async function refresh() {
    const loaded = await getQuestionRepository().getSession(sessionId);
    setSession(loaded);
    return loaded;
  }

  async function confirmAnswer() {
    if (!session || !selected) return;
    setSaving(true); setError("");
    try {
      const result = await getQuestionRepository().answer(session, selected);
      setAttemptId(result.attemptId);
      await refresh();
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Não foi possível confirmar a resposta."); }
    finally { setSaving(false); }
  }

  async function nextQuestion() {
    if (!session) return;
    const nextIndex = session.currentIndex + 1;
    setSaving(true);
    try {
      await getQuestionRepository().advance(session.id, nextIndex);
      const loaded = await refresh();
      setSelected(loaded.questions[loaded.currentIndex]?.selectedAlternative ?? "");
      setAttemptId(null);
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Não foi possível avançar."); }
    finally { setSaving(false); }
  }

  async function finish() {
    if (!session) return;
    setSaving(true);
    try { await getQuestionRepository().complete(session); await refresh(); }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Não foi possível finalizar a sessão."); }
    finally { setSaving(false); }
  }

  async function setReason(reason: ErrorReason) {
    if (!session) return;
    const question = session.questions[session.currentIndex];
    const effectiveAttemptId = attemptId ?? question.lastAttempt?.id;
    if (!effectiveAttemptId) return;
    setSaving(true);
    try {
      await getQuestionRepository().setErrorReason(question.sessionQuestionId, effectiveAttemptId, reason);
      setSession({ ...session, questions: session.questions.map((item, index) => index === session.currentIndex ? { ...item, errorReason: reason } : item) });
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Não foi possível registrar o motivo."); }
    finally { setSaving(false); }
  }

  if (!ready) return <LoadingScreen />;
  if (error && !session) return <div className="session-shell"><div className="page-error">{error}</div><Link className="button button--ghost" href="/questoes"><ArrowLeft size={16} /> Voltar ao banco</Link></div>;
  if (!session) return null;

  const answered = session.correctCount + session.wrongCount;
  if (session.status === "completed") {
    const accuracy = answered ? Math.round((session.correctCount / answered) * 100) : 0;
    return <div className="session-shell session-summary"><span className="session-summary__icon"><CheckCircle2 size={34} /></span><span>Exercício concluído</span><h1>{accuracy}% de aproveitamento</h1><div><strong>{session.correctCount}</strong><span>acertos</span><strong>{session.wrongCount}</strong><span>erros</span><strong>{answered}</strong><span>respondidas</span></div><Link className="button button--primary" href="/desempenho">Ver desempenho</Link><Link className="button button--ghost" href="/questoes"><RotateCcw size={16} /> Nova sessão</Link></div>;
  }

  const question = session.questions[session.currentIndex];
  if (!question) return <div className="session-shell"><div className="page-error">Esta sessão não possui questões acessíveis.</div></div>;
  const answeredCurrent = question.correct !== undefined;
  const isLast = session.currentIndex === session.questions.length - 1;

  return (
    <div className="session-shell">
      <header className="session-header"><Link href="/questoes"><ArrowLeft size={17} /> Sair</Link><div><span>Questão {session.currentIndex + 1} de {session.questions.length}</span><div className="session-progress"><span style={{ width: `${((session.currentIndex + (answeredCurrent ? 1 : 0)) / session.questions.length) * 100}%` }} /></div></div><small>{session.correctCount} acertos · {session.wrongCount} erros</small></header>
      {error ? <div className="page-error">{error}</div> : null}
      <main className="question-focus-card">
        <div className="question-context"><span>{question.sourceName} · Questão {question.questionNumber}</span><div>{question.subjectName ? <strong>{question.subjectName}</strong> : null}{question.topicName ? <span>{question.topicName}{question.subtopicText ? ` · ${question.subtopicText}` : ""}</span> : null}</div></div>
        <p className="question-statement">{question.statement}</p>
        <div className="answer-options">{question.alternatives.map((alternative) => {
          const correct = answeredCurrent && alternative.label === question.correctAlternative;
          const wrongSelected = answeredCurrent && alternative.label === selected && !question.correct;
          return <button className={`${selected === alternative.label ? "selected" : ""} ${correct ? "correct" : ""} ${wrongSelected ? "wrong" : ""}`} disabled={answeredCurrent} key={alternative.label} onClick={() => setSelected(alternative.label)} type="button"><span>{alternative.label}</span><p>{alternative.text}</p>{correct ? <CheckCircle2 size={18} /> : wrongSelected ? <XCircle size={18} /> : null}</button>;
        })}</div>

        {answeredCurrent ? (
          <div className={`answer-feedback ${question.correct ? "answer-feedback--correct" : "answer-feedback--wrong"}`}>
            <div>{question.correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}<div><strong>{question.correct ? "Correto" : "Incorreto"}</strong>{!question.correct ? <span>Resposta correta: {question.correctAlternative}</span> : null}</div></div>
            {question.explanation ? <p>{question.explanation}</p> : null}
            {!question.correct && (attemptId || question.lastAttempt?.id) ? <label className="field"><span>Por que você errou? <em>opcional</em></span><select disabled={saving} onChange={(event) => void setReason(event.target.value as ErrorReason)} value={question.errorReason ?? ""}><option value="">Selecionar motivo</option>{errorReasons.map((reason) => <option key={reason} value={reason}>{errorReasonLabels[reason]}</option>)}</select></label> : null}
          </div>
        ) : null}

        <footer className="question-actions">{answeredCurrent ? <button className="button button--primary button--large" disabled={saving} onClick={() => void (isLast ? finish() : nextQuestion())} type="button">{isLast ? "Finalizar exercício" : "Próxima questão"}<ChevronRight size={17} /></button> : <button className="button button--primary button--large" disabled={!selected || saving} onClick={() => void confirmAnswer()} type="button">{saving ? "Salvando…" : "Confirmar resposta"}</button>}</footer>
      </main>
    </div>
  );
}
