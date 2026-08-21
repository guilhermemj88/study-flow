import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { QuestionsPage } from "@/components/questions/questions-page";
import { requirePageUser } from "@/lib/auth/server-session";
import { requireAdvancedStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Questões" };

export default async function QuestionsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  requireAdvancedStudyMode(user.id);
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] : undefined;
  return <AppShell studyMode="advanced"><QuestionsPage activityId={value("activityId")} initialSubjectId={value("subjectId")} initialTopicId={value("topicId")} /></AppShell>;
}
