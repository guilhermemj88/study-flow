"use client";

import { useState } from "react";
import { Bot, Check, Copy, ExternalLink } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const prompts = [
  {
    title: "Analisar fontes",
    description: "Classificar provas e atualizar a incidência temática.",
    prompt: "Analise todas as minhas fontes cadastradas no Study Flow. Leia as provas e gabaritos correspondentes, classifique as questões por matéria, tema e subtema, salve as questões e atualize a incidência.",
  },
  {
    title: "Gerar plano",
    description: "Calcular a prévia antes de qualquer gravação.",
    prompt: "Consulte minha disponibilidade, data da prova, fontes, incidência e desempenho no Study Flow. Gere primeiro uma prévia do plano e explique a distribuição. Não grave o plano até eu confirmar.",
  },
  {
    title: "Recalcular plano",
    description: "Adaptar somente o futuro ao desempenho atual.",
    prompt: "Analise meu desempenho atual no Study Flow e recalcule somente minhas atividades futuras, preservando todas as atividades concluídas.",
  },
  {
    title: "Revisões",
    description: "Encontrar as revisões mais importantes dos próximos dias.",
    prompt: "Consulte meu desempenho e prioridades no Study Flow e recomende as revisões mais importantes para os próximos dias.",
  },
] as const;

export function ChatGptPromptsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(title: string, prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setCopied(title);
    window.setTimeout(() => setCopied((current) => current === title ? null : current), 1800);
  }

  return (
    <div className="standard-page chatgpt-prompts-page">
      <PageHeading description="Prompts prontos para usar a conexão MCP sem chamadas automáticas ou cobrança por token no Study Flow." eyebrow="Conexão sob seu controle" title="Usar com ChatGPT" />
      <section className="chatgpt-intro">
        <span><Bot size={24} /></span>
        <div><h2>Seus dados não são enviados automaticamente</h2><p>Para usar o ChatGPT, conecte o app Study Flow no ChatGPT e solicite a análise por lá. O Study Flow não chama a API da OpenAI.</p></div>
      </section>
      <section className="chatgpt-steps" aria-label="Como usar">
        {["Abra o ChatGPT", "Selecione ou ative Study Flow", "Cole um dos prompts", "Confirme gravações quando solicitado"].map((step, index) => <div key={step}><strong>{index + 1}</strong><span>{step}</span></div>)}
      </section>
      <section className="prompt-grid">
        {prompts.map((item) => <article className="prompt-card" key={item.title}><header><span>{item.title}</span><small>{item.description}</small></header><blockquote>{item.prompt}</blockquote><button className="button button--ghost" onClick={() => void copy(item.title, item.prompt)} type="button">{copied === item.title ? <Check size={16} /> : <Copy size={16} />}{copied === item.title ? "Copiado" : "Copiar prompt"}</button></article>)}
      </section>
      <p className="chatgpt-footnote"><ExternalLink size={14} /> A conversa e a escolha do modelo acontecem no ChatGPT; o Study Flow continua sendo apenas a fonte MCP/OAuth dos seus dados.</p>
    </div>
  );
}
