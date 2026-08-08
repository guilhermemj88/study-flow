import { CheckCircle2, Clock3, ListChecks, Target, XCircle } from "lucide-react";
import type { StudyActivity, StudySubject } from "@/types/activity";
import { PageHeading } from "@/components/ui/page-heading";

interface PerformancePageProps {
  activities: StudyActivity[];
  subjects: StudySubject[];
}

interface SubjectMetrics {
  name: string;
  answered: number;
  correct: number;
  wrong: number;
  minutes: number;
  completed: number;
}

export function PerformancePage({ activities, subjects }: PerformancePageProps) {
  const completed = activities.filter((activity) => activity.status === "completed");
  const metrics = new Map<string, SubjectMetrics>();

  for (const subject of subjects) {
    metrics.set(subject.name, { name: subject.name, answered: 0, correct: 0, wrong: 0, minutes: 0, completed: 0 });
  }
  for (const activity of completed) {
    const current = metrics.get(activity.subject) ?? {
      name: activity.subject, answered: 0, correct: 0, wrong: 0, minutes: 0, completed: 0,
    };
    current.answered += activity.result?.questionsAnswered ?? 0;
    current.correct += activity.result?.correctAnswers ?? 0;
    current.wrong += activity.result?.wrongAnswers ?? 0;
    current.minutes += activity.result?.actualMinutes ?? 0;
    current.completed += 1;
    metrics.set(activity.subject, current);
  }

  const subjectMetrics = [...metrics.values()]
    .filter((item) => item.completed > 0)
    .sort((a, b) => {
      const accuracyA = a.answered ? a.correct / a.answered : -1;
      const accuracyB = b.answered ? b.correct / b.answered : -1;
      return accuracyB - accuracyA;
    });
  const totals = subjectMetrics.reduce(
    (sum, item) => ({
      answered: sum.answered + item.answered,
      correct: sum.correct + item.correct,
      wrong: sum.wrong + item.wrong,
      minutes: sum.minutes + item.minutes,
    }),
    { answered: 0, correct: 0, wrong: 0, minutes: 0 },
  );
  const overallAccuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : 0;

  return (
    <div className="standard-page performance-page">
      <PageHeading
        description="Um resumo direto do que você já registrou."
        eyebrow="Evolução"
        title="Desempenho"
      />

      <section className="performance-overview">
        <div className="performance-hero">
          <span className="performance-hero__label">Aproveitamento geral</span>
          <div><strong>{overallAccuracy}%</strong><span>em {totals.answered} questões</span></div>
          <div className="progress-track"><span style={{ width: `${overallAccuracy}%` }} /></div>
          <small>Baseado apenas nas atividades concluídas</small>
        </div>

        <div className="metric-grid">
          <div className="metric-card"><span className="metric-icon metric-icon--purple"><ListChecks size={18} /></span><div><strong>{totals.answered}</strong><span>Questões respondidas</span></div></div>
          <div className="metric-card"><span className="metric-icon metric-icon--green"><CheckCircle2 size={18} /></span><div><strong>{totals.correct}</strong><span>Acertos</span></div></div>
          <div className="metric-card"><span className="metric-icon metric-icon--red"><XCircle size={18} /></span><div><strong>{totals.wrong}</strong><span>Erros</span></div></div>
          <div className="metric-card"><span className="metric-icon metric-icon--blue"><Clock3 size={18} /></span><div><strong>{(totals.minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</strong><span>Horas estudadas</span></div></div>
        </div>
      </section>

      <section className="subject-performance panel-section">
        <div className="panel-section__heading">
          <div><h2>Por matéria</h2><p>Precisão acumulada nos exercícios e revisões.</p></div>
          <span><Target size={15} /> {subjectMetrics.length} com registros</span>
        </div>
        <div className="subject-performance__list">
          {subjectMetrics.length ? subjectMetrics.map((item) => {
            const accuracy = item.answered ? Math.round((item.correct / item.answered) * 100) : null;
            return (
              <div className="subject-performance__row" key={item.name}>
                <div className="subject-initial">{item.name.slice(0, 2).toUpperCase()}</div>
                <div className="subject-performance__body">
                  <div><strong>{item.name}</strong><span>{item.completed} {item.completed === 1 ? "atividade concluída" : "atividades concluídas"}</span></div>
                  <div className="progress-track progress-track--thin"><span style={{ width: `${accuracy ?? 0}%` }} /></div>
                </div>
                <div className="subject-score"><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong><span>{item.answered ? `${item.correct}/${item.answered} acertos` : `${item.minutes} min estudados`}</span></div>
              </div>
            );
          }) : <p className="no-data-copy">Conclua uma atividade para começar a acompanhar seu desempenho.</p>}
        </div>
      </section>
    </div>
  );
}
