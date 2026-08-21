import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SourcesPage } from "@/components/sources/sources-page";
import { requirePageUser } from "@/lib/auth/server-session";
import { requireAdvancedStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Provas e fontes" };

export default async function SourcesRoute() {
  const user = await requirePageUser();
  requireAdvancedStudyMode(user.id);
  return <AppShell studyMode="advanced"><SourcesPage /></AppShell>;
}
