import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";

export const metadata: Metadata = { title: "Hoje" };

export default function TodayRoute() {
  return <StudyFlowApp view="today" />;
}
