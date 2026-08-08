# Configuração do Supabase

O repositório não contém credenciais. Os valores abaixo devem vir do seu próprio projeto Supabase.

## 1. Criar o projeto

1. Crie um projeto em [Supabase](https://supabase.com/dashboard).
2. Aguarde o banco ficar disponível.
3. Em **Connect → App Frameworks → Next.js**, copie a Project URL e a publishable key. Projetos antigos podem mostrar uma `anon` key legada; o SDK aceita essa chave pública, mas nunca use `service_role` no app.

## 2. Configurar o ambiente

Copie `.env.example` para `.env.local` e substitua somente os placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
```

`.env.local` está ignorado pelo Git. Não renomeie uma chave secreta para `NEXT_PUBLIC_`.

## 3. Aplicar a migration

A migration versionada em `supabase/migrations/20260808010000_phase_two.sql` cria tabelas, índices, triggers, RLS, policies e o bucket privado.

Com a [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Como alternativa, abra **SQL Editor** no dashboard, cole a migration completa e execute uma única vez. Não crie as tabelas manualmente por fora da migration.

## 4. Confirmar Auth

Em **Authentication → URL Configuration**:

- defina o Site URL local como `http://localhost:3000` durante o desenvolvimento;
- adicione `http://localhost:3000/auth/callback` às Redirect URLs;
- adicione também a URL equivalente de produção quando houver deploy.

O fluxo usa confirmação de e-mail se ela estiver habilitada nas configurações do projeto. Login, cadastro e logout usam cookies via `@supabase/ssr`; o Proxy protege todas as rotas fora de `/login`, `/cadastro` e `/auth/callback`.

## 5. Confirmar Storage

A migration cria `study-sources` com:

- acesso público desabilitado;
- limite de 20 MB;
- MIME types PDF, JPEG, PNG e WEBP;
- policies que aceitam apenas objetos cujo primeiro segmento do caminho é `auth.uid()`.

Em **Storage**, confirme que o bucket aparece como privado. Não marque o bucket como público. A aplicação gera URLs assinadas com validade de 60 segundos.

## 6. Auditar RLS

Em **Database → Tables**, confirme RLS habilitado nas tabelas `profiles`, `subjects`, `topics`, `study_plans`, `sources`, `study_plan_sources`, `activities`, `activity_results`, `questions`, `question_alternatives`, `question_attempts`, `activity_error_details`, `source_topic_stats`, `exercise_sessions` e `exercise_session_questions`.

Cada tabela possui policies separadas de SELECT, INSERT, UPDATE e DELETE para `authenticated`. Além de `auth.uid() = user_id`, foreign keys compostas `(resource_id, user_id)` bloqueiam vínculos entre donos diferentes.

Para validar com segurança:

1. crie duas contas normais A e B pela interface;
2. com A, crie matéria, atividade, fonte e questão;
3. saia e entre com B;
4. confirme listas vazias e tente consultar/alterar o UUID de A usando um cliente autenticado como B;
5. a resposta deve ser vazia ou rejeitada pela policy; B nunca deve receber o registro de A;
6. repita com o caminho de arquivo de A; B não deve obter URL assinada nem baixar o objeto.

Não use o SQL Editor ou uma `service_role` key nesse teste, pois esses contextos administrativos podem ignorar RLS.

## 7. Executar

```bash
npm install
npm run dev
```

Cadastre a primeira conta em `/cadastro`. O trigger `handle_new_user` cria perfil e plano ativo padrão. Consulte [TESTING.md](TESTING.md) para a matriz completa.

Referências oficiais: [SSR no Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control).
