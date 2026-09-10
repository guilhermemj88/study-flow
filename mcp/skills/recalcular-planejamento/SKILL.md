---
name: recalcular-planejamento
description: Orienta ajustes no plano ADVANCED futuro preservando as atividades concluídas.
---

# Recalcular planejamento

Use esta habilidade quando o usuário pedir adaptação do planejamento ADVANCED já existente.

- Consulte `get_current_user`, `get_active_plan` e `get_plan_settings`. Use a conta OAuth atual; outro usuário só pode ser alvo quando um administrador o solicitar explicitamente e o servidor permitir.
- Confirme que o calendário é ADVANCED. Não use o planejador adaptativo para BASIC nem altere o método do calendário.
- Consulte `get_plan_sources`, `get_performance`, `get_priority_topics` e `list_calendar` no período solicitado. Explique o motivo do ajuste com base nesses dados.
- Se o pedido for apenas uma avaliação, apresente a recomendação sem gravar. Se pedir recálculo, use `recalculate_future_plan` com a data inicial apropriada e permissão OAuth de escrita.
- Preserve atividades concluídas e o histórico; deixe o backend calcular e aplicar o recálculo, sem reproduzir suas regras ou editar atividades uma a uma.
- Consulte o calendário após a operação e resuma alterações e limitações efetivamente retornadas. Nova incidência, por si só, não é autorização para recalcular.
