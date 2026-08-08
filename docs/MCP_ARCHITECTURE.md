# Arquitetura para uma futura integração MCP

Esta fase não implementa servidor MCP nem IA. O objetivo deste documento é manter a futura integração fora dos componentes React e dentro do mesmo limite de autorização já usado pelo app.

## Fronteira sugerida

Um futuro adaptador MCP deve chamar uma camada de aplicação/repositories, nunca componentes e nunca SQL montado a partir de parâmetros do modelo. As operações previstas são:

| Operação | Leitura/gravação | Escopo |
| --- | --- | --- |
| `list_sources` | leitura | fontes visíveis no JWT atual |
| `get_source` | leitura | metadados de uma fonte própria |
| `get_source_file` | leitura | URL assinada curta de arquivo próprio |
| `create_source_analysis` | gravação | status/metadados de análise da fonte própria |
| `save_source_topics` | gravação | classificação da fonte própria |
| `save_source_questions` | gravação | questões e alternativas da fonte própria |
| `save_incidence` | gravação | `source_topic_stats` da fonte própria |
| `list_questions` | leitura | questões próprias e filtros autorizados |
| `get_active_plan` | leitura | plano ativo do usuário atual |
| `get_plan_sources` | leitura | vínculos do plano próprio |

## Identidade e autorização

1. A chamada MCP deve chegar com um access token Supabase do usuário ou uma credencial de backend que seja vinculada, de forma verificável, a esse usuário.
2. O adaptador valida assinatura, expiração, emissor e audiência do JWT antes de executar qualquer operação.
3. O `user_id` efetivo vem exclusivamente do claim autenticado (`sub`). Nunca é aceito de argumentos enviados pelo modelo, prompt, nome de arquivo ou query string.
4. O cliente de banco opera no contexto JWT do usuário para que RLS continue sendo a última barreira. IDs recebidos são tratados apenas como IDs de recurso; RLS e foreign keys compostas comprovam a propriedade.
5. Operações com arquivo validam também o prefixo `auth.uid()/` e usam URLs assinadas curtas. O conteúdo não deve ser colocado em logs.

Uma `service_role` key não deve ser exposta ao MCP cliente. Se um worker confiável precisar dela no futuro, ele deve rodar somente no servidor, revalidar usuário e propriedade antes de cada escrita, restringir as operações permitidas e registrar auditoria sem conteúdo sensível. Preferencialmente, continue usando um cliente com JWT do usuário e RLS.

## Validação de gravações

- use schemas de entrada fechados, limites de tamanho e enums do banco;
- confirme que `source_id`, `study_plan_id`, `subject_id` e `topic_id` são próprios antes de gravar;
- grave questão e alternativas em transação/RPC para evitar registros parciais;
- torne importações idempotentes com uma chave externa ou hash de análise;
- limite volume e taxa por operação;
- devolva erros sem vazar a existência de recursos de outro usuário;
- mantenha status `pending/analyzed/error/manual` explícito e origem `manual/mcp/imported` auditável.

## Separação de código futura

```text
src/lib/data/             # repositories já usados pela aplicação
src/lib/mcp/contracts/    # schemas e tipos das operações
src/lib/mcp/application/  # casos de uso autorizados
src/lib/mcp/audit/        # metadados de execução, sem conteúdo sensível
```

O transporte MCP deve ser uma casca sobre os casos de uso. Essa separação permite testar autorização e isolamento sem executar um modelo e mantém a UI totalmente funcional quando MCP/IA estiver indisponível.
