import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ChatGptPromptsPage } from "@/components/chatgpt/chatgpt-prompts-page";
import { requirePageUser } from "@/lib/auth/server-session";

export const metadata: Metadata = { title: "Usar com ChatGPT" };

export default async function ChatGptPage() {
  await requirePageUser();
  return <AppShell><ChatGptPromptsPage /></AppShell>;
}
