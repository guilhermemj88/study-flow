import { AiError, type AiErrorCode } from "@/lib/ai/errors";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import type { AiUsage, SourceSummary } from "@/types/ai";

interface RunMetadata { userId: string; task: string; version: number; provider: string | null; model: string | null }

export function beginAiRun(metadata: RunMetadata, timeoutMs: number) {
  const database = getDatabase();
  return database.transaction(() => {
    const timestamp = nowIso();
    database.prepare(`UPDATE ai_runs SET status = 'failed', error_code = 'PROVIDER_TIMEOUT', finished_at = ?,
      duration_ms = MAX(0, CAST((julianday(?) - julianday(created_at)) * 86400000 AS INTEGER))
      WHERE user_id = ? AND status = 'running' AND deadline_at <= ?`).run(timestamp, timestamp, metadata.userId, timestamp);
    if (database.prepare("SELECT 1 FROM ai_runs WHERE user_id = ? AND status = 'running'").get(metadata.userId)) throw new AiError("RUN_IN_PROGRESS");
    const since = new Date(Date.now() - 60_000).toISOString();
    const recent = database.prepare("SELECT COUNT(*) AS total FROM ai_runs WHERE user_id = ? AND status != 'blocked' AND created_at > ?").get(metadata.userId, since) as { total: number };
    if (recent.total >= 10) throw new AiError("USER_RATE_LIMIT");
    const id = newId();
    database.prepare(`INSERT INTO ai_runs (id, user_id, task, task_version, provider, model, status, created_at, deadline_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`).run(id, metadata.userId, metadata.task, metadata.version, metadata.provider, metadata.model, timestamp, new Date(Date.now() + timeoutMs + 10_000).toISOString());
    return id;
  })();
}

export function recordBlockedAiRun(metadata: RunMetadata, code: AiErrorCode) {
  const timestamp = nowIso();
  getDatabase().prepare(`INSERT INTO ai_runs (id, user_id, task, task_version, provider, model, status, error_code, created_at, finished_at, deadline_at)
    VALUES (?, ?, ?, ?, ?, ?, 'blocked', ?, ?, ?, ?)`).run(newId(), metadata.userId, metadata.task, metadata.version, metadata.provider, metadata.model, code, timestamp, timestamp, timestamp);
}

export function finishAiRun(id: string, userId: string, input: { errorCode?: AiErrorCode; durationMs: number; externalProcessingUsed: boolean; usage?: AiUsage }) {
  getDatabase().prepare(`UPDATE ai_runs SET status = ?, input_tokens = ?, output_tokens = ?, total_tokens = ?,
    duration_ms = ?, external_processing_used = ?, error_code = ?, finished_at = ? WHERE id = ? AND user_id = ? AND status = 'running'`)
    .run(input.errorCode ? "failed" : "succeeded", input.usage?.inputTokens ?? null, input.usage?.outputTokens ?? null, input.usage?.totalTokens ?? null,
      Math.max(0, Math.round(input.durationMs)), Number(input.externalProcessingUsed), input.errorCode ?? null, nowIso(), id, userId);
}

export function saveSourceSummary(userId: string, sourceId: string, runId: string, output: SourceSummary) {
  getDatabase().prepare(`INSERT INTO ai_source_summaries (id, user_id, source_id, run_id, summary, key_points_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(newId(), userId, sourceId, runId, output.summary, JSON.stringify(output.keyPoints), nowIso());
}
