"use client";

import { useState } from "react";
import { ShieldCheck, UserRoundCog } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import type { AdminUserSummary } from "@/lib/local/admin-store";
import type { UserRole } from "@/types/auth";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

export function AdminUsersPage({ initialUsers, currentAdminId }: { initialUsers: AdminUserSummary[]; currentAdminId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(user: AdminUserSummary, role: UserRole) {
    const verb = role === "admin" ? "promover a administrador" : "remover da administração";
    if (!window.confirm(`Deseja ${verb} ${user.displayName}?`)) return;
    setBusy(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json() as { user?: AdminUserSummary; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Não foi possível alterar o papel.");
      setUsers((current) => current.map((item) => item.id === data.user?.id ? data.user : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o papel.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="standard-page admin-page">
      <PageHeading eyebrow="Administração" title="Usuários" description="Papéis são aplicados no servidor; nenhuma conta é promovida automaticamente." />
      {error ? <div className="admin-feedback admin-feedback--error" role="alert"><ShieldCheck size={16} />{error}</div> : null}
      <section className="admin-panel">
        <header><div><h2>Contas locais</h2><p>O último administrador nunca pode ser rebaixado.</p></div><span className="admin-count">{users.length} usuários</span></header>
        <div className="admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Papel</th><th>Criado</th><th /></tr></thead><tbody>
            {users.map((user) => <tr key={user.id}>
              <td><strong>{user.displayName}</strong>{user.id === currentAdminId ? <small>Você</small> : null}</td>
              <td>{user.email}</td>
              <td><span className={`admin-role admin-role--${user.role}`}>{user.role === "admin" ? <ShieldCheck size={13} /> : <UserRoundCog size={13} />}{user.role === "admin" ? "Administrador" : "Usuário"}</span></td>
              <td>{formatDate(user.createdAt)}</td>
              <td><button className="button button--ghost button--small" disabled={busy === user.id} onClick={() => void changeRole(user, user.role === "admin" ? "user" : "admin")} type="button">{user.role === "admin" ? "Rebaixar" : "Promover"}</button></td>
            </tr>)}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
