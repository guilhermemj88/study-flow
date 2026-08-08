"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, Check, Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useSourceLibrary } from "@/hooks/use-source-library";
import type { SourceDraft, SourceType, StudySource } from "@/types/source";
import { SourceFormModal } from "@/components/sources/source-form-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { PageHeading } from "@/components/ui/page-heading";

const typeLabels: Record<SourceType, string> = { exam: "Prova", edital: "Edital", other: "Outro" };
const statusLabels: Record<StudySource["analysisStatus"], string> = { pending: "Análise pendente", analyzed: "Analisada", error: "Erro na análise", manual: "Cadastro manual" };

function formatSize(bytes?: number) {
  if (bytes === undefined) return "Sem arquivo";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SourcesPage() {
  const library = useSourceLibrary();
  const [formSource, setFormSource] = useState<StudySource | "new" | null>(null);
  const [deleteSource, setDeleteSource] = useState<StudySource | null>(null);

  if (!library.isReady) return <LoadingScreen />;
  const activeCount = library.sources.filter((source) => source.planSelection?.useForIncidence || source.planSelection?.useForQuestions).length;
  const incidenceCount = library.sources.filter((source) => source.planSelection?.useForIncidence).length;
  const questionBase = library.sources.filter((source) => source.planSelection?.useForQuestions).reduce((sum, source) => sum + source.questionCount, 0);

  async function saveSource(draft: SourceDraft, file?: File) {
    if (formSource && formSource !== "new") await library.updateSource(formSource.id, draft);
    else await library.createSource(draft, file);
  }

  return (
    <div className="standard-page sources-page">
      <PageHeading action={<button className="button button--primary" onClick={() => setFormSource("new")} type="button"><Plus size={17} /> Adicionar fonte</button>} description="Provas, editais e materiais que alimentam seu plano." eyebrow="Biblioteca oficial" title="Provas e fontes" />
      {library.error ? <div className="page-error">{library.error}</div> : null}

      <section className="plan-sources-panel">
        <div className="plan-sources-panel__heading">
          <div><span className="settings-icon"><BookOpenCheck size={18} /></span><div><h2>Fontes do plano</h2><p>{library.activePlan?.name ?? "Plano ativo"} · {activeCount} ativas</p></div></div>
          <div><button onClick={() => void library.setAllPlanSources(true)} type="button">Selecionar todas</button><button onClick={() => void library.setAllPlanSources(false)} type="button">Limpar seleção</button></div>
        </div>
        <div className="plan-source-list">
          {library.sources.map((source) => {
            const selection = source.planSelection ?? { useForIncidence: false, useForQuestions: false };
            return (
              <div className="plan-source-row" key={source.id}>
                <div><strong>{source.name}</strong><span>{typeLabels[source.sourceType]}{source.year ? ` · ${source.year}` : ""}</span></div>
                <label><input checked={selection.useForIncidence} onChange={(event) => void library.setPlanSelection(source.id, { useForIncidence: event.target.checked, useForQuestions: selection.useForQuestions })} type="checkbox" /><span><Check size={13} /> Incidência</span></label>
                <label><input checked={selection.useForQuestions} onChange={(event) => void library.setPlanSelection(source.id, { useForIncidence: selection.useForIncidence, useForQuestions: event.target.checked })} type="checkbox" /><span><Check size={13} /> Questões</span></label>
              </div>
            );
          })}
        </div>
        <footer>Base atual: <strong>{incidenceCount} {incidenceCount === 1 ? "fonte" : "fontes"}</strong> para incidência · <strong>{questionBase} questões</strong> disponíveis</footer>
      </section>

      <section className="source-library">
        <div className="source-library__heading"><h2>Biblioteca</h2><span>{library.sources.length} {library.sources.length === 1 ? "fonte cadastrada" : "fontes cadastradas"}</span></div>
        {library.sources.length ? <div className="source-list">{library.sources.map((source) => (
          <article className="source-row" key={source.id}>
            <span className={`source-icon source-icon--${source.sourceType}`}><FileText size={19} /></span>
            <div className="source-main"><Link href={`/provas/${source.id}`}>{source.name}</Link><span>{typeLabels[source.sourceType]} · {source.institution || "Instituição não informada"}{source.year ? ` · ${source.year}` : ""} · incluída em {new Date(source.createdAt).toLocaleDateString("pt-BR")}</span></div>
            <div className="source-meta"><strong>{source.questionCount}</strong><span>questões</span></div>
            <div className="source-meta"><strong>{formatSize(source.fileSize)}</strong><span>{source.mimeType === "application/pdf" ? "PDF" : source.mimeType ? "Imagem" : "Manual"}</span></div>
            <span className={`analysis-badge analysis-${source.analysisStatus}`}>{statusLabels[source.analysisStatus]}</span>
            <div className="source-actions">
              {source.storagePath ? <button aria-label="Abrir arquivo" className="icon-button" onClick={() => void library.openSource(source)} type="button"><Download size={16} /></button> : null}
              <button aria-label="Editar fonte" className="icon-button" onClick={() => setFormSource(source)} type="button"><Pencil size={15} /></button>
              <button aria-label="Remover fonte" className="icon-button icon-button--danger" onClick={() => setDeleteSource(source)} type="button"><Trash2 size={15} /></button>
            </div>
          </article>
        ))}</div> : <EmptyState title="Nenhuma fonte cadastrada" description="Adicione uma prova, edital ou fonte manual para começar." />}
      </section>

      {formSource ? <SourceFormModal key={formSource === "new" ? "new" : formSource.id} onClose={() => setFormSource(null)} onSubmit={saveSource} source={formSource === "new" ? undefined : formSource} /> : null}
      {deleteSource ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDeleteSource(null)}><section className="confirm-dialog" onMouseDown={(event) => event.stopPropagation()}><Trash2 size={22} /><h2>Remover {deleteSource.name}?</h2><p>Questões, incidências e o arquivo privado desta fonte também serão removidos.</p><div><button className="button button--ghost" onClick={() => setDeleteSource(null)} type="button">Cancelar</button><button className="button button--danger" onClick={() => { void library.removeSource(deleteSource).then(() => setDeleteSource(null)); }} type="button">Remover</button></div></section></div>
      ) : null}
    </div>
  );
}
