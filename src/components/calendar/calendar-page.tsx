"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Flame,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  addDays,
  addMonths,
  formatMonth,
  getCalendarDays,
  isSameMonth,
  isToday,
  toDateKey,
} from "@/lib/date-utils";
import { getStudyMethod } from "@/lib/study-methods";
import type { StudyActivity, StudyPlan } from "@/types/activity";
import { ActivityChip } from "@/components/calendar/activity-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StudyPlanManager } from "@/components/planner/study-plan-manager";
import type { StudyPlanPreview } from "@/types/planner";

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface CalendarPageProps {
  activePlan?: StudyPlan;
  activities: StudyActivity[];
  onActivatePlan: (id: string) => Promise<void> | void;
  onArchivePlan: (id: string) => Promise<void>;
  onCreateActivity: (date?: string) => void;
  onCreatePlan: () => void;
  onDeletePlan: (id: string) => Promise<void>;
  onListArchivedPlans: () => Promise<StudyPlan[]>;
  onOpenActivity: (activity: StudyActivity) => void;
  onOpenPlanner: () => void;
  onRenamePlan: (id: string, name: string) => Promise<void>;
  onRestorePlan: (id: string) => Promise<void>;
  onGeneratePlanner: () => Promise<void>;
  plannerPreview?: StudyPlanPreview | null;
  plans: StudyPlan[];
}

function studyStreak(activities: StudyActivity[]): number {
  const completedDays = new Set(
    activities
      .filter((activity) => activity.completedAt)
      .map((activity) => toDateKey(new Date(activity.completedAt as string))),
  );
  let cursor = new Date();
  if (!completedDays.has(toDateKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (completedDays.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function CalendarPage({ activePlan, activities, onActivatePlan, onArchivePlan, onCreateActivity, onCreatePlan, onDeletePlan, onListArchivedPlans, onOpenActivity, onOpenPlanner, onRenamePlan, onRestorePlan, onGeneratePlanner, plannerPreview, plans }: CalendarPageProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const method = getStudyMethod(activePlan?.studyMode ?? "advanced");
  const todayKey = toDateKey(new Date());
  const calendarDays = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, StudyActivity[]>();
    for (const activity of activities) {
      const current = groups.get(activity.date) ?? [];
      current.push(activity);
      groups.set(activity.date, current);
    }
    for (const items of groups.values()) {
      items.sort((a, b) => {
        const aFinal = a.status === "completed" || a.status === "not_done";
        const bFinal = b.status === "completed" || b.status === "not_done";
        if (aFinal && !bFinal) return 1;
        if (bFinal && !aFinal) return -1;
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    }
    return groups;
  }, [activities]);

  const todayActivities = activities.filter((activity) => activity.date === todayKey);
  const completedToday = activities.filter(
    (activity) => activity.completedAt && toDateKey(new Date(activity.completedAt)) === todayKey,
  ).length;
  const pendingReviews = activities.filter(
    (activity) => activity.type === "review" && activity.status !== "completed" && activity.status !== "not_done",
  ).length;
  const monthActivityDays = calendarDays.filter(
    (day) => isSameMonth(day, currentMonth) && (groupedActivities.get(toDateKey(day))?.length ?? 0) > 0,
  );
  const hasFutureActivities = activities.some((activity) => activity.date >= todayKey && activity.status !== "completed" && activity.status !== "not_done");
  const showInitialPlanPrompt = Boolean(
    method.capabilities.adaptivePlanner && plannerPreview?.hasIncidenceData && plannerPreview.activityCount > 0 && !hasFutureActivities,
  );

  async function generateInitialPlan() {
    setGeneratingPlan(true);
    setPlannerError(null);
    try {
      await onGeneratePlanner();
    } catch (error) {
      setPlannerError(error instanceof Error ? error.message : "Não foi possível gerar o plano inicial.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  return (
    <div className="calendar-page">
      <header className="calendar-toolbar">
        <div className="month-heading">
          <span className="page-eyebrow calendar-plan-heading">
            {activePlan?.name ?? "Seu plano de estudos"}
            <span className={`study-mode-badge study-mode-badge--${method.mode}`}>{method.label}</span>
          </span>
          <div>
            <h1>{formatMonth(currentMonth)}</h1>
            <div className="month-navigation">
              <button aria-label="Mês anterior" className="icon-button" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} type="button"><ChevronLeft size={18} /></button>
              <button aria-label="Próximo mês" className="icon-button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} type="button"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>
        <div className="calendar-toolbar__actions">
          <StudyPlanManager
            activePlan={activePlan}
            onActivate={onActivatePlan}
            onArchive={onArchivePlan}
            onDelete={onDeletePlan}
            onListArchived={onListArchivedPlans}
            onRename={onRenamePlan}
            onRestore={onRestorePlan}
            plans={plans}
          />
          <button className="button button--ghost create-calendar-button" onClick={onCreatePlan} type="button"><Plus size={16} /> Novo calendário</button>
          <button className="button button--ghost" onClick={() => setCurrentMonth(new Date())} type="button">Hoje</button>
          {method.capabilities.adaptivePlanner ? <button className="button button--ghost planner-button" onClick={onOpenPlanner} type="button"><Sparkles size={16} /> {plannerPreview?.hasGeneratedPlan ? "Recalcular plano" : "Gerar plano de estudos"}</button> : null}
          <button className="button button--primary" onClick={() => onCreateActivity()} type="button"><Plus size={17} /> {method.mode === "basic" ? "Adicionar estudo" : "Nova atividade"}</button>
        </div>
      </header>

      {showInitialPlanPrompt ? (
        <section className="calendar-initial-plan" aria-label="Plano inicial disponível">
          <div><Sparkles size={20} /><span><strong>Seu plano inicial está pronto para ser criado com base nas provas analisadas.</strong><small>A distribuição já considera a incidência real de cada tema, mesmo sem exercícios respondidos.</small></span></div>
          <div className="calendar-initial-plan__actions">
            <button className="button button--ghost" onClick={onOpenPlanner} type="button">Visualizar plano</button>
            <button className="button button--primary" disabled={generatingPlan} onClick={() => void generateInitialPlan()} type="button"><Sparkles size={16} /> {generatingPlan ? "Gerando…" : "Gerar plano"}</button>
          </div>
          {plannerError ? <p className="form-error">{plannerError}</p> : null}
        </section>
      ) : null}

      {method.capabilities.adaptivePlanner && plannerPreview?.incidenceChanged ? (
        <button className="calendar-incidence-notice" onClick={onOpenPlanner} type="button">
          <Sparkles size={16} />
          <span><strong>Novos dados de incidência disponíveis.</strong> Abra a prévia para recalcular apenas as atividades futuras.</span>
        </button>
      ) : null}

      <section className="kpi-strip" aria-label="Resumo do dia">
        <div className="kpi-item"><span className="kpi-icon kpi-icon--green"><CalendarCheck2 size={17} /></span><div><strong>{todayActivities.length}</strong><span>atividades hoje</span></div></div>
        <div className="kpi-item"><span className="kpi-icon kpi-icon--blue"><CircleCheckBig size={17} /></span><div><strong>{completedToday}</strong><span>concluídas hoje</span></div></div>
        <div className="kpi-item"><span className="kpi-icon kpi-icon--yellow"><RotateCcw size={17} /></span><div><strong>{pendingReviews}</strong><span>revisões pendentes</span></div></div>
        <div className="kpi-item"><span className="kpi-icon kpi-icon--orange"><Flame size={17} /></span><div><strong>{studyStreak(activities)}</strong><span>dias em sequência</span></div></div>
      </section>

      <section className="calendar-panel">
        <div className="calendar-panel__topline">
          <span>{activities.filter((activity) => activity.date.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`)).length} atividades no mês</span>
          <div className="status-legend" aria-label="Legenda de status">
            <span><i className="legend-on-track" />No prazo</span>
            <span><i className="legend-attention" />Atenção</span>
            <span><i className="legend-reinforcement" />Reforço</span>
            <span><i className="legend-overdue" />Atrasada</span>
            <span><i className="legend-completed" />Concluída</span>
          </div>
        </div>

        <div className="calendar-desktop">
          <div className="calendar-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const dateKey = toDateKey(day);
              const dayActivities = groupedActivities.get(dateKey) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              return (
                <div className={`calendar-day ${inMonth ? "" : "calendar-day--outside"} ${isToday(day) ? "calendar-day--today" : ""}`} key={dateKey}>
                  <div className="calendar-day__header">
                    <span>{String(day.getDate()).padStart(2, "0")}</span>
                    {inMonth ? (
                      <button aria-label={`Adicionar atividade em ${dateKey}`} onClick={() => onCreateActivity(dateKey)} type="button"><Plus size={13} /></button>
                    ) : null}
                  </div>
                  <div className="calendar-day__activities">
                    {dayActivities.slice(0, 4).map((activity) => (
                      <ActivityChip activity={activity} key={activity.id} onClick={() => onOpenActivity(activity)} />
                    ))}
                    {dayActivities.length > 4 ? <span className="more-activities">+ {dayActivities.length - 4} outras</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="calendar-mobile">
          {monthActivityDays.length ? monthActivityDays.map((day) => {
            const dateKey = toDateKey(day);
            const dayActivities = groupedActivities.get(dateKey) ?? [];
            return (
              <div className={`mobile-day ${isToday(day) ? "mobile-day--today" : ""}`} key={dateKey}>
                <div className="mobile-day__heading">
                  <div><strong>{String(day.getDate()).padStart(2, "0")}</strong><span>{weekDays[(day.getDay() + 6) % 7]}{isToday(day) ? " · Hoje" : ""}</span></div>
                  <button aria-label="Adicionar neste dia" className="icon-button" onClick={() => onCreateActivity(dateKey)} type="button"><Plus size={16} /></button>
                </div>
                <div className="mobile-day__activities">
                  {dayActivities.map((activity) => <ActivityChip activity={activity} key={activity.id} onClick={() => onOpenActivity(activity)} variant="agenda" />)}
                </div>
              </div>
            );
          }) : <EmptyState title="Mês livre" description={method.mode === "basic" ? "Adicione o conteúdo do seu cronograma e as revisões aparecerão aqui." : "Visualize seu plano por incidência ou adicione uma atividade manualmente."} />}
        </div>
      </section>
    </div>
  );
}
