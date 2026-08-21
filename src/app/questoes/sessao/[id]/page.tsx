import type { Metadata } from "next";
import { ExerciseSessionPage } from "@/components/questions/exercise-session-page";
import { requirePageUser } from "@/lib/auth/server-session";
import { requireAdvancedStudyMode } from "@/lib/study-methods/server";

export const metadata: Metadata = { title: "Sessão de exercícios" };

export default async function ExerciseSessionRoute({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  requireAdvancedStudyMode(user.id);
  const { id } = await params;
  return <ExerciseSessionPage sessionId={id} />;
}
