import { requireRequestUser } from "@/lib/auth/server-session";
import { LocalQuestionStore } from "@/lib/local/question-store";
import { LocalSourceStore } from "@/lib/local/source-store";
import { LocalStudyStore } from "@/lib/local/study-store";
import type { ActivityDraft, ActivityResult, StudyActivity, StudySubject } from "@/types/activity";
import type { QuestionDraft, QuestionFilters } from "@/types/question";
import type { SourceDraft } from "@/types/source";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function body<T>(request: Request) {
  return request.json() as Promise<T>;
}

function failure(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const conflict = /UNIQUE|em uso|constraint/i.test(message);
  return json({ error: conflict ? "O registro está duplicado ou ainda está em uso." : message }, conflict ? 409 : 400);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = requireRequestUser(request);
    const path = (await context.params).path;
    const study = new LocalStudyStore(user.id);
    const sources = new LocalSourceStore(user.id);
    const questions = new LocalQuestionStore(user.id);
    if (path[0] === "study" && path.length === 1) return json(study.load());
    if (path[0] === "sources" && path.length === 1) return json(sources.load());
    if (path[0] === "sources" && path[1] && path[2] === "file") {
      const file = sources.readFile(path[1]);
      return new Response(new Uint8Array(file.bytes), { headers: {
        "content-type": file.mimeType,
        "content-length": String(file.bytes.length),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "cache-control": "private, no-store",
      } });
    }
    if (path[0] === "questions" && path.length === 1) {
      const url = new URL(request.url);
      const rawFilters = url.searchParams.get("filters");
      const filters = rawFilters ? JSON.parse(rawFilters) as Partial<QuestionFilters> : undefined;
      return json(questions.load(filters, url.searchParams.get("active") !== "false"));
    }
    if (path[0] === "sessions" && path[1] && path.length === 2) return json(questions.getSession(path[1]));
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = requireRequestUser(request);
    const path = (await context.params).path;
    const study = new LocalStudyStore(user.id);
    const sources = new LocalSourceStore(user.id);
    const questions = new LocalQuestionStore(user.id);
    if (path[0] === "activities" && path.length === 1) return json(study.createActivity(await body<ActivityDraft>(request)), 201);
    if (path[0] === "activities" && path[1] && path[2] === "complete") {
      study.completeActivity(path[1], await body<ActivityResult>(request)); return new Response(null, { status: 204 });
    }
    if (path[0] === "subjects" && path.length === 1) {
      const input = await body<{ name: string }>(request); return json(study.createSubject(input.name), 201);
    }
    if (path[0] === "sources" && path.length === 1) {
      const form = await request.formData();
      const draft = JSON.parse(String(form.get("draft") ?? "{}")) as SourceDraft;
      const file = form.get("file");
      const upload = file instanceof File ? { name: file.name, type: file.type, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined;
      return json(sources.create(draft, upload), 201);
    }
    if (path[0] === "source-stats") {
      sources.saveTopicStat(await body<Parameters<LocalSourceStore["saveTopicStat"]>[0]>(request)); return new Response(null, { status: 204 });
    }
    if (path[0] === "questions" && path.length === 1) return json(questions.createQuestion(await body<QuestionDraft>(request)), 201);
    if (path[0] === "sessions" && path.length === 1) {
      const input = await body<{ questionIds: string[]; activityId?: string }>(request);
      return json(questions.createSession(input.questionIds, input.activityId), 201);
    }
    if (path[0] === "sessions" && path[1] && path[2] === "answer") {
      const input = await body<{ selectedAlternative: string }>(request); return json(questions.answer(path[1], input.selectedAlternative));
    }
    if (path[0] === "sessions" && path[1] && path[2] === "advance") {
      const input = await body<{ nextIndex: number }>(request); questions.advance(path[1], input.nextIndex); return new Response(null, { status: 204 });
    }
    if (path[0] === "sessions" && path[1] && path[2] === "complete") {
      questions.complete(path[1]); return new Response(null, { status: 204 });
    }
    if (path[0] === "session-error-reason") {
      const input = await body<{ sessionQuestionId: string; attemptId: string; errorReason: Parameters<LocalQuestionStore["setErrorReason"]>[2] }>(request);
      questions.setErrorReason(input.sessionQuestionId, input.attemptId, input.errorReason); return new Response(null, { status: 204 });
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = requireRequestUser(request); const path = (await context.params).path;
    if (path[0] === "activities" && path[1]) {
      new LocalStudyStore(user.id).updateActivity(path[1], await body<Partial<StudyActivity>>(request)); return new Response(null, { status: 204 });
    }
    if (path[0] === "subjects" && path[1]) {
      new LocalStudyStore(user.id).updateSubject(path[1], await body<Partial<StudySubject>>(request)); return new Response(null, { status: 204 });
    }
    if (path[0] === "sources" && path[1]) {
      new LocalSourceStore(user.id).update(path[1], await body<Partial<SourceDraft>>(request)); return new Response(null, { status: 204 });
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = requireRequestUser(request); const path = (await context.params).path; const sources = new LocalSourceStore(user.id);
    if (path[0] === "plan-sources" && path[1]) {
      const input = await body<{ planId: string; useForIncidence: boolean; useForQuestions: boolean }>(request);
      sources.setPlanSelection(path[1], input.planId, input); return new Response(null, { status: 204 });
    }
    if (path[0] === "plan-sources" && path.length === 1) {
      const input = await body<{ planId: string; sourceIds: string[]; active: boolean }>(request);
      sources.setAllPlanSources(input.planId, input.sourceIds, input.active); return new Response(null, { status: 204 });
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = requireRequestUser(request); const path = (await context.params).path;
    if (path[0] === "activities" && path[1]) new LocalStudyStore(user.id).deleteActivity(path[1]);
    else if (path[0] === "subjects" && path[1]) new LocalStudyStore(user.id).deleteSubject(path[1]);
    else if (path[0] === "sources" && path[1]) new LocalSourceStore(user.id).remove(path[1]);
    else return json({ error: "Rota não encontrada." }, 404);
    return new Response(null, { status: 204 });
  } catch (error) { return failure(error); }
}
