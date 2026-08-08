import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Hoje" };

export default async function TodayRoute() {
  await requirePageUser();
  return <StudyFlowApp view="today" />;
}
