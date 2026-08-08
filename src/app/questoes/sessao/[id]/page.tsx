import type { Metadata } from "next";
import { ExerciseSessionPage } from "@/components/questions/exercise-session-page";

export const metadata: Metadata = { title: "Sessão de exercícios" };

export default async function ExerciseSessionRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExerciseSessionPage sessionId={id} />;
}
