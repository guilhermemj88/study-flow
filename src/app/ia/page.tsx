import type { Metadata } from "next";
import { AiIntegrationsPage } from "@/components/ai/ai-integrations-page";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageUser } from "@/lib/auth/server-session";
import { getAiIntegrationOverview } from "@/lib/local/ai-integration-store";

export const metadata: Metadata = { title: "IA / Integrações" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AiRoute() {
  const user = await requirePageUser();
  return <AppShell><AiIntegrationsPage initialOverview={getAiIntegrationOverview(user)} /></AppShell>;
}
