import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Study Flow — Planejamento de estudos",
    template: "%s · Study Flow",
  },
  description: "Calendário de estudos simples, visual e adaptável ao seu ritmo.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0c0b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
