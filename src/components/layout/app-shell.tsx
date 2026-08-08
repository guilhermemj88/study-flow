"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Layers3,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { label: "Hoje", href: "/hoje", icon: Clock3 },
  { label: "Calendário", href: "/", icon: CalendarDays },
  { label: "Desempenho", href: "/desempenho", icon: ChartNoAxesCombined },
  { label: "Matérias", href: "/materias", icon: Layers3 },
  { label: "Configurações", href: "/configuracoes", icon: Settings2 },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Study Flow — ir ao calendário">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span>Study Flow</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <span className="nav-eyebrow">Planejamento</span>
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
            <strong>Dados locais</strong>
            <small>Sincronização automática</small>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Link className="brand" href="/">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>Study Flow</span>
        </Link>
        <span className="local-badge"><span className="status-dot" /> Local</span>
      </div>

      <main className="main-content">{children}</main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
