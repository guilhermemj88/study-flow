import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";

export const metadata: Metadata = { title: "Calendário" };

export default function CalendarRoute() {
  return <StudyFlowApp view="calendar" />;
}
