import { runAiTask } from "@/lib/ai/gateway";
import { safeAiError } from "@/lib/ai/errors";
import { saveSourceSummary } from "@/lib/local/ai-run-store";

export function testAiAvailability(userId: string) {
  return runAiTask("HEALTH_CHECK", {}, { userId });
}

export function getAiReviewRecommendations(userId: string) {
  return runAiTask("REVIEW_RECOMMENDATIONS", {}, { userId });
}

// Backend service ready for an explicit source action. It has no public prompt API.
export async function summarizeSource(userId: string, sourceId: string, chunkIndexes?: number[]) {
  const run = await runAiTask("SUMMARIZE_SOURCE", { sourceId, chunkIndexes }, { userId });
  try { saveSourceSummary(userId, sourceId, run.runId, run.result); } catch (error) { throw safeAiError(error); }
  return run;
}
