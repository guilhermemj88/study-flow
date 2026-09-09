import { z } from "zod";
import { requireRequestUser } from "@/lib/auth/server-session";
import { disconnectMyMcp, getAiIntegrationOverview, setAiMode } from "@/lib/local/ai-integration-store";
import { getAiAvailability } from "@/lib/ai/config";
import { saveAiPrivacy } from "@/lib/local/ai-preference-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

function failure(error: unknown) {
  if (error instanceof Response) return error;
  return json({ error: "Não foi possível atualizar sua integração. Tente novamente." }, 500);
}

export async function GET(request: Request) {
  try {
    return json(getAiIntegrationOverview(requireRequestUser(request)));
  } catch (error) { return failure(error); }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_mode"), mode: z.enum(["study_flow", "mcp", "none"]) }).strict(),
  z.object({ action: z.literal("set_privacy"), allowExternalAiProcessing: z.boolean() }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
]);

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    const origin = request.headers.get("origin");
    // Next may normalize request.url to its internal hostname. Validate against
    // the host the browser actually requested, as with Next's Server Actions.
    const expectedOrigin = new URL(request.url);
    const host = request.headers.get("host");
    if (host) expectedOrigin.host = host;
    if ((origin && origin !== expectedOrigin.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ error: "Origem da solicitação inválida." }, 403);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return json({ error: "Envie uma solicitação JSON." }, 415);
    }
    const input = actionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return json({ error: "Opção de integração inválida." }, 400);
    if (input.data.action === "disconnect") disconnectMyMcp(user.id);
    else if (input.data.action === "set_privacy") {
      if (getAiIntegrationOverview(user).mode !== "study_flow") return json({ error: "Selecione IA do Study Flow para alterar esta permissão." }, 400);
      saveAiPrivacy(user.id, input.data.allowExternalAiProcessing);
    } else {
      if (input.data.mode === "study_flow" && !getAiAvailability().available) return json({ error: "IA do Study Flow indisponível no momento." }, 400);
      setAiMode(user.id, input.data.mode);
    }
    return json(getAiIntegrationOverview(user));
  } catch (error) { return failure(error); }
}
