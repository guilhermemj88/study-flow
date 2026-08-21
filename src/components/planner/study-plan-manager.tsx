"use client";

import { useRef, useState, type FormEvent } from "react";
import { Archive, CalendarClock, Check, ChevronDown, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { getStudyMethod } from "@/lib/study-methods";
import type { StudyPlan } from "@/types/activity";
import { Modal } from "@/components/ui/modal";

type Confirmation = { kind: "archive" | "delete"; plan: StudyPlan } | { kind: "rename"; plan: StudyPlan };

interface StudyPlanManagerProps {
  activePlan?: StudyPlan;
  plans: StudyPlan[];
  onActivate: (id: string) => Promise<void> | void;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onListArchived: () => Promise<StudyPlan[]>;
  onRename: (id: string, name: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
}

function archivedDate(value?: string) {
  if (!value) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

export function StudyPlanManager({ activePlan, plans, onActivate, onArchive, onDelete, onListArchived, onRename, onRestore }: StudyPlanManagerProps) {
  const managerRef = useRef<HTMLDetailsElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedPlans, setArchivedPlans] = useState<StudyPlan[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function closeManager() {
    managerRef.current?.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
    managerRef.current?.removeAttribute("open");
  }

  function openRename(plan: StudyPlan) {
    closeManager();
    setError("");
    setRenameValue(plan.name);
    setConfirmation({ kind: "rename", plan });
  }

  async function openArchived() {
    closeManager();
    setArchivedOpen(true);
    setLoadingArchived(true);
    setError("");
    try {
      setArchivedPlans(await onListArchived());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar os calendários arquivados.");
    } finally {
      setLoadingArchived(false);
    }
  }

  async function activate(plan: StudyPlan) {
    setBusyId(plan.id);
    setError("");
    try {
      await onActivate(plan.id);
      closeManager();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível ativar o calendário.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation || confirmation.kind !== "rename" || !renameValue.trim()) return;
    setBusyId(confirmation.plan.id);
    setError("");
    try {
      await onRename(confirmation.plan.id, renameValue.trim());
      setConfirmation(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível renomear o calendário.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmLifecycle() {
    if (!confirmation || confirmation.kind === "rename") return;
    setBusyId(confirmation.plan.id);
    setError("");
    try {
      if (confirmation.kind === "archive") await onArchive(confirmation.plan.id);
      else await onDelete(confirmation.plan.id);
      setConfirmation(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível atualizar o calendário.");
    } finally {
      setBusyId(null);
    }
  }

  async function restore(plan: StudyPlan) {
    setBusyId(plan.id);
    setError("");
    try {
      await onRestore(plan.id);
      setArchivedPlans((current) => current.filter((item) => item.id !== plan.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível restaurar o calendário.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <details className="calendar-plan-manager" ref={managerRef}>
        <summary aria-label="Selecionar ou gerenciar calendários">
          <span>
            <strong>{activePlan?.name ?? "Calendário"}</strong>
            <small>{activePlan ? getStudyMethod(activePlan.studyMode).label : "Nenhum ativo"}</small>
          </span>
          <ChevronDown size={15} />
        </summary>
        <div className="calendar-plan-popover">
          <div className="calendar-plan-list">
            {plans.map((plan) => (
              <div className={`calendar-plan-row ${plan.active ? "calendar-plan-row--active" : ""}`} key={plan.id}>
                <button disabled={plan.active || busyId === plan.id} onClick={() => void activate(plan)} type="button">
                  <span>
                    <strong>{plan.name}</strong>
                    <small>{getStudyMethod(plan.studyMode).label}</small>
                  </span>
                  {plan.active ? <Check aria-label="Ativo" size={15} /> : null}
                </button>
                <details className="calendar-plan-actions">
                  <summary aria-label={`Ações de ${plan.name}`}><MoreHorizontal size={17} /></summary>
                  <div>
                    <button onClick={() => openRename(plan)} type="button"><Pencil size={14} /> Renomear</button>
                    <button onClick={() => { closeManager(); setError(""); setConfirmation({ kind: "archive", plan }); }} type="button"><Archive size={14} /> Arquivar</button>
                    <button className="calendar-plan-action--danger" onClick={() => { closeManager(); setError(""); setConfirmation({ kind: "delete", plan }); }} type="button"><Trash2 size={14} /> Excluir</button>
                  </div>
                </details>
              </div>
            ))}
          </div>
          {error ? <p className="calendar-plan-popover__error" role="alert">{error}</p> : null}
          <button className="calendar-archived-link" onClick={() => void openArchived()} type="button"><CalendarClock size={14} /> Calendários arquivados</button>
        </div>
      </details>

      {confirmation?.kind === "rename" ? (
        <Modal description="O método e as configurações deste calendário serão mantidos." onClose={() => setConfirmation(null)} open title="Renomear calendário">
          <form className="plan-lifecycle-form" onSubmit={submitRename}>
            <label className="field"><span>Nome do calendário</span><input autoFocus onChange={(event) => setRenameValue(event.target.value)} required value={renameValue} /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <footer className="form-footer">
              <button className="button button--ghost" onClick={() => setConfirmation(null)} type="button">Cancelar</button>
              <button className="button button--primary" disabled={busyId === confirmation.plan.id || !renameValue.trim()} type="submit">{busyId ? "Salvando…" : "Salvar nome"}</button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {confirmation?.kind === "archive" ? (
        <Modal description="As atividades e todo o histórico continuarão preservados." onClose={() => setConfirmation(null)} open title="Arquivar calendário?">
          <div className="plan-confirmation">
            <p><strong>{confirmation.plan.name}</strong> deixará o seletor principal e poderá ser restaurado depois.</p>
            {confirmation.plan.active ? <p>Outro calendário disponível será ativado automaticamente.</p> : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <footer className="form-footer">
              <button className="button button--ghost" onClick={() => setConfirmation(null)} type="button">Cancelar</button>
              <button className="button button--ghost" disabled={busyId === confirmation.plan.id} onClick={() => void confirmLifecycle()} type="button"><Archive size={16} /> {busyId ? "Arquivando…" : "Arquivar"}</button>
            </footer>
          </div>
        </Modal>
      ) : null}

      {confirmation?.kind === "delete" ? (
        <Modal description="Esta ação não poderá ser desfeita." onClose={() => setConfirmation(null)} open title="Excluir calendário?">
          <div className="plan-confirmation">
            <p>Esta ação removerá <strong>{confirmation.plan.name}</strong> da sua lista.</p>
            <p>Atividades concluídas e históricos importantes serão preservados quando necessário.</p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <footer className="form-footer">
              <button className="button button--ghost" onClick={() => setConfirmation(null)} type="button">Cancelar</button>
              <button className="button button--danger" disabled={busyId === confirmation.plan.id} onClick={() => void confirmLifecycle()} type="button"><Trash2 size={16} /> {busyId ? "Excluindo…" : "Excluir calendário"}</button>
            </footer>
          </div>
        </Modal>
      ) : null}

      <Modal description="Restaure um calendário para que ele volte ao seletor principal." onClose={() => setArchivedOpen(false)} open={archivedOpen} title="Calendários arquivados">
        <div className="archived-plan-panel">
          {loadingArchived ? <p className="archived-plan-empty">Carregando…</p> : null}
          {!loadingArchived && !archivedPlans.length ? <p className="archived-plan-empty">Nenhum calendário arquivado.</p> : null}
          {archivedPlans.map((plan) => (
            <div className="archived-plan-row" key={plan.id}>
              <div><strong>{plan.name}</strong><span>{getStudyMethod(plan.studyMode).label} · arquivado em {archivedDate(plan.archivedAt)}</span></div>
              <button className="button button--ghost button--small" disabled={busyId === plan.id} onClick={() => void restore(plan)} type="button"><RotateCcw size={14} /> {busyId === plan.id ? "Restaurando…" : "Restaurar"}</button>
            </div>
          ))}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer className="form-footer"><button className="button button--ghost" onClick={() => setArchivedOpen(false)} type="button">Fechar</button></footer>
        </div>
      </Modal>
    </>
  );
}
