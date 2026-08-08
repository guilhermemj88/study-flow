# Study Flow

Aplicação web para planejamento de estudos com calendário, fontes oficiais, banco de questões e desempenho persistente. A fase 2 preserva o dark theme e os fluxos do MVP, substituindo o `localStorage` por dados privados no Supabase.

## Funcionalidades

- autenticação por e-mail e senha, sessão persistente e rotas protegidas;
- calendário responsivo com criação, conclusão, edição, reagendamento e exclusão de atividades;
- matérias, assuntos e plano ativo persistidos por usuário;
- biblioteca de provas, editais e outras fontes, com upload privado de PDF/imagem;
- seleção independente das fontes usadas para incidência e para questões;
- cadastro manual de questões, filtros e sessões de exercício persistentes;
- seleção determinística: nunca respondidas, erradas e depois as demais;
- registro opcional do tema, subtema e motivo dos erros;
- desempenho consolidado a partir de atividades e tentativas salvas no banco;
- incidência por fonte editável manualmente, sempre acompanhada de sua base.

IA, análise automática, servidor MCP, pagamentos e recursos sociais não fazem parte desta fase. A arquitetura futura do MCP está apenas documentada.

## Stack

- Next.js 16, App Router e Proxy
- React 19 e TypeScript estrito
- Tailwind CSS 4
- Supabase Auth, PostgreSQL e Storage
- `@supabase/ssr` e `@supabase/supabase-js`
- Lucide React

## Configuração

Pré-requisito: Node.js 20.9 ou superior.

1. Siga [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
2. Crie `.env.local` a partir de `.env.example`.
3. Instale e execute:

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Sem as variáveis do Supabase, o build continua válido e a tela de login explica a configuração pendente; as áreas autenticadas não ficam acessíveis.

Comandos de validação:

```bash
npm test
npm run lint
npm run build
```

## Estrutura principal

```text
src/
├── app/                    # rotas, Proxy e estilos
├── components/             # UI por domínio
├── hooks/                  # estado assíncrono e mutações
├── lib/
│   ├── auth/               # operações de autenticação
│   ├── data/               # repositories; a UI não consulta tabelas diretamente
│   ├── study-engine/       # seleção de questões e extensões adaptativas
│   └── supabase/           # clientes browser/server e renovação da sessão
└── types/                  # modelos TypeScript
supabase/migrations/        # schema, constraints, índices, RLS e Storage
docs/                       # configuração, testes e desenho do MCP futuro
```

## Decisões de dados e segurança

O Supabase é a fonte principal; não há persistência de domínio em `localStorage`. Todas as tabelas pessoais possuem `user_id` (o perfil usa o próprio `id` de `auth.users`), RLS para as quatro operações e chaves estrangeiras compostas que impedem relações entre recursos de usuários diferentes.

As alternativas foram normalizadas em `question_alternatives`, em vez de JSONB. Isso permite constraints para rótulo/ordem, exclusão em cascata, evolução independente e políticas de isolamento coerentes com a questão proprietária.

Arquivos ficam no bucket privado `study-sources`, sob `user-id/sources/source-id/`, e são abertos por URL assinada curta. Nenhuma `service_role` key é usada no frontend ou versionada.

Veja também [docs/MCP_ARCHITECTURE.md](docs/MCP_ARCHITECTURE.md) e [docs/TESTING.md](docs/TESTING.md).
