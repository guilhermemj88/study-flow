"use client";

import { useState } from "react";
import { Database, HardDrive, RotateCcw, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

interface SettingsPageProps {
  activityCount: number;
  onResetDemoData: () => void;
  subjectCount: number;
}

export function SettingsPage({ activityCount, onResetDemoData, subjectCount }: SettingsPageProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  function handleReset() {
    onResetDemoData();
    setConfirmReset(false);
    setResetDone(true);
  }

  return (
    <div className="standard-page settings-page">
      <PageHeading
        description="Preferências e dados desta versão do Study Flow."
        eyebrow="Aplicativo"
        title="Configurações"
      />

      <section className="settings-panel">
        <div className="settings-row">
          <span className="settings-icon"><HardDrive size={19} /></span>
          <div><strong>Armazenamento local</strong><p>Suas alterações ficam salvas apenas neste navegador.</p></div>
          <span className="settings-state"><span className="status-dot" /> Ativo</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><Database size={19} /></span>
          <div><strong>Dados atuais</strong><p>{activityCount} atividades e {subjectCount} matérias cadastradas.</p></div>
          <span className="local-badge">MVP</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><ShieldCheck size={19} /></span>
          <div><strong>Privacidade</strong><p>Nenhum dado é enviado para servidores externos nesta etapa.</p></div>
          <span className="settings-state">Somente local</span>
        </div>
      </section>

      <section className="danger-zone">
        <div>
          <span className="settings-icon settings-icon--warning"><RotateCcw size={19} /></span>
          <div><strong>Restaurar demonstração</strong><p>Substitui suas alterações pelos dados iniciais do calendário.</p></div>
        </div>
        {confirmReset ? (
          <div className="danger-zone__confirm">
            <span>As alterações locais serão apagadas.</span>
            <button className="button button--ghost button--small" onClick={() => setConfirmReset(false)} type="button">Cancelar</button>
            <button className="button button--danger button--small" onClick={handleReset} type="button">Restaurar</button>
          </div>
        ) : (
          <button className="button button--ghost" onClick={() => { setConfirmReset(true); setResetDone(false); }} type="button">Restaurar dados</button>
        )}
      </section>
      {resetDone ? <p className="success-message"><CheckCircleIcon /> Dados de demonstração restaurados.</p> : null}
    </div>
  );
}

function CheckCircleIcon() {
  return <span aria-hidden="true">✓</span>;
}
