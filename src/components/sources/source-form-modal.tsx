"use client";

import { useState, type FormEvent } from "react";
import { FileUp, Save } from "lucide-react";
import type { SourceDraft, SourceType, StudySource } from "@/types/source";
import { Modal } from "@/components/ui/modal";

interface SourceFormModalProps {
  onClose: () => void;
  onSubmit: (draft: SourceDraft, file?: File) => Promise<void>;
  source?: StudySource;
}
const typeLabels: Record<SourceType, string> = { exam: "Prova", edital: "Edital", other: "Outro" };

export function SourceFormModal({ onClose, onSubmit, source }: SourceFormModalProps) {
  const [name, setName] = useState(source?.name ?? "");
  const [sourceType, setSourceType] = useState<SourceType>(source?.sourceType ?? "exam");
  const [institution, setInstitution] = useState(source?.institution ?? "");
  const [year, setYear] = useState(source?.year?.toString() ?? "");
  const [edition, setEdition] = useState(source?.edition ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [isAnswerKey, setIsAnswerKey] = useState(source?.isAnswerKey ?? false);
  const [file, setFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: name.trim(),
        sourceType,
        institution: institution.trim() || undefined,
        year: year ? Number(year) : undefined,
        edition: edition.trim() || undefined,
        description: description.trim() || undefined,
        isAnswerKey,
      }, source ? undefined : file);
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a fonte.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal description={source ? "Atualize os dados descritivos desta fonte." : "Envie um arquivo ou faça apenas o cadastro manual."} onClose={onClose} open size="large" title={source ? "Editar fonte" : "Adicionar fonte"}>
      <form className="activity-form" onSubmit={handleSubmit}>
        {!source ? (
          <label className={`source-upload ${file ? "source-upload--selected" : ""}`}>
            <FileUp size={22} />
            <div><strong>{file?.name ?? "Escolher arquivo"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "PDF, JPG, PNG ou WEBP · máximo 20 MB · opcional"}</span></div>
            <input accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0])} type="file" />
          </label>
        ) : null}

        <div className="form-grid">
          <label className="field"><span>Nome</span><input autoFocus={!source} onChange={(event) => setName(event.target.value)} placeholder="Ex.: ENARE 2025" required value={name} /></label>
          <label className="field"><span>Tipo</span><select onChange={(event) => setSourceType(event.target.value as SourceType)} value={sourceType}>{(Object.keys(typeLabels) as SourceType[]).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
          <label className="field"><span>Instituição</span><input onChange={(event) => setInstitution(event.target.value)} placeholder="Ex.: Ebserh" value={institution} /></label>
          <label className="field"><span>Ano</span><input max="2200" min="1900" onChange={(event) => setYear(event.target.value)} placeholder="2025" type="number" value={year} /></label>
          <label className="field"><span>Edição</span><input onChange={(event) => setEdition(event.target.value)} placeholder="2024/2025" value={edition} /></label>
        </div>
        <label className="field"><span>Observação <em>opcional</em></span><textarea onChange={(event) => setDescription(event.target.value)} placeholder="Contexto útil sobre esta fonte." rows={3} value={description} /></label>
        <label className="source-kind-check"><input checked={isAnswerKey} onChange={(event) => setIsAnswerKey(event.target.checked)} type="checkbox" /><span><strong>Este arquivo é um gabarito</strong><small>Será usado apenas como referência oficial e não aumentará a amostra de incidência.</small></span></label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="form-footer">
          <button className="button button--ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" disabled={saving} type="submit"><Save size={16} />{saving ? "Salvando…" : source ? "Salvar alterações" : "Salvar fonte"}</button>
        </footer>
      </form>
    </Modal>
  );
}
