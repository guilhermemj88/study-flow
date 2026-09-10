---
name: gerenciar-calendario-basic
description: Organiza estudos BASIC respeitando as revisões automáticas e o histórico do calendário.
---

# Gerenciar calendário BASIC

Use esta habilidade para criar ou ajustar atividades em um calendário BASIC.

- Consulte `get_current_user` e `get_active_plan` para confirmar conta, calendário e `studyMode: basic`. Use a conta OAuth atual; outro usuário só pode ser alvo quando um administrador o solicitar explicitamente e o servidor permitir.
- Use `list_calendar` e, se necessário, `get_activity` para verificar os estudos e revisões existentes no período. Não troque o calendário ou seu método sem pedido.
- Para um novo estudo solicitado, use `create_activity` com `type: study`, matéria, tema, data e duração. O backend cria as quatro revisões vinculadas automaticamente; não as cadastre novamente.
- Para mover um estudo, use `update_activity` na atividade de origem. O backend ajusta as revisões pendentes conforme as regras BASIC e preserva as concluídas. Não replique o cálculo de datas na IA.
- Não use `generate_study_plan`, `preview_study_plan` ou `recalculate_future_plan` neste método. Se faltar informação para uma atividade, peça somente os campos necessários.
- Todas as gravações dependem do pedido do usuário e do escopo OAuth de escrita. Consulte o calendário após a operação e reporte o que foi efetivamente salvo.
