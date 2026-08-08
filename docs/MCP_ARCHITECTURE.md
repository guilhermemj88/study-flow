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

## Ferramentas

Leitura: `list_sources`, `get_source`, `get_source_file`, `get_active_plan`, `get_plan_sources`, `list_questions`, `list_calendar`, `get_activity`, `get_performance`.

Escrita: `create_source`, `save_source_analysis`, `save_source_topics`, `save_incidence`, `save_questions`, `create_activity`, `update_activity`.

Não existe ferramenta de SQL arbitrário, leitura de caminho arbitrário, exclusão destrutiva ou execução de comandos.
