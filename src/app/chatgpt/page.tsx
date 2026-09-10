import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ChatGptPromptsPage } from "@/components/chatgpt/chatgpt-prompts-page";
import { requirePageUser } from "@/lib/auth/server-session";
import { getActiveStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Compatibilidade / Prompts manuais" };

export default async function ChatGptPage() {
  const user = await requirePageUser();
  return <AppShell studyMode={getActiveStudyMode(user.id)}><ChatGptPromptsPage /></AppShell>;
}
