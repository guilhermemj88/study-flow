"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  CircleHelp,
  Files,
  Layers3,
  Settings2,
  ShieldCheck,
  ScrollText,
  UsersRound,
  Bot,
  Sparkles,
  LogOut,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { signOut } from "@/lib/auth/auth-service";
import { getStudyMethod } from "@/lib/study-methods";
import type { StudyMethodCapabilities, StudyMode } from "@/types/study-method";

const navItems: Array<{
  label: string;
  href: string;
  icon: typeof CalendarDays;
  capability?: keyof StudyMethodCapabilities;
}> = [
  { label: "Hoje", href: "/hoje", icon: Clock3 },
  { label: "Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Questões", href: "/questoes", icon: CircleHelp, capability: "questions" },
  { label: "Desempenho", href: "/desempenho", icon: ChartNoAxesCombined, capability: "performance" },
  { label: "Matérias", href: "/materias", icon: Layers3 },
  { label: "Provas", href: "/provas", icon: Files, capability: "sources" },
  { label: "IA / Integrações", href: "/ia", icon: Bot },
  { label: "Configurações", href: "/configuracoes", icon: Settings2 },
];

const adminNavItems = [
  { label: "ChatGPT", href: "/admin/chatgpt", icon: Bot },
  { label: "Usuários", href: "/admin/users", icon: UsersRound },
  { label: "Logs MCP", href: "/admin/mcp-logs", icon: ScrollText },
];

interface AppShellProps {
  children: ReactNode;
  studyMode?: StudyMode;
}

export function AppShell({ children, studyMode }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const method = studyMode ? getStudyMethod(studyMode) : undefined;
  const visibleNavItems = navItems.filter((item) => !item.capability || method?.capabilities[item.capability] !== false);

  async function logout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/calendario" aria-label="Study Flow — ir ao calendário">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span>Study Flow</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <span className="nav-eyebrow">Planejamento</span>
          {visibleNavItems.map((item) => {
            const active = pathname.startsWith(item.href) || (item.href === "/calendario" && pathname === "/");
            const Icon = item.icon;
            return (
              <Link className={`nav-link ${active ? "nav-link--active" : ""}`} href={item.href} key={item.href}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {user?.role === "admin" ? (
            <>
              <span className="nav-eyebrow nav-eyebrow--admin"><ShieldCheck size={14} /> Administração</span>
              {adminNavItems.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link className={`nav-link ${active ? "nav-link--active" : ""}`} href={item.href} key={item.href}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <div>
            <strong>SQLite local</strong>
            <small title={user?.email}>{user?.email ?? "Sessão segura"}</small>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Link className="brand" href="/calendario">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>Study Flow</span>
        </Link>
        <span className="local-badge"><span className="status-dot" /> Local</span>
      </div>

      <main className="main-content">
        <header className="app-topbar">
          <span />
          <details className="user-menu">
            <summary><span className="user-menu__avatar"><UserRound size={16} /></span><span><strong>{user?.displayName ?? "Usuário"}</strong><small>{user?.email}</small></span></summary>
            <div className="user-menu__popover">
              <div><strong>{user?.displayName ?? "Usuário"}</strong><small>{user?.role === "admin" ? "Administrador" : "Conta pessoal"}</small></div>
              <Link href="/configuracoes"><Settings2 size={15} /> Configurações</Link>
              <button onClick={() => void logout()} type="button"><LogOut size={15} /> Sair</button>
            </div>
          </details>
        </header>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {visibleNavItems.map((item) => {
          const active = pathname.startsWith(item.href) || (item.href === "/calendario" && pathname === "/");
          const Icon = item.icon;
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={19} />
              <span>{item.label === "Configurações" ? "Ajustes" : item.label}</span>
            </Link>
          );
        })}
        {user?.role === "admin" ? (
          <Link className={pathname.startsWith("/admin") ? "active" : ""} href="/admin/chatgpt">
            <ShieldCheck size={19} />
            <span>Admin</span>
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
