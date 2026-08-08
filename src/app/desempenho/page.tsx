import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";

export const metadata: Metadata = { title: "Desempenho" };

export default function PerformanceRoute() {
  return <StudyFlowApp view="performance" />;
}
