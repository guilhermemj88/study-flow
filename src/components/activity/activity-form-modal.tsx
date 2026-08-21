"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";
import { activityTypeLabels, priorityLabels } from "@/lib/activity-meta";
import { toDateKey } from "@/lib/date-utils";
import { getStudyMethod } from "@/lib/study-methods";
import type {
  ActivityDraft,
  ActivityPriority,
  ActivityType,
  ExerciseOrigin,
  StudyActivity,
  StudySubject,
} from "@/types/activity";
import type { StudyMode } from "@/types/study-method";
import { Modal } from "@/components/ui/modal";

interface ActivityFormModalProps {
  activity?: StudyActivity;
  initialDate?: string;
  initialDraft?: Partial<ActivityDraft>;
  onClose: () => void;
  onSubmit: (draft: ActivityDraft) => Promise<void> | void;
  open: boolean;
  studyMode: StudyMode;
  subjects: StudySubject[];
}

export function ActivityFormModal({
  activity,
  initialDate,
  initialDraft,
  onClose,
  onSubmit,
  open,
  studyMode,
  subjects,
}: ActivityFormModalProps) {
  const [type, setType] = useState<ActivityType>(activity?.type ?? initialDraft?.type ?? "study");
  const [subject, setSubject] = useState(activity?.subject ?? initialDraft?.subject ?? subjects[0]?.name ?? "");
  const [topic, setTopic] = useState(activity?.topic ?? initialDraft?.topic ?? "");
  const [subtopic, setSubtopic] = useState(activity?.subtopic ?? initialDraft?.subtopic ?? "");
  const [focusLabel, setFocusLabel] = useState(activity?.focusLabel ?? initialDraft?.focusLabel ?? "");
  const [date, setDate] = useState(activity?.date ?? initialDraft?.date ?? initialDate ?? toDateKey(new Date()));
  const [estimatedMinutes, setEstimatedMinutes] = useState(activity?.estimatedMinutes ?? initialDraft?.estimatedMinutes ?? 40);
  const [questionCount, setQuestionCount] = useState(activity?.questionCount ?? initialDraft?.questionCount ?? 10);
  const [priority, setPriority] = useState<ActivityPriority>(activity?.priority ?? initialDraft?.priority ?? "medium");
  const [notes, setNotes] = useState(activity?.notes ?? initialDraft?.notes ?? "");
  const [exerciseOrigin, setExerciseOrigin] = useState<ExerciseOrigin>(activity?.exerciseOrigin ?? initialDraft?.exerciseOrigin ?? "manual");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const topicOptions = useMemo(
    () => subjects.find((item) => item.name === subject)?.topics ?? [],
    [subject, subjects],
  );
  const method = getStudyMethod(studyMode);
  const isBasic = method.capabilities.automaticReviews;
  const hasQuestions = !isBasic && type !== "study";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !topic.trim() || !date || estimatedMinutes < 1) return;

    setSaving(true);
    setFormError("");
    try {
      await onSubmit({
        type,
        subject: subject.trim(),
        topic: topic.trim(),
        subtopic: subtopic.trim() || undefined,
        focusLabel: focusLabel.trim() || undefined,
        date,
        estimatedMinutes: isBasic ? (type === "review" ? 15 : 30) : estimatedMinutes,
        questionCount: hasQuestions && questionCount > 0 ? questionCount : undefined,
        priority: isBasic ? "medium" : priority,
        status: activity?.status ?? initialDraft?.status ?? (priority === "critical" ? "attention" : "planned"),
        notes: notes.trim() || undefined,
        exerciseOrigin: hasQuestions ? exerciseOrigin : "manual",
        linkedStudyActivityId: activity?.linkedStudyActivityId ?? initialDraft?.linkedStudyActivityId,
        planId: activity?.planId ?? initialDraft?.planId,
      });
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a atividade.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description={activity ? "Atualize apenas o que mudou." : isBasic ? "Informe o conteúdo e a data. As revisões serão criadas automaticamente." : "Preencha o essencial. Você poderá editar depois."}
      onClose={onClose}
      open={open}
      size="large"
      title={activity ? `Editar ${type === "review" ? "revisão" : "estudo"}` : isBasic ? "Adicionar estudo" : "Nova atividade"}
    >
      <form className="activity-form" onSubmit={handleSubmit}>
        {!isBasic ? <div className="form-section">
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
        </div> : (
          <div className="basic-review-notice">
            <CalendarPlus size={17} />
            <span><strong>Revisões automáticas</strong>Ao salvar um estudo, o calendário agenda revisões em 7 dias, 1, 2 e 6 meses.</span>
          </div>
        )}

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

          {isBasic ? (
            <>
              <label className="field">
                <span>Subtema <em>opcional</em></span>
                <input onChange={(event) => setSubtopic(event.target.value)} placeholder="Ex.: Insuficiência cardíaca" value={subtopic} />
              </label>
              <label className="field">
                <span>Título ou descrição <em>opcional</em></span>
                <input onChange={(event) => setFocusLabel(event.target.value)} placeholder="Ex.: Aula 3 do cronograma" value={focusLabel} />
              </label>
            </>
          ) : null}

          <label className="field">
            <span>Data</span>
            <input onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
          </label>

          {!isBasic ? <label className="field">
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
          </label> : null}

          {hasQuestions ? (
            <>
              <label className="field">
                <span>Quantidade de questões</span>
                <input min="1" onChange={(event) => setQuestionCount(Number(event.target.value))} type="number" value={questionCount} />
              </label>
              <div className="field field--wide">
                <span>Origem</span>
                <div className="origin-options">
                  <label><input checked={exerciseOrigin === "manual"} name="exercise-origin" onChange={() => setExerciseOrigin("manual")} type="radio" /><span>Registrar resultado manualmente</span></label>
                  <label><input checked={exerciseOrigin === "question_bank"} name="exercise-origin" onChange={() => setExerciseOrigin("question_bank")} type="radio" /><span>Resolver questões do banco</span></label>
                </div>
              </div>
            </>
          ) : null}

          {!isBasic ? <label className="field">
            <span>Prioridade</span>
            <select
              onChange={(event) => setPriority(event.target.value as ActivityPriority)}
              value={priority}
            >
              {(Object.keys(priorityLabels) as ActivityPriority[]).map((item) => (
                <option key={item} value={item}>{priorityLabels[item]}</option>
              ))}
            </select>
          </label> : null}
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

        {formError ? <p className="form-error">{formError}</p> : null}
        <footer className="form-footer">
          <button className="button button--ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" disabled={saving} type="submit">
            <CalendarPlus size={17} />
            {saving ? "Salvando…" : activity ? "Salvar alterações" : isBasic ? "Salvar estudo e revisões" : "Adicionar ao calendário"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
