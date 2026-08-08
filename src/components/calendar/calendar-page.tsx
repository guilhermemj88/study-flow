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
import type { StudyActivity } from "@/types/activity";
import { ActivityChip } from "@/components/calendar/activity-chip";
import { EmptyState } from "@/components/ui/empty-state";

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface CalendarPageProps {
  activities: StudyActivity[];
  onCreateActivity: (date?: string) => void;
  onOpenActivity: (activity: StudyActivity) => void;
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

export function CalendarPage({ activities, onCreateActivity, onOpenActivity }: CalendarPageProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
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
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (b.status === "completed" && a.status !== "completed") return -1;
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
    (activity) => activity.type === "review" && activity.status !== "completed",
  ).length;
  const monthActivityDays = calendarDays.filter(
    (day) => isSameMonth(day, currentMonth) && (groupedActivities.get(toDateKey(day))?.length ?? 0) > 0,
  );

  return (
    <div className="calendar-page">
      <header className="calendar-toolbar">
        <div className="month-heading">
          <span className="page-eyebrow">Seu plano de estudos</span>
          <div>
            <h1>{formatMonth(currentMonth)}</h1>
            <div className="month-navigation">
              <button aria-label="Mês anterior" className="icon-button" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} type="button"><ChevronLeft size={18} /></button>
              <button aria-label="Próximo mês" className="icon-button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} type="button"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>
        <div className="calendar-toolbar__actions">
          <button className="button button--ghost" onClick={() => setCurrentMonth(new Date())} type="button">Hoje</button>
          <button className="button button--primary" onClick={() => onCreateActivity()} type="button"><Plus size={17} /> Nova atividade</button>
        </div>
      </header>

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
          }) : <EmptyState title="Mês livre" description="Adicione uma atividade para começar seu planejamento." />}
        </div>
      </section>
    </div>
  );
}
