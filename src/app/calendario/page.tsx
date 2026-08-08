import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Calendário" };

export default async function CalendarRoute() {
  await requirePageUser();
  return <StudyFlowApp view="calendar" />;
}
