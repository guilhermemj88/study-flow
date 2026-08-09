"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Check, Clock3, FileCheck2, Layers3, LoaderCircle, Sparkles } from "lucide-react";
import { getStudyRepository } from "@/lib/data/study-repository";
import type { PlanMutationResult, PlanSettings, StudyPlanPreview, WeekdayKey } from "@/types/planner";
import { Modal } from "@/components/ui/modal";

interface StudyPlanModalProps {
  initialPreview?: StudyPlanPreview | null;
  onApplied: (result: PlanMutationResult) => Promise<void> | void;
  onClose: () => void;
  open: boolean;
}

const days: Array<{ key: WeekdayKey; short: string; label: string }> = [
  { key: "mon", short: "SEG", label: "Segunda" }, { key: "tue", short: "TER", label: "Terça" },
  { key: "wed", short: "QUA", label: "Quarta" }, { key: "thu", short: "QUI", label: "Quinta" },
  { key: "fri", short: "SEX", label: "Sexta" }, { key: "sat", short: "SÁB", label: "Sábado" },
  { key: "sun", short: "DOM", label: "Domingo" },
];

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h` : ""}${remainder ? ` ${remainder}min` : ""}`.trim() || "0h";
}

function draftCapacity(settings: PlanSettings) {
  const startDate = new Date().toISOString().slice(0, 10);
  const weeklyMinutes = Object.values(settings.availability).reduce((sum, value) => sum + Math.min(value, settings.dailyLimitMinutes), 0);
  if (!settings.examDate || settings.examDate < startDate) return { daysRemaining: 0, weeksRemaining: 0, weeklyMinutes, totalMinutes: 0 };
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${settings.examDate}T12:00:00Z`);
  const daysRemaining = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  let totalMinutes = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[cursor.getUTCDay()];
    totalMinutes += Math.min(settings.availability[key], settings.dailyLimitMinutes);
  }
  return { daysRemaining, weeksRemaining: Math.round(daysRemaining / 7 * 10) / 10, weeklyMinutes, totalMinutes };
}

export function StudyPlanModal({ initialPreview, onApplied, onClose, open }: StudyPlanModalProps) {
  const [step, setStep] = useState<"configuration" | "preview">("configuration");
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [preview, setPreview] = useState<StudyPlanPreview | null>(initialPreview ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacity = useMemo(() => settings ? draftCapacity(settings) : null, [settings]);
  const topPriorities = preview?.priorities.slice(0, 5) ?? [];

  useEffect(() => {
    if (!open) return;
    getStudyRepository().getPlanSettings()
      .then((value) => { setStep("configuration"); setSettings(value); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar a configuração."))
      .finally(() => setLoading(false));
  }, [open]);

  function setDayMinutes(day: WeekdayKey, minutes: number) {
    if (!settings) return;
    setSettings({ ...settings, availability: { ...settings.availability, [day]: Math.max(0, Math.min(minutes, settings.dailyLimitMinutes)) } });
  }

  async function continueToPreview() {
    if (!settings) return;
    if (!settings.examDate) { setError("Informe a data da prova antes de continuar."); return; }
    if (!Object.values(settings.availability).some((minutes) => minutes >= settings.sessionMinutes)) {
      setError("Informe ao menos um dia com tempo suficiente para uma sessão."); return;
    }
    setSaving(true); setError(null);
    try {
      const saved = await getStudyRepository().updatePlanSettings(settings);
      setSettings(saved);
      setPreview(await getStudyRepository().previewStudyPlan());
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível calcular a prévia.");
    } finally { setSaving(false); }
  }

  async function apply() {
    if (!preview?.activityCount) return;
    setSaving(true); setError(null);
    try {
      const result = preview.hasGeneratedPlan
        ? await getStudyRepository().recalculateFuturePlan(preview.startDate)
        : await getStudyRepository().generateStudyPlan(preview.startDate, true);
      await onApplied(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o plano.");
    } finally { setSaving(false); }
  }

  return (
    <Modal description="Configure sua capacidade real, revise a distribuição e confirme antes de gravar o calendário." onClose={onClose} open={open} size="large" title={preview?.hasGeneratedPlan ? "Recalcular plano de estudos" : "Gerar plano de estudos"}>
      {loading ? <div className="planner-modal-loading"><LoaderCircle className="spin" size={24} /> Carregando configuração…</div> : settings && step === "configuration" ? (
        <div className="planner-preview planner-configuration">
          <div className="planner-steps"><strong>1</strong><span>Configuração</span><i /><strong>2</strong><span>Prévia e confirmação</span></div>
          <div className="planner-settings__grid">
            <label className="field"><span>Data da prova</span><input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setSettings({ ...settings, examDate: event.target.value || undefined })} required type="date" value={settings.examDate ?? ""} /></label>
            <label className="field"><span>Duração preferida</span><select onChange={(event) => setSettings({ ...settings, sessionMinutes: Number(event.target.value) as PlanSettings["sessionMinutes"] })} value={settings.sessionMinutes}>{[30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutos</option>)}</select></label>
            <label className="field"><span>Limite diário</span><select onChange={(event) => {
              const dailyLimitMinutes = Number(event.target.value);
              setSettings({ ...settings, dailyLimitMinutes, availability: Object.fromEntries(Object.entries(settings.availability).map(([day, minutes]) => [day, Math.min(minutes, dailyLimitMinutes)])) as PlanSettings["availability"] });
            }} value={settings.dailyLimitMinutes}>{[60, 90, 120, 180, 240, 300, 360, 480, 720].map((value) => <option key={value} value={value}>{formatMinutes(value)}</option>)}</select></label>
            <label className="field"><span>Exercícios por sessão</span><select onChange={(event) => setSettings({ ...settings, exerciseQuestions: Number(event.target.value) as PlanSettings["exerciseQuestions"] })} value={settings.exerciseQuestions}>{[10, 20, 30, 50].map((value) => <option key={value} value={value}>{value} questões</option>)}</select></label>
          </div>

          <div className="planner-fieldset"><span>Disponibilidade individual por dia</span><div className="availability-grid availability-grid--friendly">
            {days.map((day) => {
              const minutes = settings.availability[day.key];
              const active = minutes > 0;
              return <div className={active ? "active" : ""} key={day.key} title={day.label}>
                <button onClick={() => setDayMinutes(day.key, active ? 0 : Math.min(settings.sessionMinutes, settings.dailyLimitMinutes))} type="button"><span>{active ? <Check size={12} /> : null}</span>{day.short}</button>
                <div className="availability-time"><label><input aria-label={`Horas de ${day.label}`} disabled={!active} max={Math.floor(settings.dailyLimitMinutes / 60)} min="0" onChange={(event) => setDayMinutes(day.key, Number(event.target.value) * 60 + minutes % 60)} type="number" value={Math.floor(minutes / 60)} /><small>h</small></label><label><select aria-label={`Minutos de ${day.label}`} disabled={!active} onChange={(event) => setDayMinutes(day.key, Math.floor(minutes / 60) * 60 + Number(event.target.value))} value={minutes % 60}>{[0, 15, 30, 45].map((value) => <option key={value} value={value}>{value}</option>)}</select><small>min</small></label></div>
              </div>;
            })}
          </div></div>

          <div className="planner-fieldset"><span>Revisão, exercícios e reforço</span><div className="planner-settings__grid planner-settings__grid--three">
            <label className="field"><span>1ª revisão após</span><div className="input-with-suffix"><input min="1" onChange={(event) => setSettings({ ...settings, firstReviewDays: Number(event.target.value) })} type="number" value={settings.firstReviewDays} /><span>dias</span></div></label>
            <label className="field"><span>Exercícios após</span><div className="input-with-suffix"><input min="2" onChange={(event) => setSettings({ ...settings, secondReviewDays: Number(event.target.value) })} type="number" value={settings.secondReviewDays} /><span>dias</span></div></label>
            <label className="field"><span>Reforço após</span><div className="input-with-suffix"><input min="3" onChange={(event) => setSettings({ ...settings, reinforcementDays: Number(event.target.value) })} type="number" value={settings.reinforcementDays} /><span>dias</span></div></label>
          </div></div>

          {capacity ? <section className="planner-capacity-card"><div><CalendarRange size={18} /><span><small>Tempo restante</small><strong>{capacity.daysRemaining} dias · {capacity.weeksRemaining} semanas</strong></span></div><div><Clock3 size={18} /><span><small>Capacidade semanal</small><strong>{formatMinutes(capacity.weeklyMinutes)}</strong></span></div><div><Sparkles size={18} /><span><small>Capacidade estimada até a prova</small><strong>{formatMinutes(capacity.totalMinutes)}</strong></span></div></section> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <footer className="form-footer"><button className="button button--ghost" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={saving} onClick={() => void continueToPreview()} type="button">{saving ? "Calculando…" : "Salvar e visualizar prévia"}</button></footer>
        </div>
      ) : preview ? (
        <div className="planner-preview">
          <div className="planner-steps"><strong className="done"><Check size={12} /></strong><span>Configuração</span><i /><strong>2</strong><span>Prévia e confirmação</span></div>
          {preview.incidenceChanged ? <div className="planner-incidence-notice"><Sparkles size={16} /><span><strong>Novos dados de incidência disponíveis.</strong> O recálculo preservará atividades concluídas.</span></div> : null}
          <div className="planner-preview__metrics">
            <div><CalendarRange size={17} /><strong>{formatMinutes(preview.totalMinutes)}</strong><span>carga distribuída</span></div>
            <div><Clock3 size={17} /><strong>{formatMinutes(preview.capacity.weeklyMinutes)}</strong><span>capacidade semanal</span></div>
            <div><strong>{preview.estimatedSessions}</strong><span>sessões estimadas</span></div>
            <div><FileCheck2 size={17} /><strong>{preview.sourceCount}</strong><span>fontes de incidência</span></div>
            <div><Layers3 size={17} /><strong>{preview.subjectCount}</strong><span>matérias · {preview.topicCount} temas</span></div>
            <div><strong>{preview.activityBreakdown.study} / {preview.activityBreakdown.exercise} / {preview.activityBreakdown.review} / {preview.activityBreakdown.reinforcement}</strong><span>estudo · exercícios · revisões · reforços</span></div>
          </div>
          <div className="planner-period"><span>Período do plano</span><strong>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${preview.startDate}T12:00:00`))} até {new Intl.DateTimeFormat("pt-BR").format(new Date(`${preview.endDate}T12:00:00`))}</strong></div>
          <div className="planner-priority-preview"><span>Temas prioritários</span>{topPriorities.map((item) => <div key={`${item.subjectId}-${item.topicId}-${item.subtopic}`}><strong>{item.subtopic || item.topic}</strong><small>{item.subject} · {(item.priorityWeight * 100).toFixed(1)}%</small></div>)}</div>
          {preview.capacityInsufficient ? <div className="planner-capacity-warning"><AlertTriangle size={18} /><div><strong>Sua disponibilidade atual pode não ser suficiente para cobrir todo o conteúdo com a profundidade planejada.</strong><p>Você pode aumentar a carga semanal, reduzir a quantidade de atividades ou continuar priorizando os temas de maior incidência.</p><small>A geração continuará respeitando o limite de cada dia.</small></div></div> : null}
          {!preview.sourceCount ? <p className="form-error">Selecione ao menos uma prova com incidência persistida. Gabaritos não contam como amostra.</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <footer className="form-footer"><button className="button button--ghost" onClick={() => setStep("configuration")} type="button">Voltar e ajustar</button><button className="button button--primary" disabled={saving || !preview.activityCount} onClick={() => void apply()} type="button"><Sparkles size={16} />{saving ? "Aplicando…" : preview.hasGeneratedPlan ? "Confirmar recálculo" : "Confirmar e gerar calendário"}</button></footer>
        </div>
      ) : <div className="planner-modal-loading">{error ?? "Prévia indisponível."}</div>}
    </Modal>
  );
}
