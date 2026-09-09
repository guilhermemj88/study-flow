"use client";

import Link from "next/link";
import { Cable, Database, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import type { UserRole } from "@/types/auth";
import { PlanSettingsPanel } from "@/components/planner/plan-settings-panel";

interface SettingsPageProps {
  activityCount: number;
  subjectCount: number;
  email?: string;
  planName?: string;
  role?: UserRole;
  onLogout: () => Promise<void> | void;
}

export function SettingsPage({ activityCount, subjectCount, email, planName, role, onLogout }: SettingsPageProps) {
  return (
    <div className="standard-page settings-page">
      <PageHeading description="Sua conta, preferências e integrações do Study Flow." eyebrow="Aplicativo" title="Configurações" />

      <section className="settings-panel">
        <div className="settings-row">
          <span className="settings-icon"><UserRound size={19} /></span>
          <div><strong>Conta</strong><p>{email ?? "Usuário autenticado"}</p></div>
          <span className="settings-state"><span className="status-dot" /> Conectada</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><Database size={19} /></span>
          <div><strong>{planName ?? "Plano ativo"}</strong><p>{activityCount} atividades e {subjectCount} matérias cadastradas.</p></div>
          <span className="local-badge">SQLite local</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><ShieldCheck size={19} /></span>
          <div><strong>Dados privados</strong><p>Banco e uploads permanecem neste computador, isolados pelo usuário autenticado.</p></div>
          <span className="settings-state">Protegido</span>
        </div>
        <Link className="settings-row settings-row--link" href="/ia">
          <span className="settings-icon"><Cable size={19} /></span>
          <div><strong>Conectar minha IA via MCP</strong><p>Escolha sua IA, copie a URL e conecte com sua própria conta.</p></div>
          <span className="settings-state">IA / Integrações</span>
        </Link>
        {role === "admin" ? (
          <Link className="settings-row settings-row--link" href="/admin/chatgpt">
            <span className="settings-icon"><Cable size={19} /></span>
            <div><strong>Administração do MCP</strong><p>Endpoints, diagnósticos e clientes da instalação.</p></div>
            <span className="settings-state">Configurar</span>
          </Link>
        ) : null}
      </section>

      <PlanSettingsPanel />

      <section className="danger-zone">
        <div><span className="settings-icon settings-icon--warning"><LogOut size={19} /></span><div><strong>Encerrar sessão</strong><p>Seus dados permanecem salvos para o próximo acesso.</p></div></div>
        <button className="button button--ghost" onClick={() => void onLogout()} type="button"><LogOut size={16} /> Sair</button>
      </section>
    </div>
  );
}
