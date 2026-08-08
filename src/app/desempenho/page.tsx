import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Desempenho" };

export default async function PerformanceRoute() {
  await requirePageUser();
  return <StudyFlowApp view="performance" />;
}
