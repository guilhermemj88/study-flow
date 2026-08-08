import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import { LocalQuestionStore } from "@/lib/local/question-store";
import { LocalSourceStore } from "@/lib/local/source-store";
import { LocalStudyStore } from "@/lib/local/study-store";
import { LocalPlannerStore } from "@/lib/local/planner-store";
import type { ActivityDraft, StudyActivity } from "@/types/activity";

const sourceType = z.enum(["exam", "edital", "other"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data ISO no formato YYYY-MM-DD");
const annotations = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  update: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
} as const;

function response(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function audit(userId: string, toolName: string, success: boolean, resourceId?: string, error?: unknown) {
  getDatabase().prepare(`INSERT INTO mcp_audit_log
    (id, user_id, tool_name, success, resource_id, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), userId, toolName, Number(success), resourceId ?? null, error instanceof Error ? error.message : null, nowIso());
}

async function execute<T extends Record<string, unknown>>(userId: string, toolName: string, operation: () => T | Promise<T>, resourceId?: string) {
  try {
    const value = await operation(); audit(userId, toolName, true, resourceId); return response(value);
  } catch (error) {
    audit(userId, toolName, false, resourceId, error); throw error;
  }
}

export function createStudyFlowMcpServer(userId: string, scopes: string[]) {
  const server = new McpServer({ name: "study-flow", version: "1.0.0" }, {
    instructions: "Acesse somente os dados do usuário autenticado. Pesquisas na web são feitas pelo ChatGPT; use estas ferramentas para ler e persistir os resultados no Study Flow local.",
  });
  const study = new LocalStudyStore(userId);
  const sources = new LocalSourceStore(userId);
  const questions = new LocalQuestionStore(userId);
  const planner = new LocalPlannerStore(userId);
  const canWrite = scopes.includes("studyflow:write");
  const requireWrite = () => { if (!canWrite) throw new Error("O token não possui o escopo studyflow:write."); };

  server.registerTool("get_current_user", {
    title: "Consultar usuário atual",
    description: "Retorna a identidade local associada à autorização OAuth desta conexão.",
    inputSchema: {},
    annotations: annotations.read,
  }, () => execute(userId, "get_current_user", () => {
    const user = getDatabase().prepare("SELECT id, email, display_name, role FROM users WHERE id = ?").get(userId) as
      | { id: string; email: string; display_name: string; role: "admin" | "user" }
      | undefined;
    if (!user) throw new Error("Usuário autenticado não encontrado.");
    return { user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } };
  }));

  server.registerTool("list_sources", {
    title: "Listar provas, editais e fontes", description: "Lista as fontes locais do usuário, seus vínculos com o plano e estatísticas de incidência.",
    inputSchema: { type: sourceType.optional().describe("Filtrar pelo tipo da fonte") }, annotations: annotations.read,
  }, ({ type }) => execute(userId, "list_sources", () => ({ sources: sources.load().sources.filter((item) => !type || item.sourceType === type) })));

  server.registerTool("get_source", {
    title: "Consultar uma fonte", description: "Retorna metadados, análises e incidência de uma prova, edital ou outra fonte local.",
    inputSchema: { sourceId: z.string().uuid() }, annotations: annotations.read,
  }, ({ sourceId }) => execute(userId, "get_source", () => ({ source: sources.get(sourceId) }), sourceId));

  server.registerTool("get_source_file", {
    title: "Ler arquivo local de uma fonte", description: "Lê o PDF ou imagem de uma fonte local para interpretação pelo ChatGPT.",
    inputSchema: { sourceId: z.string().uuid() }, annotations: annotations.read,
  }, async ({ sourceId }) => {
    try {
      const file = sources.readFile(sourceId); audit(userId, "get_source_file", true, sourceId);
      return { content: [
        { type: "text" as const, text: JSON.stringify({ sourceId, filename: file.filename, mimeType: file.mimeType, size: file.bytes.length }) },
        { type: "resource" as const, resource: { uri: `studyflow://sources/${sourceId}/file`, mimeType: file.mimeType, blob: file.bytes.toString("base64") } },
      ] };
    } catch (error) { audit(userId, "get_source_file", false, sourceId, error); throw error; }
  });

  server.registerTool("get_active_plan", {
    title: "Consultar plano ativo", description: "Retorna o plano de estudo ativo, matérias e assuntos cadastrados.", inputSchema: {}, annotations: annotations.read,
  }, () => execute(userId, "get_active_plan", () => { const data = study.load(); return { activePlan: data.activePlan ?? null, subjects: data.subjects }; }));

  server.registerTool("get_plan_sources", {
    title: "Consultar fontes do plano", description: "Retorna fontes habilitadas para incidência e banco de questões no plano ativo.", inputSchema: {}, annotations: annotations.read,
  }, () => execute(userId, "get_plan_sources", () => { const data = sources.load(); return { activePlan: data.activePlan ?? null, sources: data.sources.filter((item) => item.planSelection) }; }));

  server.registerTool("get_plan_settings", {
    title: "Consultar preferências do plano",
    description: "Retorna prova, disponibilidade semanal, duração das sessões e espaçamento do plano adaptativo.",
    inputSchema: {}, annotations: annotations.read,
  }, () => execute(userId, "get_plan_settings", () => ({ settings: planner.getSettings() })));

  const availabilitySchema = z.object({
    mon: z.number().int().min(0).max(720).optional(), tue: z.number().int().min(0).max(720).optional(),
    wed: z.number().int().min(0).max(720).optional(), thu: z.number().int().min(0).max(720).optional(),
    fri: z.number().int().min(0).max(720).optional(), sat: z.number().int().min(0).max(720).optional(),
    sun: z.number().int().min(0).max(720).optional(),
  });
  server.registerTool("update_plan_settings", {
    title: "Atualizar preferências do plano",
    description: "Atualiza data da prova, disponibilidade, sessões, revisões, reforço e quantidade de exercícios.",
    inputSchema: {
      examDate: z.union([date, z.literal("")]).optional(), availability: availabilitySchema.optional(),
      sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).optional(),
      dailyLimitMinutes: z.number().int().min(30).max(720).optional(),
      firstReviewDays: z.number().int().min(1).optional(), secondReviewDays: z.number().int().min(2).optional(),
      reinforcementDays: z.number().int().min(3).optional(),
      exerciseQuestions: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]).optional(),
    }, annotations: annotations.update,
  }, (input) => execute(userId, "update_plan_settings", () => { requireWrite(); return { settings: planner.updateSettings(input) }; }));

  server.registerTool("preview_study_plan", {
    title: "Visualizar plano de estudos",
    description: "Calcula uma prévia sem gravar atividades, usando incidência, desempenho e disponibilidade.",
    inputSchema: { startDate: date.optional() }, annotations: annotations.read,
  }, ({ startDate }) => execute(userId, "preview_study_plan", () => ({ preview: planner.preview({ startDate }) })));

  server.registerTool("generate_study_plan", {
    title: "Gerar plano de estudos",
    description: "Gera e grava o plano inicial após confirmação explícita do usuário.",
    inputSchema: { startDate: date.optional() }, annotations: annotations.write,
  }, ({ startDate }) => execute(userId, "generate_study_plan", () => { requireWrite(); return { result: planner.generateStudyPlan({ startDate }) }; }));

  server.registerTool("recalculate_future_plan", {
    title: "Recalcular plano futuro",
    description: "Recalcula somente atividades futuras, preservando concluídas e atualizando sequências equivalentes sem duplicar.",
    inputSchema: { startDate: date.optional() }, annotations: annotations.update,
  }, ({ startDate }) => execute(userId, "recalculate_future_plan", () => { requireWrite(); return { result: planner.recalculateFuturePlan({ startDate }) }; }));

  server.registerTool("get_priority_topics", {
    title: "Consultar prioridades adaptativas",
    description: "Retorna matérias, temas e subtemas ponderados por incidência, desempenho, motivo do erro e recência.",
    inputSchema: {}, annotations: annotations.read,
  }, () => execute(userId, "get_priority_topics", () => ({ priorities: planner.getPriorityTopics() })));

  server.registerTool("get_review_recommendations", {
    title: "Consultar recomendações de revisão",
    description: "Sugere revisões, exercícios ou reforços com explicação da prioridade atual.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(10) }, annotations: annotations.read,
  }, ({ limit }) => execute(userId, "get_review_recommendations", () => ({ recommendations: planner.getReviewRecommendations(limit) })));

  server.registerTool("list_questions", {
    title: "Consultar questões", description: "Lista questões locais e permite filtrar por fonte, matéria, tema, ano ou status de resposta.",
    inputSchema: {
      sourceIds: z.array(z.string().uuid()).optional(), subjectId: z.string().uuid().optional(), topicId: z.string().uuid().optional(),
      year: z.number().int().min(1900).max(2200).optional(), status: z.enum(["all", "unanswered", "wrong", "correct"]).optional(),
      onlyActivePlanSources: z.boolean().default(false),
    }, annotations: annotations.read,
  }, ({ onlyActivePlanSources, ...filters }) => execute(userId, "list_questions", () => questions.load({ ...filters, status: filters.status ?? "all", sourceIds: filters.sourceIds ?? [] }, onlyActivePlanSources)));

  server.registerTool("list_calendar", {
    title: "Consultar calendário", description: "Lista atividades locais dentro de um intervalo de datas.",
    inputSchema: { dateFrom: date, dateTo: date }, annotations: annotations.read,
  }, ({ dateFrom, dateTo }) => execute(userId, "list_calendar", () => ({ activities: study.listCalendar(dateFrom, dateTo) })));

  server.registerTool("get_activity", {
    title: "Consultar atividade", description: "Retorna uma atividade do calendário com seu resultado, se concluída.",
    inputSchema: { activityId: z.string().uuid() }, annotations: annotations.read,
  }, ({ activityId }) => execute(userId, "get_activity", () => {
    const activity = study.load().activities.find((item) => item.id === activityId);
    if (!activity) throw new Error("Atividade não encontrada."); return { activity };
  }, activityId));

  server.registerTool("get_performance", {
    title: "Consultar desempenho", description: "Retorna resultados de atividades e tentativas de questões para análise de desempenho.",
    inputSchema: { dateFrom: date.optional(), dateTo: date.optional() }, annotations: annotations.read,
  }, ({ dateFrom, dateTo }) => execute(userId, "get_performance", () => {
    const data = study.load();
    const activities = data.activities.filter((item) => item.result && (!dateFrom || item.date >= dateFrom) && (!dateTo || item.date <= dateTo));
    const attempts = data.attemptSummaries.filter((item) => (!dateFrom || item.answeredAt.slice(0, 10) >= dateFrom) && (!dateTo || item.answeredAt.slice(0, 10) <= dateTo));
    const correct = attempts.filter((item) => item.correct).length;
    return { summary: { completedActivities: activities.length, attempts: attempts.length, correct, wrong: attempts.length - correct, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0 }, activities, attempts };
  }));

  server.registerTool("create_source", {
    title: "Salvar prova, edital ou fonte", description: "Cria uma fonte local a partir de pesquisa do ChatGPT. Para arquivo binário, faça o upload pela interface local.",
    inputSchema: { name: z.string().min(1), sourceType, institution: z.string().optional(), year: z.number().int().min(1900).max(2200).optional(), edition: z.string().optional(), description: z.string().optional(), sourceUrl: z.string().url().optional() },
    annotations: annotations.write,
  }, (input) => execute(userId, "create_source", () => { requireWrite(); const sourceId = sources.create(input); return { sourceId, source: sources.get(sourceId) }; }));

  server.registerTool("save_source_analysis", {
    title: "Salvar análise de fonte", description: "Persiste localmente a interpretação e o conteúdo extraído de uma prova ou edital.",
    inputSchema: { sourceId: z.string().uuid(), status: z.enum(["pending", "analyzed", "error", "manual"]).default("analyzed"), summary: z.string().min(1), rawContent: z.string().optional() }, annotations: annotations.write,
  }, ({ sourceId, ...input }) => execute(userId, "save_source_analysis", () => { requireWrite(); sources.saveAnalysis(sourceId, input); return { sourceId, saved: true }; }, sourceId));

  const incidenceSchema = {
    sourceId: z.string().uuid(), replace: z.boolean().default(true), items: z.array(z.object({
      subject: z.string().min(1), topic: z.string().optional(), subtopic: z.string().optional(),
      questionCount: z.number().int().min(0), incidencePercentage: z.number().min(0).max(100),
    })).min(1),
  };
  server.registerTool("save_incidence", {
    title: "Salvar incidência", description: "Salva a incidência calculada por matéria, tema e subtema para uma fonte.", inputSchema: incidenceSchema, annotations: annotations.update,
  }, ({ sourceId, items, replace }) => execute(userId, "save_incidence", () => { requireWrite(); sources.saveTopicsByName(sourceId, items, replace); return { sourceId, savedItems: items.length, planRefreshAvailable: planner.hasGeneratedPlan() }; }, sourceId));

  server.registerTool("save_source_topics", {
    title: "Classificar temas de uma fonte", description: "Salva matérias, temas e subtemas identificados em uma prova ou edital, com contagens e incidência.", inputSchema: incidenceSchema, annotations: annotations.update,
  }, ({ sourceId, items, replace }) => execute(userId, "save_source_topics", () => { requireWrite(); sources.saveTopicsByName(sourceId, items, replace); return { sourceId, savedItems: items.length, planRefreshAvailable: planner.hasGeneratedPlan() }; }, sourceId));

  server.registerTool("save_questions", {
    title: "Salvar questões classificadas", description: "Salva questões interpretadas pelo ChatGPT com matéria, tema, subtema, alternativas, gabarito e explicação.",
    inputSchema: { sourceId: z.string().uuid(), questions: z.array(z.object({
      questionNumber: z.number().int().positive(), statement: z.string().min(1), subject: z.string().optional(), topic: z.string().optional(), subtopic: z.string().optional(),
      explanation: z.string().optional(), correctAlternative: z.string().min(1), year: z.number().int().min(1900).max(2200).optional(),
      alternatives: z.array(z.object({ label: z.string().min(1), text: z.string().min(1), sortOrder: z.number().int().min(0).optional() })).min(2),
    })).min(1) }, annotations: annotations.write,
  }, ({ sourceId, questions: drafts }) => execute(userId, "save_questions", () => { requireWrite(); const questionIds = questions.saveQuestionsByName(sourceId, drafts); return { sourceId, saved: questionIds.length, questionIds }; }, sourceId));

  server.registerTool("create_activity", {
    title: "Criar atividade", description: "Cria uma atividade no calendário local quando solicitado pelo usuário.",
    inputSchema: {
      subject: z.string().min(1), topic: z.string().min(1), type: z.enum(["study", "exercise", "review", "reinforcement"]), date,
      estimatedMinutes: z.number().int().positive(), questionCount: z.number().int().positive().optional(), priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      status: z.enum(["planned", "attention", "completed"]).default("planned"), notes: z.string().optional(),
    }, annotations: annotations.write,
  }, (input) => execute(userId, "create_activity", () => { requireWrite(); const activity = study.createActivity({ ...input, exerciseOrigin: "manual" } as ActivityDraft); return { activity }; }));

  server.registerTool("update_activity", {
    title: "Atualizar atividade", description: "Atualiza data, classificação, duração, prioridade, status ou notas de uma atividade local.",
    inputSchema: {
      activityId: z.string().uuid(), subject: z.string().min(1).optional(), topic: z.string().min(1).optional(),
      type: z.enum(["study", "exercise", "review", "reinforcement"]).optional(), date: date.optional(), estimatedMinutes: z.number().int().positive().optional(),
      questionCount: z.number().int().positive().nullable().optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["planned", "attention", "completed"]).optional(), notes: z.string().nullable().optional(),
    }, annotations: annotations.update,
  }, ({ activityId, ...updates }) => execute(userId, "update_activity", () => { requireWrite(); study.updateActivity(activityId, updates as Partial<StudyActivity>); const activity = study.load().activities.find((item) => item.id === activityId); return { activityId, activity }; }, activityId));

  return server;
}
