import { z } from "zod";
import { requireRequestUser } from "@/lib/auth/server-session";
import { getAiAvailability } from "@/lib/ai/config";
import { safeAiError } from "@/lib/ai/errors";
import { getAiReviewRecommendations, testAiAvailability } from "@/lib/ai/tasks";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

function failure(error: unknown) {
  if (error instanceof Response) {
    error.headers.set("cache-control", "private, no-store");
    return error;
  }
  const safe = safeAiError(error);
  return json({ code: safe.code, error: safe.message }, safe.status);
}

export async function aiStatusRequest(request: Request) {
  try {
    requireRequestUser(request);
    return json(getAiAvailability());
  } catch (error) { return failure(error); }
}

export async function aiActionRequest(request: Request, action: "test" | "review-recommendations") {
  try {
    const user = requireRequestUser(request);
    const expectedOrigin = new URL(request.url);
    const host = request.headers.get("host");
    if (host) expectedOrigin.host = host;
    const origin = request.headers.get("origin");
    if ((origin && origin !== expectedOrigin.origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Origem da solicitação inválida." }, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "Envie uma solicitação JSON." }, 415);
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return json({ error: "Solicitação inválida." }, 413);
    if (!z.object({}).strict().safeParse(await request.json().catch(() => null)).success) return json({ error: "Esta tarefa não aceita prompts ou parâmetros adicionais." }, 400);
    const run = action === "test" ? await testAiAvailability(user.id) : await getAiReviewRecommendations(user.id);
    return json({ result: run.result, checkedAt: new Date().toISOString() });
  } catch (error) { return failure(error); }
}
