import "server-only";

import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/local/database";
import type { StudyMode } from "@/types/study-method";

export function getActiveStudyMode(userId: string): StudyMode {
  const plan = getDatabase().prepare("SELECT study_mode FROM study_plans WHERE user_id = ? AND active = 1 LIMIT 1")
    .get(userId) as { study_mode: StudyMode } | undefined;
  return plan?.study_mode ?? "advanced";
}

export function requireAdvancedStudyMode(userId: string) {
  if (getActiveStudyMode(userId) !== "advanced") redirect("/calendario");
}
