export const AI_ERRORS = {
  AI_DISABLED: [503, "A IA do Study Flow está desativada no momento."],
  AI_NOT_CONFIGURED: [503, "A IA do Study Flow ainda não está configurada."],
  AI_MODE_REQUIRED: [403, "Selecione IA do Study Flow para executar esta tarefa."],
  PRIVACY_BLOCKED: [403, "O processamento externo de trechos dos seus materiais está desabilitado."],
  TASK_NOT_FOUND: [400, "Tarefa de IA desconhecida."],
  TASK_UNAVAILABLE: [400, "Esta tarefa de IA ainda não está disponível."],
  INVALID_INPUT: [400, "Não foi possível preparar os dados desta tarefa."],
  SOURCE_TEXT_UNAVAILABLE: [422, "A fonte ainda não possui texto de análise salvo. A extração de PDF e imagens não está disponível nesta versão."],
  PROVIDER_UNAVAILABLE: [503, "O serviço de IA está indisponível. Tente novamente mais tarde."],
  PROVIDER_TIMEOUT: [504, "A IA demorou além do limite. Tente novamente mais tarde."],
  PROVIDER_UNAUTHORIZED: [503, "O serviço de IA não aceitou a configuração de autenticação da instalação."],
  PROVIDER_FORBIDDEN: [503, "O serviço de IA não autorizou esta operação."],
  PROVIDER_RATE_LIMIT: [429, "O serviço de IA atingiu seu limite de uso. Aguarde antes de tentar novamente."],
  PROVIDER_BAD_REQUEST: [502, "O serviço de IA não aceitou a tarefa com a configuração atual."],
  MODEL_UNAVAILABLE: [503, "O modelo configurado está indisponível."],
  INVALID_PROVIDER_RESPONSE: [502, "O serviço de IA retornou uma resposta inesperada."],
  INVALID_JSON: [502, "A IA retornou um resultado incompleto ou inválido. Seus dados foram preservados."],
  INVALID_OUTPUT: [502, "A resposta da IA não passou pela validação. Seus dados foram preservados."],
  OUTPUT_TRUNCATED: [502, "A resposta da IA foi interrompida antes de terminar. Seus dados foram preservados."],
  RUN_IN_PROGRESS: [409, "Já existe uma tarefa de IA em andamento nesta conta."],
  USER_RATE_LIMIT: [429, "Aguarde um minuto antes de solicitar mais tarefas de IA."],
  INTERNAL_ERROR: [500, "Não foi possível concluir a tarefa de IA. Tente novamente."],
} as const;

export type AiErrorCode = keyof typeof AI_ERRORS;

export class AiError extends Error {
  readonly status: number;
  constructor(readonly code: AiErrorCode) {
    super(AI_ERRORS[code][1]);
    this.name = "AiError";
    this.status = AI_ERRORS[code][0];
  }
}

export function safeAiError(error: unknown): AiError {
  return error instanceof AiError ? error : new AiError("INTERNAL_ERROR");
}
