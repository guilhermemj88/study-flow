import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Matérias" };

export default async function SubjectsRoute() {
  await requirePageUser();
  return <StudyFlowApp view="subjects" />;
}
