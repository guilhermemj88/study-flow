# Study Flow

Aplicação local para planejamento de estudos, provas, editais, questões, incidência, calendário e desempenho. O ChatGPT Business acessa os dados pelo servidor MCP do projeto; não há OpenAI API, Supabase ou banco externo.

## Arquitetura

```text
ChatGPT Business ── MCP HTTPS + OAuth 2.1/PKCE ──► servidor MCP local
                                                          │
Next.js local ────────────────────────────────────────────┤
                                                          ▼
                                               SQLite + uploads locais
```

O Next.js e o MCP compartilham stores que sempre recebem o usuário autenticado. O navegador usa uma sessão local HttpOnly; o ChatGPT usa tokens OAuth opacos. Apenas a porta do MCP é encaminhada pelo túnel HTTPS.

## Executar

Pré-requisito: Node.js 20.9 ou superior.

```bash
npm install
copy .env.example .env.local
npm run db:init
npm run dev:all
```

- Study Flow: [http://localhost:3000](http://localhost:3000)
- saúde do MCP: [http://127.0.0.1:3333/health](http://127.0.0.1:3333/health)
- endpoint MCP: `http://127.0.0.1:3333/mcp`

Crie uma conta no Study Flow antes de autorizar o conector. Para publicar o MCP por HTTPS e conectá-lo ao ChatGPT Business, siga [docs/MCP_SETUP.md](docs/MCP_SETUP.md).

O primeiro administrador deve ser promovido explicitamente depois de criar a conta:

```bash
npm run user:make-admin -- email@usuario.com
```

Reinicie a sessão e abra `http://localhost:3000/admin/chatgpt`. Nenhuma conta recebe papel administrativo automaticamente.

## Funcionalidades

- conta e sessão locais por usuário;
- calendário, matérias, assuntos, atividades e resultados;
- provas, editais e outras fontes, inclusive upload local de PDF/imagem;
- banco de questões, sessões de exercício e classificação de erros;
- incidência e desempenho;
- MCP Streamable HTTP com leitura e gravação de fontes, análises, questões, incidência, calendário e desempenho;
- OAuth 2.1 com Dynamic Client Registration, PKCE S256, access/refresh tokens e auditoria das ferramentas MCP;
- painel administrativo para usuários, clientes OAuth, diagnósticos autenticados e logs MCP sem credenciais.

## Stack e persistência

- Next.js 16, React 19 e TypeScript estrito;
- SQLite com `better-sqlite3` e migrations SQL em `db/migrations/`;
- SDK MCP TypeScript e Zod;
- arquivos em `data/uploads/<user-id>/sources/<source-id>/`;
- banco em `data/study-flow.sqlite` por padrão.

`data/` é ignorado pelo Git. Faça backup dessa pasta com o app e o MCP desligados.

## Validação

```bash
npm test
npm run lint
npm run build
```

Veja [docs/MCP_ARCHITECTURE.md](docs/MCP_ARCHITECTURE.md) e [docs/TESTING.md](docs/TESTING.md).
