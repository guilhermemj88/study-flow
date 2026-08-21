# Arquitetura MCP do Study Flow

## Fluxo de dados

```text
ChatGPT Business
        │
        │ HTTPS /mcp (Streamable HTTP)
        │ OAuth 2.1 + PKCE S256
        ▼
Servidor MCP Study Flow — 127.0.0.1:3333
        │
        ├── tools validadas com Zod
        ├── escopos studyflow:read / studyflow:write
        ├── auditoria local em mcp_audit_log
        ▼
Stores locais com user_id obrigatório
        │
        ├── SQLite: usuários, planos, fontes, questões, incidência,
        │           atividades, calendário, tentativas e desempenho
        └── data/uploads/<user-id>/...: PDF e imagens
```

O ChatGPT faz a pesquisa e a interpretação. As ferramentas MCP apenas entregam dados locais autorizados ou persistem resultados estruturados. O projeto não chama a OpenAI API.

O `studyMode` pertence ao plano ativo. As ferramentas avançadas do planejador recusam planos `basic`; `get_active_plan` expõe o modo e `list_calendar` retorna também os metadados das revisões. `create_activity` e `update_activity` foram mantidas como pontos de entrada compatíveis: ao criar um estudo em um plano `basic`, o mesmo serviço de domínio usado pela interface cria as quatro revisões idempotentes.

## Limites de rede

- Next.js escuta localmente e não precisa ser publicado.
- SQLite nunca abre uma porta de rede.
- uploads nunca são servidos por URL pública; `get_source_file` os entrega como conteúdo MCP após OAuth.
- o túnel HTTPS aponta somente para `127.0.0.1:3333`.
- endpoints OAuth ficam na mesma origem pública do MCP porque são necessários à autorização do ChatGPT.

## Autorização e isolamento

O conector usa Dynamic Client Registration, Authorization Code, PKCE S256 e refresh token com rotação. O login da autorização é a própria conta local do Study Flow. Tokens são aleatórios e somente seus hashes são persistidos.

Cada store é instanciado com o `user_id` resolvido do access token. IDs recebidos de ferramentas nunca determinam o usuário e todas as consultas incluem a propriedade. Ferramentas de escrita também exigem `studyflow:write`.

Redirect URIs aceitos por padrão pertencem ao domínio `chatgpt.com`. Redirects HTTP de localhost só são aceitos quando `MCP_ALLOW_INSECURE_DEV_REDIRECTS=true`, destinado a testes locais.

## Administração local

Usuários novos recebem sempre `role=user`. A promoção para `role=admin` é explícita pelo comando `npm run user:make-admin -- email@usuario.com`. Páginas e APIs `/admin/*` repetem a autorização no servidor e retornam `403` para usuários comuns; o último administrador não pode ser rebaixado.

O painel não armazena configuração no navegador e nunca entrega hashes de senha, access tokens, refresh tokens ou segredos. Clientes OAuth podem ser revogados, o que revoga seus tokens. A indicação “ChatGPT conectado” depende de cliente com redirect do `chatgpt.com`, autorização ainda ativa e chamada MCP autenticada auditada para o mesmo cliente.

Diagnósticos administrativos são auditados em `admin_audit_log` com horário, administrador, ação, resultado, duração e erro resumido. O teste de escrita usa as próprias ferramentas MCP e remove a atividade, o assunto e a matéria temporários ao final.

## Ferramentas

Leitura: `get_current_user`, `list_sources`, `get_source`, `get_source_file`, `get_active_plan`, `get_plan_sources`, `list_questions`, `list_calendar`, `get_activity`, `get_performance`.

Escrita: `create_source`, `save_source_analysis`, `save_source_topics`, `save_incidence`, `save_questions`, `create_activity`, `update_activity`.

Não existe ferramenta de SQL arbitrário, leitura de caminho arbitrário, exclusão destrutiva ou execução de comandos.
