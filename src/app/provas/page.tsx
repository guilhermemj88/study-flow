import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SourcesPage } from "@/components/sources/sources-page";

export const metadata: Metadata = { title: "Provas e fontes" };

export default function SourcesRoute() {
  return <AppShell><SourcesPage /></AppShell>;
}
