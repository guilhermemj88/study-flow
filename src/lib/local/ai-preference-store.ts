import { getDatabase, nowIso } from "@/lib/local/database";
import type { AiMode } from "@/types/ai-integration";

export function getAiPreference(userId: string) {
  const row = getDatabase().prepare("SELECT mode, allow_external_ai_processing FROM user_ai_preferences WHERE user_id = ?")
    .get(userId) as { mode: AiMode; allow_external_ai_processing: number } | undefined;
  return { mode: row?.mode, allowExternalAiProcessing: Boolean(row?.allow_external_ai_processing) };
}

export function saveAiMode(userId: string, mode: AiMode) {
  getDatabase().prepare(`INSERT INTO user_ai_preferences (user_id, mode, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`)
    .run(userId, mode, nowIso());
}

export function saveAiPrivacy(userId: string, allowed: boolean) {
  getDatabase().prepare(`INSERT INTO user_ai_preferences (user_id, mode, allow_external_ai_processing, updated_at)
    VALUES (?, 'study_flow', ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    allow_external_ai_processing = excluded.allow_external_ai_processing, updated_at = excluded.updated_at`)
    .run(userId, Number(allowed), nowIso());
}
