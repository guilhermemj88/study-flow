"use client";

import { useEffect, useState } from "react";
import { CalendarRange, FileCheck2, Layers3, LoaderCircle, Sparkles } from "lucide-react";
import { getStudyRepository } from "@/lib/data/study-repository";
import type { PlanMutationResult, StudyPlanPreview } from "@/types/planner";
import { Modal } from "@/components/ui/modal";

interface StudyPlanModalProps {
  initialPreview?: StudyPlanPreview | null;
  onApplied: (result: PlanMutationResult) => Promise<void> | void;
  onClose: () => void;
  open: boolean;
}

export function StudyPlanModal({ initialPreview, onApplied, onClose, open }: StudyPlanModalProps) {
  const [preview, setPreview] = useState<StudyPlanPreview | null>(initialPreview ?? null);
  const [loading, setLoading] = useState(!initialPreview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topIncidence = preview ? [...preview.priorities].sort((a, b) => b.incidenceWeight - a.incidenceWeight).slice(0, 4) : [];

  useEffect(() => {
    if (!open) return;
    getStudyRepository().previewStudyPlan().then((value) => { setPreview(value); setError(null); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Não foi possível calcular a prévia.")).finally(() => setLoading(false));
  }, [open]);

  async function apply() {
    if (!preview?.activityCount) return;
    setSaving(true); setError(null);
    try {
      const result = preview.hasGeneratedPlan
        ? await getStudyRepository().recalculateFuturePlan(preview.startDate)
        : await getStudyRepository().generateStudyPlan(preview.startDate);
      await onApplied(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o plano.");
    } finally { setSaving(false); }
  }

  return (
    <Modal description="O plano-base usa a incidência; desempenho só entra quando houver histórico de exercícios." onClose={onClose} open={open} size="large" title={preview?.hasGeneratedPlan ? "Recalcular plano de estudos" : "Gerar plano de estudos"}>
      {loading ? <div className="planner-modal-loading"><LoaderCircle className="spin" size={24} /> Calculando distribuição…</div> : preview ? <div className="planner-preview">
        {preview.incidenceChanged ? <div className="planner-incidence-notice"><Sparkles size={16} /><span><strong>Novos dados de incidência disponíveis.</strong> Revise a prévia antes de recalcular.</span></div> : null}
        <div className="planner-preview__metrics">
          <div><FileCheck2 size={17} /><strong>{preview.sourceCount}</strong><span>fontes consideradas</span></div>
          <div><strong>{preview.analyzedQuestionCount}</strong><span>questões analisadas</span></div>
          <div><Layers3 size={17} /><strong>{preview.subjectCount}</strong><span>matérias</span></div>
          <div><strong>{preview.topicCount}</strong><span>temas</span></div>
          <div><CalendarRange size={17} /><strong>{Math.round(preview.totalMinutes / 60)}h</strong><span>carga prevista</span></div>
          <div><strong>{preview.activityCount}</strong><span>atividades</span></div>
        </div>
        <div className="planner-period"><span>Período</span><strong>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${preview.startDate}T12:00:00`))} até {new Intl.DateTimeFormat("pt-BR").format(new Date(`${preview.endDate}T12:00:00`))}</strong></div>
        <div className="planner-priority-preview"><span>Top temas por incidência</span>{topIncidence.map((item) => <div key={`${item.subjectId}-${item.topicId}-${item.subtopic}`}><strong>{item.subtopic || item.topic}</strong><small>{item.subject} · {(item.incidenceWeight * 100).toFixed(1)}%</small></div>)}</div>
        {!preview.sourceCount ? <p className="form-error">Selecione ao menos uma fonte com incidência persistida antes de gerar.</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="form-footer"><button className="button button--ghost" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={saving || !preview.activityCount} onClick={() => void apply()} type="button"><Sparkles size={16} />{saving ? "Aplicando…" : preview.hasGeneratedPlan ? "Recalcular plano" : "Gerar plano"}</button></footer>
      </div> : <div className="planner-modal-loading">{error ?? "Prévia indisponível."}</div>}
    </Modal>
  );
}
