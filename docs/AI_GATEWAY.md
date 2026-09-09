# AI Gateway do Study Flow

O backend executa tarefas registradas por um provider OpenAI-compatible. DeepSeek é uma configuração dessa implementação; nenhum nome de modelo ou regra específica da DeepSeek entra no domínio, nos stores, nos componentes ou no MCP.

```text
Ação autenticada → serviço da tarefa → runAiTask
                                       ├─ preferência e privacidade da conta
                                       ├─ Task / Prompt Registry versionado
                                       ├─ construção de entrada com dados daquela conta
                                       ├─ AiProvider → endpoint OpenAI-compatible
                                       ├─ JSON + schema + validação contextual
                                       └─ ai_runs → resultado tipado → persistência do domínio

MCP → stores/domínio existentes, independentemente do AI Gateway
```

## Modos e disponibilidade

Os valores persistidos da migration 007 foram preservados: `study_flow` equivale a `study_flow_ai`; `mcp`, a `external_mcp`; e `none` permanece igual. Não houve migração destrutiva das preferências.

Só o modo `study_flow` pode executar o provider. A configuração é global da instalação, enquanto modo e permissão documental pertencem à conta. Trocar para MCP ou Sem IA bloqueia novas chamadas integradas. A escolha não altera autorizações OAuth anteriores; a revogação MCP continua sendo explícita e individual.

Sem chave, modelo, URL ou provider válidos, ou com a flag desativada, a aplicação inicia normalmente e a opção nativa aparece como indisponível. Uma preferência nativa já salva permanece salva durante indisponibilidades. Configuração válida significa “Disponível” na UI; o teste explícito verifica o serviço em tempo real. Abrir a página, selecionar o modo ou alterar a privacidade não chama o modelo.

## Configuração DeepSeek

Defina no ambiente do backend ou no arquivo local de ambiente ignorado pelo Git:

```dotenv
STUDY_FLOW_AI_ENABLED=true
STUDY_FLOW_AI_PROVIDER=openai_compatible
STUDY_FLOW_AI_BASE_URL=https://api.deepseek.com
STUDY_FLOW_AI_MODEL=deepseek-v4-flash
STUDY_FLOW_AI_API_KEY=<configurar no ambiente ou secret do servidor>
STUDY_FLOW_AI_TIMEOUT_MS=120000
STUDY_FLOW_AI_EXTRA_BODY_JSON={"thinking":{"type":"disabled"}}
```

A URL base e o modelo do exemplo seguem a [documentação oficial da DeepSeek](https://api-docs.deepseek.com/). O provider acrescenta `/chat/completions`; bases com `/v1` também são suportadas. Não inclua `/chat/completions` na variável base.

Os modelos atuais podem ativar raciocínio por padrão. A extensão opcional `thinking: disabled` permite usar o teste curto com seu limite de 128 tokens. A extensão fica exclusivamente na configuração do provider, sem adapter DeepSeek específico. As únicas extensões aceitas são `thinking.type` e `reasoning_effort`; elas não podem substituir mensagens, chave, modelo ou destino. Consulte o [contrato de Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

O provider usa `response_format: {type: "json_object"}` e solicita JSON também no prompt, conforme o [guia de JSON Output da DeepSeek](https://api-docs.deepseek.com/guides/json_mode/). O gateway valida o resultado localmente; JSON mode não substitui o schema.

Depois de configurar, execute `npm run build`, reinicie o processo Next.js e, em `/ia`, selecione IA do Study Flow e use Testar disponibilidade. O MCP mantém configuração e processo independentes.

| Variável | Padrão / regra |
| --- | --- |
| `STUDY_FLOW_AI_ENABLED` | `false`; somente `true` habilita |
| `STUDY_FLOW_AI_PROVIDER` | `openai_compatible` é a implementação disponível |
| `STUDY_FLOW_AI_BASE_URL` | Obrigatória; HTTPS remoto ou HTTP de loopback |
| `STUDY_FLOW_AI_MODEL` | Obrigatória; definida pela instalação |
| `STUDY_FLOW_AI_API_KEY` | Obrigatória nesta fase; somente backend |
| `STUDY_FLOW_AI_TIMEOUT_MS` | `120000`; intervalo permitido: 100 a 180000 ms |
| `STUDY_FLOW_AI_EXTRA_BODY_JSON` | `{}`; extensões opcionais validadas |

Não existe BYOK, seletor de modelo por usuário, persistência de API keys por conta ou envio da chave ao MCP. A mesma interface de provider poderá atender outros servidores OpenAI-compatible sem mudar regras de estudo. Servidores sem autenticação, HTTP fora de loopback e dialectos sem JSON mode ainda exigem uma decisão de configuração/compatibilidade; não foram implantados Ollama, vLLM, LM Studio ou LocalAI nesta etapa.

## Tarefas e prompts

Cada entrada central define identificador, versão, entrada validada, `systemPrompt`, `buildInput`, `outputSchema`, política de privacidade e limite de saída. Entradas desconhecidas ou campos adicionais são recusados.

| Task | Versão | Situação |
| --- | --- | --- |
| `HEALTH_CHECK` | `health_check:v1` | Executável pela UI; entrada fixa, saída `{ok: true}` |
| `REVIEW_RECOMMENDATIONS` | `review_recommendations:v1` | Executável pela UI; sugestões para temas do calendário ativo |
| `SUMMARIZE_SOURCE` | `summarize_source:v1` | Serviço de backend pronto; sem ação pública de fonte nesta etapa |
| `ANALYZE_SOURCE` | `analyze_source:v1` | Registrada e bloqueada até concluir seu fluxo de domínio |
| `CLASSIFY_QUESTION` | `classify_question:v1` | Registrada e bloqueada |
| `GENERATE_QUESTIONS` | `generate_questions:v1` | Registrada e bloqueada |
| `GENERATE_STUDY_PLAN` | `generate_study_plan:v1` | Registrada e bloqueada |
| `RECALCULATE_STUDY_PLAN` | `recalculate_study_plan:v1` | Registrada e bloqueada |

O registro contém os contratos iniciais das tarefas reservadas, mas o gateway retorna `TASK_UNAVAILABLE` antes de qualquer envio. Sua habilitação futura exige construção de entrada e aplicação das regras de domínio específicas.

As sugestões de revisão usam matéria, tema, datas, contagens de atividades e resultados estruturados do calendário ativo. Notas livres, enunciados, arquivos, e-mail e identificador da conta não são enviados. A validação contextual recusa temas inventados ou repetidos. Sugestões são exibidas para avaliação, sem alterar calendários.

Saídas são limitadas por tamanho, parseadas como JSON e validadas por Zod, com objetos estritos. Respostas truncadas, JSON inválido, schema incompatível e chave reproduzida no conteúdo são falhas. O serviço de resumo só persiste o DTO validado. Respostas de erro do provider não são repassadas nem registradas.

## Fontes e privacidade

`SourceTextExtractor` e `SourceChunker` estão separados do provider. `SavedAnalysisTextExtractor` reutiliza `raw_content` ou `summary` de análises locais existentes, obtidas pelo Source Store com escopo da conta. Não lê uploads, caminhos externos ou URLs de fontes.

A preparação limita o texto a 24000 caracteres; o chunker divide em blocos de até 1400. Por padrão são enviados os dois primeiros blocos; uma chamada interna pode selecionar até quatro. O resumo informa que cobre os trechos disponíveis. A ausência de texto salvo retorna `SOURCE_TEXT_UNAVAILABLE`, sem enviar o PDF ou imagem como alternativa.

`allow_external_ai_processing` começa em `0`, inclusive para contas existentes. A opção pode ser alterada em `/ia`. Quando desativada, tarefas documentais são bloqueadas antes de consultar/enviar trechos a endpoints externos. Endpoints de loopback são classificados como locais; qualquer outro hostname é tratado conservadoramente como externo. Essa permissão não altera o MCP.

A permissão é conferida novamente após a resposta. Se a conta mudar de modo ou revogar a permissão documental durante a chamada, o resultado é recusado. Conteúdo já enviado não pode ser retirado do provider; a política de retenção desse serviço continua aplicável.

O resumo integrado é salvo em `ai_source_summaries`, vinculado à conta, fonte e execução. As análises existentes, o status da fonte, a incidência e as questões não são sobrescritos. `get_source`, `get_source_file`, `save_source_analysis`, `save_source_topics`, `save_incidence` e `save_questions` mantêm seus contratos MCP.

Extração de PDF, OCR, imagens, embeddings, RAG e processamento em massa não foram implementados.

## Auditoria e resiliência

A migration incremental `008_ai_gateway.sql` adiciona:

- `user_ai_preferences.allow_external_ai_processing`;
- `ai_runs`, com conta, task/versão, provider/modelo, status, tokens de entrada/saída/total, duração, processamento externo, código de erro e horários;
- `ai_source_summaries`, com DTO validado e referências compostas à fonte e à execução da mesma conta.

`ai_runs` registra `running`, `succeeded`, `failed` e `blocked`, sem prompts, documentos, respostas completas ou credenciais. Os tokens ficam nulos quando o provider não informa usage. Usage recebido é preservado em falhas de validação do conteúdo. Somar tokens por conta e período permitirá métricas futuras; não há billing ou créditos.

Uma execução por conta pode ficar ativa por vez, com índice único no banco. Há limite de dez execuções iniciadas por minuto por conta. A próxima solicitação encerra registros ativos cujo prazo expirou. A classificação de processamento externo indica tentativa de chamada ao endpoint externo, inclusive quando a rede falha.

O timeout abrange requisição e leitura da resposta. Respostas HTTP são limitadas a 512 KB. Redirects são recusados para evitar encaminhamento de credenciais. Não há retries automáticos, inclusive em 429/5xx: uma nova tentativa depende de ação do usuário, evitando consumo duplicado involuntário.

Erros de configuração, autenticação, permissão, limite, modelo, rede, timeout, JSON e schema viram códigos e mensagens controlados. O restante do Study Flow continua disponível.

## APIs e UI

- `GET /api/ai/status`: disponibilidade sanitizada; não chama provider.
- `POST /api/ai/test`: corpo `{}`, somente `HEALTH_CHECK`.
- `POST /api/ai/review-recommendations`: corpo `{}`, somente sugestões de revisão.
- `POST /api/integrations/ai`: mantém ações MCP e acrescenta modo nativo e `set_privacy`.

Todas exigem sessão. Os POSTs validam origem e JSON; parâmetros como prompt, usuário, e-mail, tenant, database e modelo são recusados. Respostas usam `private, no-store`. Não existem endpoints de chat, completion ou prompt livre.

`/ia` mantém os três cartões existentes e acrescenta disponibilidade, modelo, teste restrito, privacidade e sugestões. A identidade de produto mostrada é Study Flow AI. O endereço do provider e a chave não chegam à interface. O ponto de entrada de servidor usa `server-only`.

## Arquivos desta etapa

Criados:

- `db/migrations/008_ai_gateway.sql`;
- `src/types/ai.ts`;
- `src/lib/ai/config.ts`, `errors.ts`, `provider.ts`, `providers/openai-compatible.ts`, `task-registry.ts`, `gateway.ts`, `tasks.ts`, `http.ts`, `server.ts`;
- `src/lib/local/ai-preference-store.ts`, `ai-run-store.ts`;
- `src/lib/source-processing/index.ts`;
- `src/app/api/ai/status/route.ts`, `test/route.ts`, `review-recommendations/route.ts`;
- `src/components/ai/study-flow-ai-panel.tsx`;
- `tests/ai-gateway.test.ts`, `tests/ai-gateway-migration.test.ts`;
- este documento.

Alterados:

- `.env.example`, `README.md`, `docs/TESTING.md`, `docs/MCP_ARCHITECTURE.md`, `docs/MCP_USER_GUIDE.md`;
- `src/types/ai-integration.ts`, `src/lib/local/ai-integration-store.ts`;
- `src/app/api/integrations/ai/route.ts`;
- `src/components/ai/ai-integrations-page.tsx`, `src/app/globals.css`.

As migrations 005, 006 e 007 foram preservadas. Não há dependência nova de biblioteca nem alteração de tools MCP nesta etapa.

## Verificação e limites

Os testes cobrem configuração ausente, bloqueio por modo/privacidade, erros de provider, schema, tokens, auditoria, persistência, isolamento, controle de consumo e upgrade de 007 para 008. A suíte existente cobre BASIC, ADVANCED, calendários, lifecycle, fontes, questões, OAuth e MCP.

A verificação de navegador usa Edge headless, usuários e dados isolados, com cenários sem provider e com servidor HTTP de teste OpenAI-compatible, em 1440 e 390 px. Confere seleção, reload, privacidade, teste, recomendações, ausência de chamadas automáticas e ausência de chave/URL interna nos payloads e HTML. O helper local fica em `.tools/qa/ai-gateway-smoke.mjs`, diretório ignorado pelo Git.

A chamada real à DeepSeek depende de uma chave configurada e não foi executada com credenciais reais. Limites operacionais restantes: modelos precisam suportar o dialecto Chat Completions/JSON mode utilizado; tarefas reservadas e extração de PDF precisam de implementação futura; o resumo de fontes ainda não tem UI; há limite por conta, mas não quota global/billing ou retenção automática da auditoria. O provider permanece síncrono por requisição, sem fila de background.
