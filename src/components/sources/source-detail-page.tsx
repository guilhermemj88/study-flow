"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Pencil, Plus, Save } from "lucide-react";
import { useSourceLibrary } from "@/hooks/use-source-library";
import { useStudyData } from "@/hooks/use-study-data";
import { getQuestionRepository } from "@/lib/data/question-repository";
import { getSourceRepository } from "@/lib/data/source-repository";
import type { StudyQuestion } from "@/types/question";
import type { SourceTopicStat } from "@/types/source";
import { QuestionFormModal } from "@/components/questions/question-form-modal";
import { SourceFormModal } from "@/components/sources/source-form-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { PageHeading } from "@/components/ui/page-heading";

interface SourceDetailPageProps { sourceId: string }

export function SourceDetailPage({ sourceId }: SourceDetailPageProps) {
  const library = useSourceLibrary();
  const study = useStudyData();
  const source = library.sources.find((item) => item.id === sourceId);
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [statId, setStatId] = useState<string | undefined>();
  const [statSubjectId, setStatSubjectId] = useState("");
  const [statTopicId, setStatTopicId] = useState("");
  const [statSubtopic, setStatSubtopic] = useState("");
  const [statCount, setStatCount] = useState(0);
  const [statPercentage, setStatPercentage] = useState(0);
  const [statError, setStatError] = useState("");
  const topics = useMemo(() => study.subjects.find((subject) => subject.id === statSubjectId)?.topicRecords ?? [], [statSubjectId, study.subjects]);

  useEffect(() => {
    let active = true;
    getQuestionRepository().load({ sourceIds: [sourceId] }, false).then((data) => {
      if (active) setQuestions(data.questions);
    }).catch(() => {
      if (active) setQuestions([]);
    }).finally(() => {
      if (active) setQuestionsReady(true);
    });
    return () => { active = false; };
  }, [sourceId]);

  async function reloadQuestions() {
    const data = await getQuestionRepository().load({ sourceIds: [sourceId] }, false);
    setQuestions(data.questions);
  }

  function editStat(stat: SourceTopicStat) {
    setStatId(stat.id);
    setStatSubjectId(stat.subjectId);
    setStatTopicId(stat.topicId ?? "");
    setStatSubtopic(stat.subtopicText ?? "");
    setStatCount(stat.questionCount);
    setStatPercentage(stat.incidencePercentage);
  }

  async function saveStat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statSubjectId) { setStatError("Selecione uma matéria."); return; }
    setStatError("");
    try {
      await getSourceRepository().saveTopicStat({ id: statId, sourceId, subjectId: statSubjectId, topicId: statTopicId || undefined, subtopicText: statSubtopic.trim() || undefined, questionCount: statCount, incidencePercentage: statPercentage });
      setStatId(undefined); setStatTopicId(""); setStatSubtopic(""); setStatCount(0); setStatPercentage(0);
      await library.reload();
    } catch (caughtError) { setStatError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a incidência."); }
  }

  if (!library.isReady || !study.isReady || !questionsReady) return <LoadingScreen />;
  if (!source) return <div className="standard-page"><EmptyState title="Fonte não encontrada" description="Ela pode ter sido removida ou não pertence à sua conta." /><Link className="button button--ghost" href="/provas"><ArrowLeft size={16} /> Voltar</Link></div>;

  const incidenceBaseCount = library.sources.filter((item) => item.planSelection?.useForIncidence).length;
  const incidenceQuestionBase = library.sources.filter((item) => item.planSelection?.useForIncidence).reduce((sum, item) => sum + item.questionCount, 0);

  return (
    <div className="standard-page source-detail-page">
      <Link className="back-link" href="/provas"><ArrowLeft size={15} /> Provas e fontes</Link>
      <PageHeading action={<div className="heading-actions">{source.storagePath ? <button className="button button--ghost" onClick={() => void library.openSource(source)} type="button"><Download size={16} /> Abrir arquivo</button> : null}<button className="button button--ghost" onClick={() => setShowSourceForm(true)} type="button"><Pencil size={15} /> Editar</button><button className="button button--primary" onClick={() => setShowQuestionForm(true)} type="button"><Plus size={16} /> Adicionar questão</button></div>} description={`${source.institution || "Instituição não informada"}${source.year ? ` · ${source.year}` : ""} · ${source.questionCount} questões`} eyebrow={source.sourceType === "exam" ? "Prova" : source.sourceType === "edital" ? "Edital" : "Fonte"} title={source.name} />
      {library.error ? <div className="page-error">{library.error}</div> : null}

      <section className="panel-section source-questions-panel">
        <div className="panel-section__heading"><div><h2>Questões cadastradas</h2><p>Cadastro manual disponível enquanto a análise automática não está ativa.</p></div><span>{questions.length} questões</span></div>
        {questions.length ? <div className="compact-question-list">{questions.map((question) => <article key={question.id}><span>{question.questionNumber}</span><div><strong>{question.subjectName ?? "Sem matéria"}{question.topicName ? ` · ${question.topicName}` : ""}</strong><p>{question.statement}</p></div><small>Resposta {question.correctAlternative}</small></article>)}</div> : <EmptyState title="Nenhuma questão cadastrada" description="Adicione a primeira questão oficial desta fonte." />}
      </section>

      <section className="panel-section incidence-panel">
        <div className="panel-section__heading"><div><h2>Incidência</h2><p>Base: {incidenceBaseCount} {incidenceBaseCount === 1 ? "fonte" : "fontes"} · {incidenceQuestionBase} questões.</p></div><span>Valores manuais</span></div>
        {source.topicStats.length ? <div className="incidence-list">{source.topicStats.map((stat) => <button key={stat.id} onClick={() => editStat(stat)} type="button"><div><strong>{stat.subjectName}</strong><span>{stat.topicName ?? stat.subtopicText ?? "Geral"}</span></div><strong>{stat.incidencePercentage.toLocaleString("pt-BR")}%</strong><span>{stat.questionCount} questões</span></button>)}</div> : <p className="no-data-copy">Nenhuma incidência informada. Use o formulário abaixo.</p>}
        <form className="incidence-form" onSubmit={saveStat}>
          <label className="field"><span>Matéria</span><select onChange={(event) => { setStatSubjectId(event.target.value); setStatTopicId(""); }} required value={statSubjectId}><option value="">Selecione</option>{study.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="field"><span>Tema</span><select onChange={(event) => setStatTopicId(event.target.value)} value={statTopicId}><option value="">Geral</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
          <label className="field"><span>Subtema</span><input onChange={(event) => setStatSubtopic(event.target.value)} value={statSubtopic} /></label>
          <label className="field"><span>Questões</span><input min="0" onChange={(event) => setStatCount(Number(event.target.value))} type="number" value={statCount} /></label>
          <label className="field"><span>Incidência %</span><input max="100" min="0" onChange={(event) => setStatPercentage(Number(event.target.value))} step="0.1" type="number" value={statPercentage} /></label>
          <button className="button button--primary" type="submit"><Save size={15} /> {statId ? "Atualizar" : "Adicionar"}</button>
        </form>
        {statError ? <p className="form-error">{statError}</p> : null}
      </section>

      {showQuestionForm ? <QuestionFormModal onClose={() => setShowQuestionForm(false)} onSubmit={async (draft) => { await getQuestionRepository().createQuestion(draft); await reloadQuestions(); await library.reload(); }} sourceId={source.id} sourceYear={source.year} subjects={study.subjects} /> : null}
      {showSourceForm ? <SourceFormModal onClose={() => setShowSourceForm(false)} onSubmit={async (draft) => { await library.updateSource(source.id, draft); }} source={source} /> : null}
    </div>
  );
}
