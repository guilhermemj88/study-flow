import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SourceDetailPage } from "@/components/sources/source-detail-page";
import { requirePageUser } from "@/lib/auth/server-session";
import { requireAdvancedStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Detalhes da fonte" };

export default async function SourceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  requireAdvancedStudyMode(user.id);
  const { id } = await params;
  return <AppShell studyMode="advanced"><SourceDetailPage sourceId={id} /></AppShell>;
}
