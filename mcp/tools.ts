import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { LocalQuestionStore } from "@/lib/local/question-store";
import { LocalSourceStore } from "@/lib/local/source-store";
import { LocalStudyStore } from "@/lib/local/study-store";
import { LocalPlannerStore } from "@/lib/local/planner-store";
import type { ActivityDraft, StudyActivity } from "@/types/activity";
import type { LocalAuthUser } from "@/types/auth";
import { resolveTargetUser, type TargetUserInput } from "./target-user";

const sourceType = z.enum(["exam", "edital", "other"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data ISO no formato YYYY-MM-DD");
const targetUserSchema = {
  targetUserEmail: z.string().email().optional().describe("E-mail do usuário alvo; permitido para outro usuário somente quando o OAuth atual é admin"),
  targetUserId: z.string().uuid().optional().describe("ID do usuário alvo; permitido para outro usuário somente quando o OAuth atual é admin"),
};
const annotations = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  update: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
} as const;

interface ToolContext {
  targetUser: LocalAuthUser;
  study: LocalStudyStore;
  sources: LocalSourceStore;
  questions: LocalQuestionStore;
  planner: LocalPlannerStore;
}

function response(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function audit(authenticatedUserId: string, toolName: string, success: boolean, input: TargetUserInput = {},
  targetUserId?: string, resourceId?: string, error?: unknown, clientId?: string) {
  getDatabase().prepare(`INSERT INTO mcp_audit_log
    (id, user_id, client_id, tool_name, success, target_user_id, target_user_email, resource_id, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), authenticatedUserId, clientId ?? null, toolName, Number(success), targetUserId ?? null,
      input.targetUserEmail?.trim().toLowerCase() ?? null, resourceId ?? null,
      error instanceof Error ? error.message : null, nowIso());
}

async function execute<T extends Record<string, unknown>>(authenticatedUser: LocalAuthUser, toolName: string,
  input: TargetUserInput, operation: (context: ToolContext) => T | Promise<T>, resourceId?: string, clientId?: string) {
  let targetUser: LocalAuthUser | undefined;
  try {
    targetUser = resolveTargetUser({ authenticatedUser, ...input });
    const value = await operation({
      targetUser,
      study: new LocalStudyStore(targetUser.id),
      sources: new LocalSourceStore(targetUser.id),
      questions: new LocalQuestionStore(targetUser.id),
      planner: new LocalPlannerStore(targetUser.id),
    });
    audit(authenticatedUser.id, toolName, true, input, targetUser.id, resourceId, undefined, clientId);
    return response(value);
  } catch (error) {
    audit(authenticatedUser.id, toolName, false, input, targetUser?.id, resourceId, error, clientId);
    throw error;
  }
}

export function createStudyFlowMcpServer(authenticated: string | LocalAuthUser, scopes: string[], clientId?: string) {
  const authenticatedUser = typeof authenticated === "string"
    ? resolveTargetUser({ authenticatedUser: { id: authenticated } })
    : resolveTargetUser({ authenticatedUser: authenticated });
  const server = new McpServer({ name: "study-flow", version: "1.1.0" }, {
    instructions: "Use os dados do usuário OAuth atual por padrão. Um administrador pode informar targetUserEmail ou targetUserId explicitamente; o servidor valida a role e audita a troca de contexto. A prévia do plano não grava atividades e a geração exige confirmação explícita.",
  });
  const canWrite = scopes.includes("studyflow:write");
  const requireWrite = () => { if (!canWrite) throw new Error("O token não possui o escopo studyflow:write."); };

  server.registerTool("get_current_user", {
    title: "Consultar usuário atual",
    description: "Retorna a identidade associada à autorização OAuth, sem trocar o contexto.",
    inputSchema: {}, annotations: annotations.read,
  }, () => execute(authenticatedUser, "get_current_user", {}, ({ targetUser }) => ({ user: targetUser }), undefined, clientId));

  server.registerTool("list_sources", {
    title: "Listar provas, editais e fontes",
    description: "Lista fontes, vínculos com o plano, contagens válidas/anuladas e incidência.",
    inputSchema: { ...targetUserSchema, type: sourceType.optional() }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "list_sources", input, ({ sources }) => ({
    sources: sources.load().sources.filter((item) => !input.type || item.sourceType === input.type),
  }), undefined, clientId));

  server.registerTool("get_source", {
    title: "Consultar uma fonte", description: "Retorna metadados, análises e incidência de uma fonte.",
    inputSchema: { ...targetUserSchema, sourceId: z.string().uuid() }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_source", input, ({ sources }) => ({ source: sources.get(input.sourceId) }), input.sourceId, clientId));

  server.registerTool("get_source_file", {
    title: "Ler arquivo local de uma fonte", description: "Lê o PDF ou imagem privado para interpretação pelo ChatGPT.",
    inputSchema: { ...targetUserSchema, sourceId: z.string().uuid() }, annotations: annotations.read,
  }, async (input) => {
    let targetUser: LocalAuthUser | undefined;
    try {
      targetUser = resolveTargetUser({ authenticatedUser, ...input });
      const file = new LocalSourceStore(targetUser.id).readFile(input.sourceId);
      audit(authenticatedUser.id, "get_source_file", true, input, targetUser.id, input.sourceId, undefined, clientId);
      return { content: [
        { type: "text" as const, text: JSON.stringify({ sourceId: input.sourceId, filename: file.filename, mimeType: file.mimeType, size: file.bytes.length }) },
        { type: "resource" as const, resource: { uri: `studyflow://sources/${input.sourceId}/file`, mimeType: file.mimeType, blob: file.bytes.toString("base64") } },
      ] };
    } catch (error) {
      audit(authenticatedUser.id, "get_source_file", false, input, targetUser?.id, input.sourceId, error, clientId);
      throw error;
    }
  });

  server.registerTool("get_active_plan", {
    title: "Consultar plano ativo", description: "Retorna plano, matérias e temas cadastrados.",
    inputSchema: targetUserSchema, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_active_plan", input, ({ study }) => {
    const data = study.load(); return { activePlan: data.activePlan ?? null, subjects: data.subjects };
  }, undefined, clientId));

  server.registerTool("get_plan_sources", {
    title: "Consultar fontes do plano", description: "Retorna fontes habilitadas para incidência e questões.",
    inputSchema: targetUserSchema, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_plan_sources", input, ({ sources }) => {
    const data = sources.load(); return { activePlan: data.activePlan ?? null, sources: data.sources.filter((item) => item.planSelection) };
  }, undefined, clientId));

  server.registerTool("get_plan_settings", {
    title: "Consultar preferências do plano", description: "Retorna prova, disponibilidade diária e preferências adaptativas.",
    inputSchema: targetUserSchema, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_plan_settings", input, ({ planner }) => ({ settings: planner.getSettings() }), undefined, clientId));

  const availabilitySchema = z.object({
    mon: z.number().int().min(0).max(720).optional(), tue: z.number().int().min(0).max(720).optional(),
    wed: z.number().int().min(0).max(720).optional(), thu: z.number().int().min(0).max(720).optional(),
    fri: z.number().int().min(0).max(720).optional(), sat: z.number().int().min(0).max(720).optional(),
    sun: z.number().int().min(0).max(720).optional(),
  });
  server.registerTool("update_plan_settings", {
    title: "Atualizar preferências do plano", description: "Atualiza prova, disponibilidade por dia, sessões, revisões e exercícios.",
    inputSchema: {
      ...targetUserSchema, examDate: z.union([date, z.literal("")]).optional(), availability: availabilitySchema.optional(),
      sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).optional(),
      dailyLimitMinutes: z.number().int().min(30).max(720).optional(), firstReviewDays: z.number().int().min(1).optional(),
      secondReviewDays: z.number().int().min(2).optional(), reinforcementDays: z.number().int().min(3).optional(),
      exerciseQuestions: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]).optional(),
    }, annotations: annotations.update,
  }, (input) => execute(authenticatedUser, "update_plan_settings", input, ({ planner }) => {
    requireWrite();
    const settings = { ...input };
    delete settings.targetUserEmail;
    delete settings.targetUserId;
    return { settings: planner.updateSettings(settings) };
  }, undefined, clientId));

  server.registerTool("preview_study_plan", {
    title: "Visualizar plano de estudos", description: "Calcula capacidade e distribuição sem gravar atividades.",
    inputSchema: { ...targetUserSchema, startDate: date.optional() }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "preview_study_plan", input, ({ planner }) => ({ preview: planner.preview({ startDate: input.startDate }) }), undefined, clientId));

  server.registerTool("generate_study_plan", {
    title: "Gerar plano de estudos", description: "Grava o plano inicial somente após configuração, prévia e confirmação explícita.",
    inputSchema: { ...targetUserSchema, startDate: date.optional(), confirmed: z.literal(true).describe("Confirmação explícita da prévia pelo usuário") },
    annotations: annotations.write,
  }, (input) => execute(authenticatedUser, "generate_study_plan", input, ({ planner }) => {
    requireWrite(); return { result: planner.generateStudyPlan({ startDate: input.startDate, confirmed: input.confirmed }) };
  }, undefined, clientId));

  server.registerTool("recalculate_future_plan", {
    title: "Recalcular plano futuro", description: "Recalcula somente o futuro e preserva atividades concluídas.",
    inputSchema: { ...targetUserSchema, startDate: date.optional() }, annotations: annotations.update,
  }, (input) => execute(authenticatedUser, "recalculate_future_plan", input, ({ planner }) => {
    requireWrite(); return { result: planner.recalculateFuturePlan({ startDate: input.startDate }) };
  }, undefined, clientId));

  server.registerTool("get_priority_topics", {
    title: "Consultar prioridades adaptativas", description: "Retorna temas ponderados por incidência, desempenho, prioridade e recência.",
    inputSchema: targetUserSchema, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_priority_topics", input, ({ planner }) => ({ priorities: planner.getPriorityTopics() }), undefined, clientId));

  server.registerTool("get_review_recommendations", {
    title: "Consultar recomendações de revisão", description: "Sugere revisões, exercícios ou reforços prioritários.",
    inputSchema: { ...targetUserSchema, limit: z.number().int().min(1).max(50).default(10) }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_review_recommendations", input, ({ planner }) => ({ recommendations: planner.getReviewRecommendations(input.limit) }), undefined, clientId));

  server.registerTool("list_questions", {
    title: "Consultar questões", description: "Lista questões válidas e anuladas com filtros opcionais.",
    inputSchema: {
      ...targetUserSchema, sourceIds: z.array(z.string().uuid()).optional(), subjectId: z.string().uuid().optional(),
      topicId: z.string().uuid().optional(), year: z.number().int().min(1900).max(2200).optional(),
      status: z.enum(["all", "unanswered", "wrong", "correct"]).optional(), onlyActivePlanSources: z.boolean().default(false),
    }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "list_questions", input, ({ questions }) => questions.load({
    sourceIds: input.sourceIds ?? [], subjectId: input.subjectId, topicId: input.topicId, year: input.year,
    status: input.status ?? "all",
  }, input.onlyActivePlanSources), undefined, clientId));

  server.registerTool("list_calendar", {
    title: "Consultar calendário", description: "Lista atividades dentro de um intervalo.",
    inputSchema: { ...targetUserSchema, dateFrom: date, dateTo: date }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "list_calendar", input, ({ study }) => ({ activities: study.listCalendar(input.dateFrom, input.dateTo) }), undefined, clientId));

  server.registerTool("get_activity", {
    title: "Consultar atividade", description: "Retorna uma atividade e seu resultado.",
    inputSchema: { ...targetUserSchema, activityId: z.string().uuid() }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_activity", input, ({ study }) => {
    const activity = study.load().activities.find((item) => item.id === input.activityId);
    if (!activity) throw new Error("Atividade não encontrada.");
    return { activity };
  }, input.activityId, clientId));

  server.registerTool("get_performance", {
    title: "Consultar desempenho", description: "Retorna resultados e tentativas; questões anuladas não entram nas métricas.",
    inputSchema: { ...targetUserSchema, dateFrom: date.optional(), dateTo: date.optional() }, annotations: annotations.read,
  }, (input) => execute(authenticatedUser, "get_performance", input, ({ study }) => {
    const data = study.load();
    const activities = data.activities.filter((item) => item.result && (!input.dateFrom || item.date >= input.dateFrom) && (!input.dateTo || item.date <= input.dateTo));
    const attempts = data.attemptSummaries.filter((item) => (!input.dateFrom || item.answeredAt.slice(0, 10) >= input.dateFrom) && (!input.dateTo || item.answeredAt.slice(0, 10) <= input.dateTo));
    const correct = attempts.filter((item) => item.correct).length;
    return { summary: { completedActivities: activities.length, attempts: attempts.length, correct, wrong: attempts.length - correct,
      accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0 }, activities, attempts };
  }, undefined, clientId));

  server.registerTool("create_source", {
    title: "Salvar prova, gabarito, edital ou fonte", description: "Cria uma fonte local; gabaritos ficam fora da incidência e do banco de questões.",
    inputSchema: {
      ...targetUserSchema, name: z.string().min(1), sourceType, isAnswerKey: z.boolean().default(false),
      institution: z.string().optional(), year: z.number().int().min(1900).max(2200).optional(),
      edition: z.string().optional(), description: z.string().optional(), sourceUrl: z.string().url().optional(),
    }, annotations: annotations.write,
  }, (input) => execute(authenticatedUser, "create_source", input, ({ sources }) => {
    requireWrite();
    const draft = { ...input };
    delete draft.targetUserEmail;
    delete draft.targetUserId;
    const sourceId = sources.create(draft); return { sourceId, source: sources.get(sourceId) };
  }, undefined, clientId));

  server.registerTool("save_source_analysis", {
    title: "Salvar análise de fonte", description: "Persiste a interpretação e o conteúdo extraído.",
    inputSchema: { ...targetUserSchema, sourceId: z.string().uuid(), status: z.enum(["pending", "analyzed", "error", "manual"]).default("analyzed"), summary: z.string().min(1), rawContent: z.string().optional() },
    annotations: annotations.write,
  }, (input) => execute(authenticatedUser, "save_source_analysis", input, ({ sources }) => {
    requireWrite(); sources.saveAnalysis(input.sourceId, { status: input.status, summary: input.summary, rawContent: input.rawContent });
    return { sourceId: input.sourceId, saved: true };
  }, input.sourceId, clientId));

  const incidenceFields = {
    ...targetUserSchema, sourceId: z.string().uuid(), replace: z.boolean().default(true),
    items: z.array(z.object({ subject: z.string().min(1), topic: z.string().optional(), subtopic: z.string().optional(),
      questionCount: z.number().int().min(0), incidencePercentage: z.number().min(0).max(100) })).min(1),
  };
  for (const definition of [
    { name: "save_incidence", title: "Salvar incidência" },
    { name: "save_source_topics", title: "Classificar temas de uma fonte" },
  ] as const) {
    server.registerTool(definition.name, {
      title: definition.title, description: "Salva classificação e incidência temática; gabaritos são recusados.",
      inputSchema: incidenceFields, annotations: annotations.update,
    }, (input) => execute(authenticatedUser, definition.name, input, ({ sources, planner }) => {
      requireWrite(); sources.saveTopicsByName(input.sourceId, input.items, input.replace);
      return { sourceId: input.sourceId, savedItems: input.items.length, planRefreshAvailable: planner.hasGeneratedPlan() };
    }, input.sourceId, clientId));
  }

  server.registerTool("save_questions", {
    title: "Salvar questões classificadas", description: "Salva questões válidas ou oficialmente anuladas sem inventar gabarito.",
    inputSchema: { ...targetUserSchema, sourceId: z.string().uuid(), questions: z.array(z.object({
      questionNumber: z.number().int().positive(), statement: z.string().min(1), subject: z.string().optional(),
      topic: z.string().optional(), subtopic: z.string().optional(), explanation: z.string().optional(),
      questionStatus: z.enum(["valid", "annulled"]).default("valid"), correctAlternative: z.enum(["A", "B", "C", "D", "E"]).nullable(),
      year: z.number().int().min(1900).max(2200).optional(), alternatives: z.array(z.object({
        label: z.enum(["A", "B", "C", "D", "E"]), text: z.string().min(1), sortOrder: z.number().int().min(0).optional(),
      })).min(2),
    })).min(1) }, annotations: annotations.write,
  }, (input) => execute(authenticatedUser, "save_questions", input, ({ questions }) => {
    requireWrite(); const questionIds = questions.saveQuestionsByName(input.sourceId, input.questions);
    return { sourceId: input.sourceId, saved: questionIds.length, questionIds };
  }, input.sourceId, clientId));

  server.registerTool("create_activity", {
    title: "Criar atividade", description: "Cria uma atividade no calendário do usuário alvo.",
    inputSchema: {
      ...targetUserSchema, subject: z.string().min(1), topic: z.string().min(1),
      type: z.enum(["study", "exercise", "review", "reinforcement"]), date, estimatedMinutes: z.number().int().positive(),
      questionCount: z.number().int().positive().optional(), priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      status: z.enum(["planned", "attention", "completed"]).default("planned"), notes: z.string().optional(),
    }, annotations: annotations.write,
  }, (input) => execute(authenticatedUser, "create_activity", input, ({ study }) => {
    requireWrite();
    const draft = { ...input };
    delete draft.targetUserEmail;
    delete draft.targetUserId;
    return { activity: study.createActivity({ ...draft, exerciseOrigin: "manual" } as ActivityDraft) };
  }, undefined, clientId));

  server.registerTool("update_activity", {
    title: "Atualizar atividade", description: "Atualiza classificação, agenda, duração, prioridade, status ou notas.",
    inputSchema: {
      ...targetUserSchema, activityId: z.string().uuid(), subject: z.string().min(1).optional(), topic: z.string().min(1).optional(),
      type: z.enum(["study", "exercise", "review", "reinforcement"]).optional(), date: date.optional(),
      estimatedMinutes: z.number().int().positive().optional(), questionCount: z.number().int().positive().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["planned", "attention", "completed"]).optional(),
      notes: z.string().nullable().optional(),
    }, annotations: annotations.update,
  }, (input) => execute(authenticatedUser, "update_activity", input, ({ study }) => {
    requireWrite();
    const activityId = input.activityId;
    const updates: Partial<typeof input> = { ...input };
    delete updates.targetUserEmail;
    delete updates.targetUserId;
    delete updates.activityId;
    study.updateActivity(activityId, updates as Partial<StudyActivity>);
    return { activityId, activity: study.load().activities.find((item) => item.id === activityId) };
  }, input.activityId, clientId));

  return server;
}
