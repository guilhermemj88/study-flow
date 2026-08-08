import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SourceDetailPage } from "@/components/sources/source-detail-page";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Detalhes da fonte" };

export default async function SourceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser();
  const { id } = await params;
  return <AppShell><SourceDetailPage sourceId={id} /></AppShell>;
}
