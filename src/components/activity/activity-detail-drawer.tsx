"use client";

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  Hash,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import {
  activityTypeLabels,
  difficultyLabels,
  errorReasonLabels,
  getVisualStatus,
  priorityLabels,
  studyMethodLabels,
  visualStatusLabels,
} from "@/lib/activity-meta";
import { formatShortDate } from "@/lib/date-utils";
import type { StudyActivity } from "@/types/activity";
import { ActivityTypeIcon } from "@/components/activity/activity-type-icon";

interface ActivityDetailDrawerProps {
  activity: StudyActivity;
  onClose: () => void;
  onComplete: () => void;
  onCreateLinkedExercise: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReschedule: (date: string) => void;
  linkedExerciseCount?: number;
}

export function ActivityDetailDrawer({
  activity,
  onClose,
  onComplete,
  onCreateLinkedExercise,
  onDelete,
  onEdit,
  onReschedule,
  linkedExerciseCount = 0,
}: ActivityDetailDrawerProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newDate, setNewDate] = useState(activity.date);
  const visualStatus = getVisualStatus(activity);
  const result = activity.result;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        aria-label={`Detalhes de ${activity.focusLabel ?? activity.topic}`}
        aria-modal="true"
        className="activity-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="drawer-header">
          <div className={`drawer-type-icon status-${visualStatus}`}>
            <ActivityTypeIcon type={activity.type} size={20} />
          </div>
          <div className="drawer-title">
            <span>{activity.subject}</span>
            <h2>{activity.focusLabel ?? activity.topic}</h2>
          </div>
          <button aria-label="Fechar detalhes" className="icon-button" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </header>

        <div className="drawer-content">
          <div className={`status-banner status-${visualStatus}`}>
            <span className="status-dot" />
            {visualStatusLabels[visualStatus]}
          </div>

          <section className="detail-section">
            <h3>Detalhes</h3>
            <dl className="detail-list">
              <div><dt><ActivityTypeIcon type={activity.type} size={15} /> Tipo</dt><dd>{activityTypeLabels[activity.type]}</dd></div>
              <div><dt><CalendarClock size={15} /> Data</dt><dd>{formatShortDate(activity.date)}</dd></div>
              <div><dt><Clock3 size={15} /> Duração</dt><dd>{activity.estimatedMinutes} min</dd></div>
              {activity.questionCount ? <div><dt><Hash size={15} /> Questões</dt><dd>{activity.questionCount}</dd></div> : null}
              <div><dt>Prioridade</dt><dd><span className={`priority-pill priority-${activity.priority}`}>{priorityLabels[activity.priority]}</span></dd></div>
            </dl>
          </section>

          {activity.planningOrigin && activity.planningOrigin !== "manual" ? (
            <section className="detail-section planner-detail">
              <h3>Plano adaptativo</h3>
              <dl className="detail-list">
                <div><dt>Origem</dt><dd>{activity.planningOrigin === "performance" ? "Erro em exercício" : "Incidência nas provas"}</dd></div>
                <div><dt>Tema</dt><dd>{activity.topic}</dd></div>
                {activity.subtopic ? <div><dt>Subtema</dt><dd>{activity.subtopic}</dd></div> : null}
                {activity.plannerErrorReason ? <div><dt>Motivo do reforço</dt><dd>{errorReasonLabels[activity.plannerErrorReason]}</dd></div> : null}
                {activity.adaptiveReason ? <div><dt>Recomendação</dt><dd>{activity.adaptiveReason}</dd></div> : null}
              </dl>
            </section>
          ) : null}

          {activity.notes ? (
            <section className="detail-section">
              <h3>Observações</h3>
              <p className="detail-note">{activity.notes}</p>
            </section>
          ) : null}

          {result ? (
            <section className="detail-section result-summary">
              <div className="section-heading-row">
                <h3>Resultado registrado</h3>
                <CheckCircle2 size={17} />
              </div>
              <div className="result-summary__grid">
                {result.actualMinutes !== undefined ? <div><strong>{result.actualMinutes}</strong><span>min estudados</span></div> : null}
                {result.questionsAnswered !== undefined ? <div><strong>{result.questionsAnswered}</strong><span>respondidas</span></div> : null}
                {result.accuracy !== undefined ? <div><strong>{result.accuracy}%</strong><span>de acertos</span></div> : null}
                <div><strong>{difficultyLabels[result.perceivedDifficulty]}</strong><span>dificuldade</span></div>
              </div>
              {result.studyMethods?.length ? (
                <div className="result-tags">{result.studyMethods.map((item) => <span key={item}>{studyMethodLabels[item]}</span>)}</div>
              ) : null}
              {result.errorReasons?.length ? (
                <div className="result-tags">{result.errorReasons.map((item) => <span key={item}>{errorReasonLabels[item]}</span>)}</div>
              ) : null}
              {result.errorDetails?.length ? (
                <div className="drawer-error-list">
                  {result.errorDetails.map((detail, index) => (
                    <div key={`${detail.topicText}-${index}`}><strong>{detail.topicText}{detail.subtopicText ? ` · ${detail.subtopicText}` : ""}</strong><span>{detail.errorCount} {detail.errorCount === 1 ? "erro" : "erros"} · {errorReasonLabels[detail.errorReason]}</span></div>
                  ))}
                </div>
              ) : null}
              {result.notes ? <p className="detail-note">{result.notes}</p> : null}
            </section>
          ) : null}

          {activity.type === "study" && activity.status === "completed" ? (
            <section className="detail-section linked-exercises">
              <h3>Exercícios</h3>
              <p>{linkedExerciseCount ? `${linkedExerciseCount} ${linkedExerciseCount === 1 ? "exercício vinculado" : "exercícios vinculados"}` : "Nenhum exercício registrado"}</p>
              <button className="button button--ghost" onClick={onCreateLinkedExercise} type="button"><Plus size={16} /> Registrar exercícios deste assunto</button>
            </section>
          ) : null}

          {showReschedule ? (
            <section className="inline-action-panel">
              <label className="field">
                <span>Nova data</span>
                <input onChange={(event) => setNewDate(event.target.value)} type="date" value={newDate} />
              </label>
              <div>
                <button className="button button--ghost button--small" onClick={() => setShowReschedule(false)} type="button">Cancelar</button>
                <button
                  className="button button--primary button--small"
                  onClick={() => { onReschedule(newDate); setShowReschedule(false); }}
                  type="button"
                >Salvar data</button>
              </div>
            </section>
          ) : null}

          {showDelete ? (
            <section className="inline-delete-panel">
              <strong>Excluir esta atividade?</strong>
              <p>Essa ação remove também o resultado registrado.</p>
              <div>
                <button className="button button--ghost button--small" onClick={() => setShowDelete(false)} type="button">Manter</button>
                <button className="button button--danger button--small" onClick={onDelete} type="button">Excluir</button>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="drawer-actions">
          {activity.status !== "completed" ? (
            <button className="button button--primary drawer-primary-action" onClick={onComplete} type="button">
              <CheckCircle2 size={17} /> Concluir
            </button>
          ) : null}
          <div className="drawer-secondary-actions">
            <button className="button button--ghost" onClick={onEdit} type="button"><Edit3 size={16} /> Editar</button>
            <button className="button button--ghost" onClick={() => setShowReschedule(true)} type="button"><RotateCw size={16} /> Reagendar</button>
            <button aria-label="Excluir atividade" className="button button--icon-danger" onClick={() => setShowDelete(true)} type="button"><Trash2 size={17} /></button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
