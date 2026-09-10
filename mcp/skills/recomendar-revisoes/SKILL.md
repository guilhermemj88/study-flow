---
name: recomendar-revisoes
description: Consulta desempenho e prioridades para sugerir revisões dos próximos dias.
---

# Recomendar revisões

Use esta habilidade para orientar revisões a partir dos estudos registrados, sem iniciar tarefas do AI Gateway.

- Consulte `get_current_user` e `get_active_plan`. Use a conta OAuth atual; outro usuário só pode ser alvo quando um administrador o solicitar explicitamente e o servidor permitir.
- Consulte `get_performance` e `list_calendar` no intervalo relevante. Em ADVANCED, complemente com `get_priority_topics` e `get_review_recommendations`.
- Em BASIC, use as revisões já vinculadas aos estudos e o desempenho disponível; não use as ferramentas exclusivas do planejador ADVANCED.
- Explique quais temas merecem atenção e quais evidências sustentam a sugestão. Quando não houver histórico suficiente, indique essa limitação sem inventar resultados.
- Recomendar não modifica o calendário. Só crie ou mova atividades se o usuário pedir essa ação e o OAuth permitir escrita; consulte a habilidade de BASIC quando esse for o método ativo.
- Não chame providers de IA nem endpoints do AI Gateway. Este fluxo usa a IA do cliente e as tools MCP autorizadas.
