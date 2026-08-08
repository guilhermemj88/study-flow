"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { StudySubject } from "@/types/activity";
import type { QuestionAlternative, QuestionDraft } from "@/types/question";

interface QuestionFormModalProps {
  sourceId: string;
  sourceYear?: number;
  subjects: StudySubject[];
  onClose: () => void;
  onSubmit: (draft: QuestionDraft) => Promise<void>;
}

const INITIAL_ALTERNATIVES: QuestionAlternative[] = ["A", "B", "C", "D"].map((label, sortOrder) => ({ label, text: "", sortOrder }));

export function QuestionFormModal({ sourceId, sourceYear, subjects, onClose, onSubmit }: QuestionFormModalProps) {
  const [number, setNumber] = useState(1);
  const [statement, setStatement] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState("");
  const [subtopicText, setSubtopicText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [correctAlternative, setCorrectAlternative] = useState("A");
  const [alternatives, setAlternatives] = useState<QuestionAlternative[]>(INITIAL_ALTERNATIVES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const topics = useMemo(() => subjects.find((subject) => subject.id === subjectId)?.topicRecords ?? [], [subjectId, subjects]);

  function addAlternative() {
    if (alternatives.length >= 5) return;
    const label = String.fromCharCode(65 + alternatives.length);
    setAlternatives((current) => [...current, { label, text: "", sortOrder: current.length }]);
  }

  function removeAlternative(index: number) {
    if (alternatives.length <= 2) return;
    const next = alternatives.filter((_, itemIndex) => itemIndex !== index).map((item, sortOrder) => ({ ...item, label: String.fromCharCode(65 + sortOrder), sortOrder }));
    setAlternatives(next);
    if (!next.some((item) => item.label === correctAlternative)) setCorrectAlternative(next[0].label);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim() || alternatives.some((item) => !item.text.trim())) {
      setError("Preencha o enunciado e todas as alternativas.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        sourceId,
        questionNumber: number,
        statement: statement.trim(),
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        subtopicText: subtopicText.trim() || undefined,
        explanation: explanation.trim() || undefined,
        correctAlternative,
        year: sourceYear,
        alternatives: alternatives.map((item) => ({ ...item, text: item.text.trim() })),
      });
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a questão.");
    } finally { setSaving(false); }
  }

  return (
    <Modal description="Cadastre uma questão oficial para usar nos exercícios." onClose={onClose} open size="large" title="Adicionar questão">
      <form className="question-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field"><span>Número</span><input min="1" onChange={(event) => setNumber(Number(event.target.value))} required type="number" value={number} /></label>
          <label className="field"><span>Matéria</span><select onChange={(event) => { setSubjectId(event.target.value); setTopicId(""); }} value={subjectId}><option value="">Sem classificação</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="field"><span>Tema</span><select onChange={(event) => setTopicId(event.target.value)} value={topicId}><option value="">Sem tema</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
          <label className="field"><span>Subtema</span><input onChange={(event) => setSubtopicText(event.target.value)} placeholder="Opcional" value={subtopicText} /></label>
        </div>
        <label className="field"><span>Enunciado</span><textarea autoFocus onChange={(event) => setStatement(event.target.value)} required rows={5} value={statement} /></label>
        <div className="question-alternatives">
          <div className="question-alternatives__heading"><strong>Alternativas</strong>{alternatives.length < 5 ? <button className="button button--ghost button--small" onClick={addAlternative} type="button"><Plus size={14} /> Adicionar</button> : null}</div>
          {alternatives.map((alternative, index) => (
            <div className="alternative-edit-row" key={alternative.label}>
              <label className="correct-radio" title="Marcar como correta"><input checked={correctAlternative === alternative.label} name="correct" onChange={() => setCorrectAlternative(alternative.label)} type="radio" /><span>{alternative.label}</span></label>
              <input aria-label={`Texto da alternativa ${alternative.label}`} onChange={(event) => setAlternatives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} value={alternative.text} />
              <button aria-label={`Remover alternativa ${alternative.label}`} className="icon-button icon-button--danger" disabled={alternatives.length <= 2} onClick={() => removeAlternative(index)} type="button"><Trash2 size={14} /></button>
            </div>
          ))}
          <small>Selecione o círculo da alternativa correta.</small>
        </div>
        <label className="field"><span>Explicação <em>opcional</em></span><textarea onChange={(event) => setExplanation(event.target.value)} rows={3} value={explanation} /></label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="form-footer"><button className="button button--ghost" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={saving} type="submit"><Save size={16} /> {saving ? "Salvando…" : "Salvar questão"}</button></footer>
      </form>
    </Modal>
  );
}
