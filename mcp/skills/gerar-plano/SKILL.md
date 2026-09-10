---
name: gerar-plano
description: Orienta a IA a montar um plano ADVANCED usando prioridades e disponibilidade.
---

# Gerar plano de estudos

Use esta habilidade para criar o planejamento inicial de um calendário ADVANCED.

- Consulte `get_current_user` e `get_active_plan`. Use a conta OAuth atual; outro usuário só pode ser alvo quando um administrador o solicitar explicitamente e o servidor permitir.
- Confira `studyMode`. As ferramentas do planejador adaptativo são exclusivas de ADVANCED. Para BASIC, consulte a habilidade de calendário BASIC; não troque o método do usuário.
- Consulte `get_plan_sources`, `get_plan_settings`, `get_performance` e `get_priority_topics`. Não invente disponibilidade, data de prova ou incidência. Se faltar uma escolha necessária, solicite-a ao usuário.
- Use `update_plan_settings` somente para salvar as preferências solicitadas, com permissão de escrita. Use `preview_study_plan` para calcular distribuição e capacidade sem gravar atividades.
- Apresente a prévia, os dias considerados e eventuais limites de capacidade. A geração exige confirmação explícita dessa prévia pelo usuário.
- Após essa confirmação, use `generate_study_plan` com `confirmed: true` e a mesma data inicial da prévia. Verifique o retorno e consulte `list_calendar` no intervalo gerado.
- Para um planejamento já existente que precisa de ajustes futuros, use a habilidade de recálculo; não recrie atividades concluídas.
