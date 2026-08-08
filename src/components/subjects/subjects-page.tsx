"use client";

import { useState, type FormEvent } from "react";
import { Check, Edit3, Plus, Trash2, X } from "lucide-react";
import type { StudySubject } from "@/types/activity";
import { PageHeading } from "@/components/ui/page-heading";

interface SubjectsPageProps {
  onAddSubject: (name: string) => void;
  onDeleteSubject: (id: string) => void;
  onUpdateSubject: (id: string, updates: Partial<StudySubject>) => void;
  subjects: StudySubject[];
}

interface SubjectRowProps {
  onDelete: () => void;
  onUpdate: (updates: Partial<StudySubject>) => void;
  subject: StudySubject;
}

function SubjectRow({ onDelete, onUpdate, subject }: SubjectRowProps) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(subject.name);
  const [newTopic, setNewTopic] = useState("");
  const [editingTopic, setEditingTopic] = useState<number | null>(null);
  const [topicValue, setTopicValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function saveName() {
    if (name.trim()) onUpdate({ name: name.trim() });
    setEditingName(false);
  }

  function addTopic(event: FormEvent) {
    event.preventDefault();
    const value = newTopic.trim();
    if (!value || subject.topics.some((topic) => topic.toLowerCase() === value.toLowerCase())) return;
    onUpdate({ topics: [...subject.topics, value] });
    setNewTopic("");
  }

  function saveTopic(index: number) {
    const value = topicValue.trim();
    if (value) onUpdate({ topics: subject.topics.map((topic, current) => current === index ? value : topic) });
    setEditingTopic(null);
  }

  return (
    <article className="subject-card">
      <header className="subject-card__header">
        <div className="subject-initial subject-initial--large">{subject.name.slice(0, 2).toUpperCase()}</div>
        <div className="subject-card__title">
          {editingName ? (
            <div className="inline-edit">
              <input autoFocus onChange={(event) => setName(event.target.value)} value={name} />
              <button aria-label="Salvar nome" onClick={saveName} type="button"><Check size={16} /></button>
              <button aria-label="Cancelar edição" onClick={() => { setName(subject.name); setEditingName(false); }} type="button"><X size={16} /></button>
            </div>
          ) : <><h2>{subject.name}</h2><span>{subject.topics.length} {subject.topics.length === 1 ? "assunto" : "assuntos"}</span></>}
        </div>
        <div className="subject-card__actions">
          <button aria-label="Editar matéria" className="icon-button" onClick={() => setEditingName(true)} type="button"><Edit3 size={16} /></button>
          <button aria-label="Excluir matéria" className="icon-button icon-button--danger" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={16} /></button>
        </div>
      </header>

      {confirmDelete ? (
        <div className="subject-delete-confirm">
          <span>Excluir matéria e seus assuntos?</span>
          <button onClick={() => setConfirmDelete(false)} type="button">Cancelar</button>
          <button onClick={onDelete} type="button">Excluir</button>
        </div>
      ) : null}

      <div className="topic-list">
        {subject.topics.map((topic, index) => (
          <div className="topic-row" key={`${topic}-${index}`}>
            <span className="topic-bullet" />
            {editingTopic === index ? (
              <div className="inline-edit inline-edit--topic">
                <input autoFocus onChange={(event) => setTopicValue(event.target.value)} value={topicValue} />
                <button aria-label="Salvar assunto" onClick={() => saveTopic(index)} type="button"><Check size={15} /></button>
                <button aria-label="Cancelar" onClick={() => setEditingTopic(null)} type="button"><X size={15} /></button>
              </div>
            ) : <span>{topic}</span>}
            {editingTopic !== index ? (
              <div className="topic-actions">
                <button aria-label={`Editar ${topic}`} onClick={() => { setEditingTopic(index); setTopicValue(topic); }} type="button"><Edit3 size={14} /></button>
                <button aria-label={`Excluir ${topic}`} onClick={() => onUpdate({ topics: subject.topics.filter((_, current) => current !== index) })} type="button"><Trash2 size={14} /></button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form className="add-topic-form" onSubmit={addTopic}>
        <Plus size={15} />
        <input aria-label="Novo assunto" onChange={(event) => setNewTopic(event.target.value)} placeholder="Adicionar assunto" value={newTopic} />
        <button disabled={!newTopic.trim()} type="submit">Adicionar</button>
      </form>
    </article>
  );
}

export function SubjectsPage({ onAddSubject, onDeleteSubject, onUpdateSubject, subjects }: SubjectsPageProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onAddSubject(name.trim());
    setName("");
    setAdding(false);
  }

  return (
    <div className="standard-page subjects-page">
      <PageHeading
        action={<button className="button button--primary" onClick={() => setAdding(true)} type="button"><Plus size={17} /> Nova matéria</button>}
        description="Organize os conteúdos usados no seu calendário."
        eyebrow="Biblioteca"
        title="Matérias"
      />

      {adding ? (
        <form className="new-subject-form" onSubmit={handleAdd}>
          <div><strong>Adicionar matéria</strong><span>Você poderá incluir os assuntos em seguida.</span></div>
          <input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Nome da matéria" value={name} />
          <button className="button button--ghost" onClick={() => setAdding(false)} type="button">Cancelar</button>
          <button className="button button--primary" type="submit">Adicionar</button>
        </form>
      ) : null}

      <section className="subjects-grid">
        {subjects.map((subject) => (
          <SubjectRow
            key={subject.id}
            onDelete={() => onDeleteSubject(subject.id)}
            onUpdate={(updates) => onUpdateSubject(subject.id, updates)}
            subject={subject}
          />
        ))}
      </section>
    </div>
  );
}
