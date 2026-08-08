"use client";

import { Database, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

interface SettingsPageProps {
  activityCount: number;
  subjectCount: number;
  email?: string;
  planName?: string;
  onLogout: () => Promise<void> | void;
}

export function SettingsPage({ activityCount, subjectCount, email, planName, onLogout }: SettingsPageProps) {
  return (
    <div className="standard-page settings-page">
      <PageHeading description="Conta, privacidade e dados sincronizados do Study Flow." eyebrow="Aplicativo" title="Configurações" />

      <section className="settings-panel">
        <div className="settings-row">
          <span className="settings-icon"><UserRound size={19} /></span>
          <div><strong>Conta</strong><p>{email ?? "Usuário autenticado"}</p></div>
          <span className="settings-state"><span className="status-dot" /> Conectada</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><Database size={19} /></span>
          <div><strong>{planName ?? "Plano ativo"}</strong><p>{activityCount} atividades e {subjectCount} matérias cadastradas.</p></div>
          <span className="local-badge">Supabase</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><ShieldCheck size={19} /></span>
          <div><strong>Dados privados</strong><p>O banco e os arquivos aplicam isolamento por usuário com Row Level Security.</p></div>
          <span className="settings-state">Protegido</span>
        </div>
      </section>

      <section className="danger-zone">
        <div><span className="settings-icon settings-icon--warning"><LogOut size={19} /></span><div><strong>Encerrar sessão</strong><p>Seus dados permanecem salvos para o próximo acesso.</p></div></div>
        <button className="button button--ghost" onClick={() => void onLogout()} type="button"><LogOut size={16} /> Sair</button>
      </section>
    </div>
  );
}
