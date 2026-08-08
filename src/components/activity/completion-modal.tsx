"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import {
  difficultyLabels,
  errorReasonLabels,
  studyMethodLabels,
} from "@/lib/activity-meta";
import type {
  ActivityResult,
  ErrorReason,
  PerceivedDifficulty,
  StudyActivity,
  StudyMethod,
} from "@/types/activity";
import { Modal } from "@/components/ui/modal";

interface CompletionModalProps {
  activity: StudyActivity;
  onClose: () => void;
  onComplete: (result: ActivityResult) => void;
  open: boolean;
}

const difficulties: PerceivedDifficulty[] = ["easy", "normal", "hard"];
const studyMethods = Object.keys(studyMethodLabels) as StudyMethod[];
const errorReasons = Object.keys(errorReasonLabels) as ErrorReason[];

function toggleItem<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((current) => current !== item) : [...items, item];
}

export function CompletionModal({ activity, onClose, onComplete, open }: CompletionModalProps) {
  const isStudy = activity.type === "study";
  const initialQuestions = activity.questionCount ?? 10;
  const [actualMinutes, setActualMinutes] = useState(activity.estimatedMinutes);
  const [methods, setMethods] = useState<StudyMethod[]>([]);
  const [questionsAnswered, setQuestionsAnswered] = useState(initialQuestions);
  const [correctAnswers, setCorrectAnswers] = useState(initialQuestions);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [difficulty, setDifficulty] = useState<PerceivedDifficulty>("normal");
  const [reasons, setReasons] = useState<ErrorReason[]>([]);
  const [notes, setNotes] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  const accuracy = useMemo(
    () => (questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : 0),
    [correctAnswers, questionsAnswered],
  );

  function changeQuestionTotal(value: number) {
    const total = Math.max(0, value);
    setQuestionsAnswered(total);
    if (correctAnswers > total) setCorrectAnswers(total);
    setWrongAnswers(Math.max(0, total - Math.min(correctAnswers, total)));
  }

  function changeCorrect(value: number) {
    const correct = Math.max(0, Math.min(value, questionsAnswered));
    setCorrectAnswers(correct);
    setWrongAnswers(Math.max(0, questionsAnswered - correct));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStudy) {
      if (actualMinutes < 1) return;
      onComplete({
        actualMinutes,
        studyMethods: methods,
        perceivedDifficulty: difficulty,
        notes: notes.trim() || undefined,
      });
      return;
    }

    if (questionsAnswered < 1 || correctAnswers + wrongAnswers !== questionsAnswered) {
      setValidationMessage("Acertos e erros precisam somar o total respondido.");
      return;
    }
    onComplete({
      questionsAnswered,
      correctAnswers,
      wrongAnswers,
      accuracy,
      perceivedDifficulty: difficulty,
      errorReasons: reasons,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      description={`${activity.subject} · ${activity.topic}`}
      onClose={onClose}
      open={open}
      size="large"
      title={isStudy ? "Finalizar estudo" : "Registrar desempenho"}
    >
      <form className="completion-form" onSubmit={handleSubmit}>
        {isStudy ? (
          <>
            <label className="field field--compact">
              <span>Quanto tempo estudou?</span>
              <div className="input-with-suffix input-with-suffix--short">
                <input
                  min="1"
                  onChange={(event) => setActualMinutes(Number(event.target.value))}
                  required
                  type="number"
                  value={actualMinutes}
                />
                <span>min</span>
              </div>
            </label>
            <div className="form-section">
              <span className="form-section__label">O que fez? <em>selecione quantos quiser</em></span>
              <div className="choice-chips">
                {studyMethods.map((method) => (
                  <button
                    className={methods.includes(method) ? "selected" : ""}
                    key={method}
                    onClick={() => setMethods(toggleItem(methods, method))}
                    type="button"
                  >
                    {methods.includes(method) ? <Check size={14} /> : null}
                    {studyMethodLabels[method]}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="result-entry-grid">
              <label className="field">
                <span>Respondidas</span>
                <input min="1" onChange={(event) => changeQuestionTotal(Number(event.target.value))} type="number" value={questionsAnswered} />
              </label>
              <label className="field">
                <span>Acertos</span>
                <input min="0" onChange={(event) => changeCorrect(Number(event.target.value))} type="number" value={correctAnswers} />
              </label>
              <label className="field">
                <span>Erros</span>
                <input
                  min="0"
                  onChange={(event) => setWrongAnswers(Math.max(0, Number(event.target.value)))}
                  type="number"
                  value={wrongAnswers}
                />
              </label>
              <div className="accuracy-preview">
                <span>Aproveitamento</span>
                <strong>{accuracy}%</strong>
              </div>
            </div>
            {validationMessage ? <p className="form-error">{validationMessage}</p> : null}

            <div className="form-section">
              <span className="form-section__label">Principais motivos dos erros <em>opcional</em></span>
              <div className="choice-chips">
                {errorReasons.map((reason) => (
                  <button
                    className={reasons.includes(reason) ? "selected" : ""}
                    key={reason}
                    onClick={() => setReasons(toggleItem(reasons, reason))}
                    type="button"
                  >
                    {reasons.includes(reason) ? <Check size={14} /> : null}
                    {errorReasonLabels[reason]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="form-section">
          <span className="form-section__label">
            {isStudy ? "Como você avalia seu entendimento?" : "Como foi a dificuldade?"}
          </span>
          <div className="segmented-grid segmented-grid--three">
            {difficulties.map((item) => (
              <button
                className={difficulty === item ? "selected" : ""}
                key={item}
                onClick={() => setDifficulty(item)}
                type="button"
              >
                {difficultyLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Observação <em>opcional</em></span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Algo importante para a próxima revisão?"
            rows={3}
            value={notes}
          />
        </label>

        <footer className="form-footer">
          <button className="button button--ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" type="submit">
            <CheckCircle2 size={17} />
            {isStudy ? "Finalizar estudo" : "Finalizar exercícios"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
