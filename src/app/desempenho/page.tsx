import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";
import { requireAdvancedStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Desempenho" };

export default async function PerformanceRoute() {
  const user = await requirePageUser();
  requireAdvancedStudyMode(user.id);
  return <StudyFlowApp view="performance" />;
}
