import { AlertCircle, ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { activityTypeLabels, getVisualStatus, priorityLabels } from "@/lib/activity-meta";
import { daysBetween, toDateKey } from "@/lib/date-utils";
import type { StudyActivity } from "@/types/activity";
import { ActivityTypeIcon } from "@/components/activity/activity-type-icon";
import { getActivityMeasure } from "@/components/calendar/activity-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";

interface TodayPageProps {
  activities: StudyActivity[];
  onOpenActivity: (activity: StudyActivity) => void;
}

export function TodayPage({ activities, onOpenActivity }: TodayPageProps) {
  const todayKey = toDateKey(new Date());
  const relevantActivities = activities
    .filter((activity) => (
      (activity.status !== "completed" && activity.date <= todayKey) || activity.date === todayKey
    ))
    .sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });
  const overdueCount = relevantActivities.filter(
    (activity) => activity.date < todayKey && activity.status !== "completed",
  ).length;
  const plannedMinutes = relevantActivities
    .filter((activity) => activity.status !== "completed")
    .reduce((sum, activity) => sum + activity.estimatedMinutes, 0);

  return (
    <div className="standard-page today-page">
      <PageHeading
        description="Comece pelo que mais precisa da sua atenção."
        eyebrow={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date())}
        title="Hoje"
      />

      <section className="today-summary">
        <div><strong>{relevantActivities.length}</strong><span>atividades na fila</span></div>
        <div><strong>{plannedMinutes}</strong><span>minutos planejados</span></div>
        <div className={overdueCount ? "has-alert" : ""}><strong>{overdueCount}</strong><span>atrasadas</span></div>
      </section>

      {overdueCount ? (
        <div className="attention-callout"><AlertCircle size={17} /><span><strong>{overdueCount} {overdueCount === 1 ? "atividade precisa" : "atividades precisam"} ser retomada.</strong> Elas aparecem primeiro na sua fila.</span></div>
      ) : null}

      <section className="today-list" aria-label="Atividades de hoje e atrasadas">
        {relevantActivities.length ? relevantActivities.map((activity, index) => {
          const status = getVisualStatus(activity);
          const lateDays = activity.date < todayKey ? daysBetween(activity.date, todayKey) : 0;
          return (
            <article className={`today-activity status-${status}`} key={activity.id}>
              <span className="today-activity__order">{String(index + 1).padStart(2, "0")}</span>
              <span className="today-activity__icon"><ActivityTypeIcon size={19} type={activity.type} /></span>
              <div className="today-activity__content">
                <div className="today-activity__title-row">
                  <div><span>{activity.subject}</span><h2>{activity.topic}</h2></div>
                  {lateDays ? <span className="late-badge">{lateDays}d atrasada</span> : null}
                  {activity.status === "completed" ? <span className="complete-badge"><CheckCircle2 size={13} /> Concluída</span> : null}
                </div>
                <div className="today-activity__meta">
                  <span>{activityTypeLabels[activity.type]}</span>
                  <span><Clock3 size={14} /> {getActivityMeasure(activity)}</span>
                  <span>Prioridade {priorityLabels[activity.priority].toLowerCase()}</span>
                </div>
              </div>
              <button className={`button ${activity.status === "completed" ? "button--ghost" : "button--start"}`} onClick={() => onOpenActivity(activity)} type="button">
                {activity.status === "completed" ? "Ver" : "Começar"}<ArrowRight size={16} />
              </button>
            </article>
          );
        }) : <EmptyState title="Tudo em dia" description="Você não tem atividades para hoje nem tarefas atrasadas." />}
      </section>
    </div>
  );
}
