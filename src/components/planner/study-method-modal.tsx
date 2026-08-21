"use client";

import { useState, type FormEvent } from "react";
import { BrainCircuit, CalendarPlus, Check, Repeat2 } from "lucide-react";
import { BASIC_REVIEW_SCHEDULE, getStudyMethod } from "@/lib/study-methods";
import type { StudyPlanDraft } from "@/types/activity";
import type { StudyMode } from "@/types/study-method";
import { Modal } from "@/components/ui/modal";

interface StudyMethodModalProps {
  onClose: () => void;
  onSubmit: (draft: StudyPlanDraft) => Promise<void> | void;
  open: boolean;
}

const modes: StudyMode[] = ["basic", "advanced"];

export function StudyMethodModal({ onClose, onSubmit, open }: StudyMethodModalProps) {
  const [name, setName] = useState("Meu calendário");
  const [mode, setMode] = useState<StudyMode>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ name: name.trim(), studyMode: mode });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível criar o calendário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="Cada calendário pode usar um método diferente. Você poderá alternar entre eles quando quiser."
      onClose={onClose}
      open={open}
      size="large"
      title="Como você quer usar este calendário?"
    >
      <form className="study-method-form" onSubmit={submit}>
        <label className="field">
          <span>Nome do calendário</span>
          <input autoFocus onChange={(event) => setName(event.target.value)} required value={name} />
        </label>

        <div className="study-method-grid">
          {modes.map((item) => {
            const method = getStudyMethod(item);
            const selected = mode === item;
            const Icon = item === "basic" ? Repeat2 : BrainCircuit;
            return (
              <button
                aria-pressed={selected}
                className={`study-method-card ${selected ? "study-method-card--selected" : ""}`}
                key={item}
                onClick={() => setMode(item)}
                type="button"
              >
                <span className="study-method-card__icon"><Icon size={22} /></span>
                <span className="study-method-card__title"><strong>{method.label}</strong>{selected ? <Check size={16} /> : null}</span>
                <span>{method.summary}</span>
                {item === "basic" ? (
                  <small>Revisões em {BASIC_REVIEW_SCHEDULE.map((rule) => rule.label).join(", ")}.</small>
                ) : (
                  <small>Planejamento, incidência, questões, desempenho, reforços e provas.</small>
                )}
              </button>
            );
          })}
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        <footer className="form-footer">
          <button className="button button--ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" disabled={saving} type="submit">
            <CalendarPlus size={17} /> {saving ? "Criando…" : `Usar modo ${getStudyMethod(mode).label}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
