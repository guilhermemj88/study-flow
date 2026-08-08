"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  CircleHelp,
  Files,
  Layers3,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthUser } from "@/hooks/use-auth-user";

const navItems = [
  { label: "Hoje", href: "/hoje", icon: Clock3 },
  { label: "Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Questões", href: "/questoes", icon: CircleHelp },
  { label: "Desempenho", href: "/desempenho", icon: ChartNoAxesCombined },
  { label: "Matérias", href: "/materias", icon: Layers3 },
  { label: "Provas", href: "/provas", icon: Files },
  { label: "Configurações", href: "/configuracoes", icon: Settings2 },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const user = useAuthUser();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/calendario" aria-label="Study Flow — ir ao calendário">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span>Study Flow</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <span className="nav-eyebrow">Planejamento</span>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href) || (item.href === "/calendario" && pathname === "/");
            const Icon = item.icon;
            return (
              <Link className={`nav-link ${active ? "nav-link--active" : ""}`} href={item.href} key={item.href}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <div>
            <strong>Sincronizado</strong>
            <small title={user?.email}>{user?.email ?? "Sessão segura"}</small>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Link className="brand" href="/calendario">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>Study Flow</span>
        </Link>
        <span className="local-badge"><span className="status-dot" /> Online</span>
      </div>

      <main className="main-content">{children}</main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href) || (item.href === "/calendario" && pathname === "/");
          const Icon = item.icon;
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={19} />
              <span>{item.label === "Configurações" ? "Ajustes" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
