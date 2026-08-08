"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Check, LoaderCircle } from "lucide-react";
import { getStudyRepository } from "@/lib/data/study-repository";
import type { PlanSettings, WeekdayKey } from "@/types/planner";

const days: Array<{ key: WeekdayKey; label: string }> = [
  { key: "mon", label: "SEG" }, { key: "tue", label: "TER" }, { key: "wed", label: "QUA" },
  { key: "thu", label: "QUI" }, { key: "fri", label: "SEX" }, { key: "sat", label: "SÁB" }, { key: "sun", label: "DOM" },
];

export function PlanSettingsPanel() {
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getStudyRepository().getPlanSettings().then(setSettings).catch((error: unknown) => {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Não foi possível carregar o planejamento." });
    });
  }, []);

  if (!settings) return <section className="planner-settings planner-settings--loading"><LoaderCircle className="spin" size={20} /> Carregando planejamento…</section>;

  async function save() {
    if (!settings) return;
    setSaving(true); setMessage(null);
    try {
      setSettings(await getStudyRepository().updatePlanSettings(settings));
      setMessage({ ok: true, text: "Preferências de planejamento salvas." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Não foi possível salvar." });
    } finally { setSaving(false); }
  }

  return (
    <section className="planner-settings">
      <header><span className="settings-icon"><CalendarRange size={19} /></span><div><h2>Planejamento</h2><p>Disponibilidade, sessões e intervalos usados pelo plano adaptativo.</p></div></header>
      <div className="planner-settings__body">
        <div className="planner-settings__grid">
          <label className="field"><span>Data da prova <em>opcional</em></span><input onChange={(event) => setSettings({ ...settings, examDate: event.target.value || undefined })} type="date" value={settings.examDate ?? ""} /></label>
          <label className="field"><span>Duração média</span><select onChange={(event) => setSettings({ ...settings, sessionMinutes: Number(event.target.value) as PlanSettings["sessionMinutes"] })} value={settings.sessionMinutes}>{[30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutos</option>)}</select></label>
          <label className="field"><span>Limite diário</span><select onChange={(event) => {
            const dailyLimitMinutes = Number(event.target.value);
            setSettings({ ...settings, dailyLimitMinutes, availability: Object.fromEntries(Object.entries(settings.availability).map(([day, minutes]) => [day, Math.min(minutes, dailyLimitMinutes)])) as PlanSettings["availability"] });
          }} value={settings.dailyLimitMinutes}>{[60, 90, 120, 180, 240, 300, 360].map((value) => <option key={value} value={value}>{value / 60}h</option>)}</select></label>
          <label className="field"><span>Exercícios por sessão</span><select onChange={(event) => setSettings({ ...settings, exerciseQuestions: Number(event.target.value) as PlanSettings["exerciseQuestions"] })} value={settings.exerciseQuestions}>{[10, 20, 30, 50].map((value) => <option key={value} value={value}>{value} questões</option>)}</select></label>
        </div>

        <div className="planner-fieldset"><span>Dias e tempo disponível</span><div className="availability-grid">
          {days.map((day) => {
            const active = settings.availability[day.key] > 0;
            return <div className={active ? "active" : ""} key={day.key}><button onClick={() => setSettings({ ...settings, availability: { ...settings.availability, [day.key]: active ? 0 : Math.min(120, settings.dailyLimitMinutes) } })} type="button"><span>{active ? <Check size={12} /> : null}</span>{day.label}</button><label><input disabled={!active} min="30" onChange={(event) => setSettings({ ...settings, availability: { ...settings.availability, [day.key]: Number(event.target.value) } })} step="30" type="number" value={settings.availability[day.key]} /><small>min</small></label></div>;
          })}
        </div></div>

        <div className="planner-fieldset"><span>Espaçamento</span><div className="planner-settings__grid planner-settings__grid--three">
          <label className="field"><span>1ª revisão após</span><div className="input-with-suffix"><input min="1" onChange={(event) => setSettings({ ...settings, firstReviewDays: Number(event.target.value) })} type="number" value={settings.firstReviewDays} /><span>dias</span></div></label>
          <label className="field"><span>2ª etapa (exercícios) após</span><div className="input-with-suffix"><input min="2" onChange={(event) => setSettings({ ...settings, secondReviewDays: Number(event.target.value) })} type="number" value={settings.secondReviewDays} /><span>dias</span></div></label>
          <label className="field"><span>Reforço após</span><div className="input-with-suffix"><input min="3" onChange={(event) => setSettings({ ...settings, reinforcementDays: Number(event.target.value) })} type="number" value={settings.reinforcementDays} /><span>dias</span></div></label>
        </div></div>

        <footer>{message ? <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p> : <span />}<button className="button button--primary" disabled={saving} onClick={() => void save()} type="button">{saving ? "Salvando…" : "Salvar planejamento"}</button></footer>
      </div>
    </section>
  );
}
