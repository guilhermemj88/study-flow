"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";
import { activityTypeLabels, priorityLabels } from "@/lib/activity-meta";
import { toDateKey } from "@/lib/date-utils";
import type {
  ActivityDraft,
  ActivityPriority,
  ActivityType,
  StudyActivity,
  StudySubject,
} from "@/types/activity";
import { Modal } from "@/components/ui/modal";

interface ActivityFormModalProps {
  activity?: StudyActivity;
  initialDate?: string;
  onClose: () => void;
  onSubmit: (draft: ActivityDraft) => void;
  open: boolean;
  subjects: StudySubject[];
}

export function ActivityFormModal({
  activity,
  initialDate,
  onClose,
  onSubmit,
  open,
  subjects,
}: ActivityFormModalProps) {
  const [type, setType] = useState<ActivityType>(activity?.type ?? "study");
  const [subject, setSubject] = useState(activity?.subject ?? subjects[0]?.name ?? "");
  const [topic, setTopic] = useState(activity?.topic ?? "");
  const [date, setDate] = useState(activity?.date ?? initialDate ?? toDateKey(new Date()));
  const [estimatedMinutes, setEstimatedMinutes] = useState(activity?.estimatedMinutes ?? 40);
  const [questionCount, setQuestionCount] = useState(activity?.questionCount ?? 10);
  const [priority, setPriority] = useState<ActivityPriority>(activity?.priority ?? "medium");
  const [notes, setNotes] = useState(activity?.notes ?? "");

  const topicOptions = useMemo(
    () => subjects.find((item) => item.name === subject)?.topics ?? [],
    [subject, subjects],
  );
  const hasQuestions = type !== "study";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !topic.trim() || !date || estimatedMinutes < 1) return;

    onSubmit({
      type,
      subject: subject.trim(),
      topic: topic.trim(),
      date,
      estimatedMinutes,
      questionCount: hasQuestions && questionCount > 0 ? questionCount : undefined,
      priority,
      status: activity?.status ?? (priority === "critical" ? "attention" : "planned"),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      description={activity ? "Atualize apenas o que mudou." : "Preencha o essencial. Você poderá editar depois."}
      onClose={onClose}
      open={open}
      size="large"
      title={activity ? "Editar atividade" : "Nova atividade"}
    >
      <form className="activity-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <span className="form-section__label">Tipo de atividade</span>
          <div className="segmented-grid segmented-grid--four">
            {(Object.keys(activityTypeLabels) as ActivityType[]).map((item) => (
              <button
                className={type === item ? "selected" : ""}
                key={item}
                onClick={() => setType(item)}
                type="button"
              >
                {activityTypeLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Matéria</span>
            <input
              autoFocus
              list="subject-options"
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Ex.: Cardiologia"
              required
              value={subject}
            />
            <datalist id="subject-options">
              {subjects.map((item) => <option key={item.id} value={item.name} />)}
            </datalist>
          </label>

          <label className="field">
            <span>Assunto</span>
            <input
              list="topic-options"
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Ex.: Arritmias"
              required
              value={topic}
            />
            <datalist id="topic-options">
              {topicOptions.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>

          <label className="field">
            <span>Data</span>
            <input onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
          </label>

          <label className="field">
            <span>Duração estimada</span>
            <div className="input-with-suffix">
              <input
                min="1"
                onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
                required
                type="number"
                value={estimatedMinutes}
              />
              <span>min</span>
            </div>
          </label>

          {hasQuestions ? (
            <label className="field">
              <span>Quantidade de questões</span>
              <input
                min="1"
                onChange={(event) => setQuestionCount(Number(event.target.value))}
                type="number"
                value={questionCount}
              />
            </label>
          ) : null}

          <label className="field">
            <span>Prioridade</span>
            <select
              onChange={(event) => setPriority(event.target.value as ActivityPriority)}
              value={priority}
            >
              {(Object.keys(priorityLabels) as ActivityPriority[]).map((item) => (
                <option key={item} value={item}>{priorityLabels[item]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Observação <em>opcional</em></span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Inclua uma orientação curta para quando começar."
            rows={3}
            value={notes}
          />
        </label>

        <footer className="form-footer">
          <button className="button button--ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" type="submit">
            <CalendarPlus size={17} />
            {activity ? "Salvar alterações" : "Adicionar ao calendário"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
