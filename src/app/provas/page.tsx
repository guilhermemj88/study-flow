import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SourcesPage } from "@/components/sources/sources-page";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Provas e fontes" };

export default async function SourcesRoute() {
  await requirePageUser();
  return <AppShell><SourcesPage /></AppShell>;
}
