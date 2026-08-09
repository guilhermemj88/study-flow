"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Filter, Play } from "lucide-react";
import { useSourceLibrary } from "@/hooks/use-source-library";
import { useStudyData } from "@/hooks/use-study-data";
import { getQuestionRepository } from "@/lib/data/question-repository";
import { selectQuestions } from "@/lib/study-engine/select-questions";
import type { QuestionStatusFilter, StudyQuestion } from "@/types/question";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { PageHeading } from "@/components/ui/page-heading";

interface QuestionsPageProps { activityId?: string; initialSubjectId?: string; initialTopicId?: string }
const amounts = [10, 20, 30, 50];
const statusLabels: Record<QuestionStatusFilter, string> = { all: "Todas", unanswered: "Não respondidas", wrong: "Erradas", correct: "Acertadas" };

export function QuestionsPage({ activityId, initialSubjectId = "", initialTopicId = "" }: QuestionsPageProps) {
  const router = useRouter();
  const library = useSourceLibrary();
  const study = useStudyData();
  const [allQuestions, setAllQuestions] = useState<StudyQuestion[]>([]);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [customSourceSelection, setCustomSourceSelection] = useState<string[] | null>(null);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<QuestionStatusFilter>("all");
  const [amount, setAmount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getQuestionRepository().load(undefined, false).then((data) => {
      if (active) setAllQuestions(data.questions);
    }).catch((caughtError: unknown) => {
      if (active) setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar as questões.");
    }).finally(() => { if (active) setQuestionsReady(true); });
    return () => { active = false; };
  }, []);

  const activeSourceIds = library.sources.filter((source) => source.planSelection?.useForQuestions).map((source) => source.id);
  const selectedSourceIds = customSourceSelection ?? activeSourceIds;
  const topics = study.subjects.find((subject) => subject.id === subjectId)?.topicRecords ?? [];
  const years = [...new Set(allQuestions.flatMap((question) => question.year ? [question.year] : []))].sort((a, b) => b - a);
  const filteredQuestions = useMemo(() => allQuestions.filter((question) => (
    question.questionStatus !== "annulled"
    && selectedSourceIds.includes(question.sourceId)
    && (!subjectId || question.subjectId === subjectId)
    && (!topicId || question.topicId === topicId)
    && (!year || question.year === Number(year))
    && (status === "all"
      || (status === "unanswered" && !question.lastAttempt)
      || (status === "wrong" && question.lastAttempt?.correct === false)
      || (status === "correct" && question.lastAttempt?.correct === true))
  )), [allQuestions, selectedSourceIds, subjectId, topicId, year, status]);

  function toggleSource(sourceId: string) {
    const current = customSourceSelection ?? activeSourceIds;
    setCustomSourceSelection(current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]);
  }

  async function startSession() {
    const selected = selectQuestions(filteredQuestions, Math.min(amount, filteredQuestions.length));
    if (!selected.length) { setError("Não há questões disponíveis para estes filtros."); return; }
    setStarting(true); setError("");
    try {
      const sessionId = await getQuestionRepository().createSession(selected, activityId);
      router.push(`/questoes/sessao/${sessionId}`);
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Não foi possível iniciar o exercício."); setStarting(false); }
  }

  if (!library.isReady || !study.isReady || !questionsReady) return <LoadingScreen />;

  return (
    <div className="standard-page questions-page">
      <PageHeading description={activityId ? "Questões filtradas para a atividade do calendário." : "Monte uma sessão com as provas oficiais do seu plano."} eyebrow="Prática dirigida" title="Banco de questões" />
      {error || library.error || study.error ? <div className="page-error">{error || library.error || study.error}</div> : null}

      <section className="question-bank-summary">
        <div><strong>{allQuestions.length}</strong><span>questões cadastradas</span></div>
        <div><strong>{filteredQuestions.length}</strong><span>disponíveis com os filtros</span></div>
        <div><strong>{activeSourceIds.length}</strong><span>fontes ativas no plano</span></div>
      </section>

      {allQuestions.length ? (
        <section className="question-filter-panel">
          <div className="filter-title"><Filter size={17} /><div><h2>Filtros</h2><p>Por padrão, somente fontes marcadas para questões no plano.</p></div></div>
          <div className="source-filter-grid">
            {library.sources.map((source) => <label key={source.id}><input checked={selectedSourceIds.includes(source.id)} onChange={() => toggleSource(source.id)} type="checkbox" /><span><Check size={13} /> {source.name}<small>{source.questionCount} questões</small></span></label>)}
          </div>
          <div className="question-filter-grid">
            <label className="field"><span>Matéria</span><select onChange={(event) => { setSubjectId(event.target.value); setTopicId(""); }} value={subjectId}><option value="">Todas</option>{study.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label className="field"><span>Tema</span><select onChange={(event) => setTopicId(event.target.value)} value={topicId}><option value="">Todos</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
            <label className="field"><span>Ano</span><select onChange={(event) => setYear(event.target.value)} value={year}><option value="">Todos</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="field"><span>Status</span><select onChange={(event) => setStatus(event.target.value as QuestionStatusFilter)} value={status}>{(Object.keys(statusLabels) as QuestionStatusFilter[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
          </div>
          <div className="session-start-row">
            <div><span>Quantidade</span><div className="quantity-selector">{amounts.map((item) => <button className={amount === item ? "selected" : ""} key={item} onClick={() => setAmount(item)} type="button">{item}</button>)}</div></div>
            <div className="available-copy"><strong>{Math.min(amount, filteredQuestions.length)}</strong><span>serão selecionadas</span><small>Nunca respondidas primeiro, depois erradas.</small></div>
            <button className="button button--primary button--large" disabled={starting || !filteredQuestions.length} onClick={() => void startSession()} type="button"><Play size={17} fill="currentColor" /> {starting ? "Preparando…" : "Iniciar exercício"}</button>
          </div>
        </section>
      ) : <EmptyState title="Banco de questões vazio" description="Cadastre questões manualmente dentro de uma prova ou fonte." />}
    </div>
  );
}
