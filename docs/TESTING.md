# Matriz de testes

## Automatizados

```bash
npm test
npm run lint
npm run build
```

Os testes locais cobrem o motor de seleção, migrations SQLite, autenticação, isolamento entre usuários, uploads, OAuth/PKCE e stores usados pela UI e pelo MCP.

## Validação manual local

1. Execute `npm run dev:all`.
2. Crie dois usuários e confirme que cada um vê apenas seus dados.
3. Em um usuário, crie matéria, atividade, fonte com PDF, questão e sessão de exercício.
4. Recarregue o navegador e confirme a persistência.
5. Confirme `GET http://127.0.0.1:3333/health`.
6. Confirme que `POST /mcp` sem Bearer retorna `401` e `WWW-Authenticate`.
7. Execute o fluxo OAuth/PKCE com o MCP Inspector e chame ferramentas de leitura e escrita.

## Validação do túnel e ChatGPT Business

- a URL pública responde em `/health` por HTTPS;
- `/.well-known/oauth-protected-resource/mcp` anuncia o recurso público correto;
- `/mcp` sem token não expõe dados;
- o conector do ChatGPT abre o login local OAuth e conclui a autorização;
- `list_sources` retorna apenas o usuário autorizado;
- `create_activity` e `save_questions` aparecem na UI após recarregar;
- `get_source_file` permite interpretar um upload local;
- o SQLite e a porta 3000 não estão publicados.

Não versione e-mails, senhas, tokens OAuth, banco ou arquivos privados usados nos testes.
