import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsRoute() {
  return <StudyFlowApp view="settings" />;
}
