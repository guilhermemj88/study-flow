"use client";

import { useState } from "react";
import { RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import type { AiAvailability, ReviewAdvice } from "@/types/ai";

interface Props {
  availability: AiAvailability;
  allowExternalAiProcessing: boolean;
  saving: boolean;
  onPrivacyChange: (allowed: boolean) => void;
}

export function StudyFlowAiPanel({ availability, allowExternalAiProcessing, saving, onPrivacyChange }: Props) {
  const [busy, setBusy] = useState<"test" | "review-recommendations" | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [advice, setAdvice] = useState<ReviewAdvice | null>(null);

  async function run(action: "test" | "review-recommendations") {
    setBusy(action);
    setFeedback(null);
    if (action === "review-recommendations") setAdvice(null);
    try {
      const response = await fetch(`/api/ai/${action}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      if (response.status === 401) window.location.replace("/login");
      const payload = await response.json() as { error?: string; result?: ReviewAdvice };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir a tarefa. Tente novamente.");
      if (action === "review-recommendations") setAdvice(payload.result ?? null);
      setFeedback({ text: action === "test" ? "Disponibilidade confirmada: o serviço respondeu corretamente ao teste." : "Sugestões prontas para você avaliar." });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Não foi possível acessar a IA agora.", error: true });
    } finally { setBusy(null); }
  }

  return (
    <section className="ai-panel" aria-labelledby="study-flow-ai-heading">
      <header className="ai-panel-heading">
        <div><h2 id="study-flow-ai-heading">IA do Study Flow</h2><p>{availability.available ? "Disponível · configurada nesta instalação" : "Indisponível no momento."}</p></div>
        <span className="ai-badge"><Sparkles size={14} /> {availability.providerLabel}</span>
      </header>
      {availability.model ? <p>Modelo: <strong>{availability.model}</strong></p> : null}
      <p>A IA executa tarefas específicas quando você solicita. A conexão com o serviço é feita pelo Study Flow.</p>
      <button className="button button--ghost" disabled={!availability.available || Boolean(busy) || saving} onClick={() => void run("test")} type="button"><RefreshCw size={16} /> {busy === "test" ? "Testando…" : "Testar disponibilidade"}</button>
      <p className="ai-help">O teste faz uma chamada curta ao serviço, sem enviar materiais. A disponibilidade real é confirmada pela resposta ao teste.</p>
      {feedback ? <p className={`ai-feedback ${feedback.error ? "ai-feedback--error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
      <div className="ai-privacy">
        <h3><ShieldCheck size={17} /> Privacidade dos materiais</h3>
        <label><input checked={allowExternalAiProcessing} disabled={saving || Boolean(busy)} onChange={(event) => onPrivacyChange(event.target.checked)} type="checkbox" /><span>Permitir que a IA do Study Flow processe trechos necessários dos meus materiais em serviços externos.</span></label>
        <p>Essa permissão começa desativada. Arquivos originais não são enviados automaticamente; tarefas documentais utilizam apenas trechos de texto preparados localmente.</p>
        <p>Recomendações de revisão utilizam dados estruturados como matéria, tema, datas e resultados de estudo, separadamente dessa permissão. Ela se aplica à IA do Study Flow; os acessos da sua IA via MCP seguem as autorizações OAuth.</p>
      </div>
      <div className="ai-review-task">
        <h3>Recomendações de revisão</h3>
        <p>Receba sugestões para os temas cadastrados no calendário ativo. Você decide como usá-las no seu planejamento.</p>
        <button className="button button--primary" disabled={!availability.available || Boolean(busy) || saving} onClick={() => void run("review-recommendations")} type="button"><Sparkles size={16} /> {busy === "review-recommendations" ? "Preparando sugestões…" : "Sugerir revisões"}</button>
        {advice ? <div className="ai-advice"><p>{advice.summary}</p>{advice.recommendations.length ? <ul>{advice.recommendations.map((item) => <li key={`${item.subject}:${item.topic}`}><strong>{item.subject} · {item.topic}</strong><p>{item.reason}</p><small>{item.minutes} minutos sugeridos</small></li>)}</ul> : null}</div> : null}
      </div>
    </section>
  );
}
