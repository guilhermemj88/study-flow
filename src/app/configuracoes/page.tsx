import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsRoute() {
  await requirePageUser();
  return <StudyFlowApp view="settings" />;
}
