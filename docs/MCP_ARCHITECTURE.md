# Arquitetura MCP do Study Flow

## Fluxo de dados

```text
ChatGPT, Claude ou outro cliente MCP com OAuth
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

No modo MCP, a IA do usuário faz a pesquisa e a interpretação. As ferramentas MCP apenas entregam dados locais autorizados ou persistem resultados estruturados. O [AI Gateway opcional](AI_GATEWAY.md) é um fluxo separado no backend Next.js; o MCP não o utiliza.

O `studyMode` pertence ao plano ativo. As ferramentas avançadas do planejador recusam planos `basic`; `get_active_plan` expõe o modo e `list_calendar` retorna também os metadados das revisões. `list_plans`, `activate_plan`, `rename_plan`, `archive_plan` e `restore_plan` reutilizam o mesmo ciclo de vida da interface e nunca alteram a metodologia ou regeneram atividades. `create_activity` e `update_activity` foram mantidas como pontos de entrada compatíveis: ao criar um estudo em um plano `basic`, o mesmo serviço de domínio usado pela interface cria as quatro revisões idempotentes.

## Limites de rede

- Next.js escuta localmente e não precisa ser publicado.
- SQLite nunca abre uma porta de rede.
- uploads nunca são servidos por URL pública; `get_source_file` os entrega como conteúdo MCP após OAuth.
- o túnel HTTPS aponta somente para `127.0.0.1:3333`.
- endpoints OAuth ficam na mesma origem pública do MCP porque são necessários à autorização do ChatGPT.

## Autorização e isolamento

O conector usa Dynamic Client Registration, Authorization Code, PKCE S256 e refresh token com rotação. O login da autorização é a própria conta local do Study Flow. Tokens são aleatórios e somente seus hashes são persistidos.

Cada store é instanciado com o `user_id` resolvido do access token. IDs recebidos de ferramentas nunca determinam o usuário e todas as consultas incluem a propriedade. Ferramentas de escrita também exigem `studyflow:write`.

O registro dinâmico aceita callbacks HTTPS de clientes MCP, incluindo ChatGPT e Claude, sem credenciais embutidas ou fragmentos. A autorização e a troca do código exigem correspondência exata com o callback registrado e PKCE S256. A página de consentimento mostra o aplicativo de destino e os escopos solicitados. Redirects HTTP de localhost só são aceitos quando `MCP_ALLOW_INSECURE_DEV_REDIRECTS=true`, destinado a testes locais.

## Gestão individual de IA e MCP

A área `/ia`, acessível pelo menu “IA / Integrações” e pelas Configurações, apresenta “IA do Study Flow”, “Minha IA via MCP” e “Sem IA”. A IA nativa depende de configuração válida do AI Gateway. A migration `007_user_ai_preferences.sql` persiste a escolha por conta; usuários com uma autorização existente continuam inicialmente no modo MCP. A migration 008 acrescenta privacidade e auditoria da IA integrada sem mudar OAuth ou os valores dos modos existentes.

A página e a API `/api/integrations/ai` exigem sessão autenticada, inclusive para usuários comuns. Somente nome, e-mail, preferência, URL pública validada e evidências resumidas dessa conta são enviados à interface. A API ignora a identidade fornecida pelo cliente: mutations aceitam apenas ações explicitamente validadas e rejeitam campos adicionais. As respostas usam `private, no-store`.

O estado diferencia ausência de conexão, autorização ativa aguardando uso, chamada autenticada confirmada e autorização inativa. A evidência cruza usuário, cliente, recurso, validade e revogação; timestamps globais de clientes não comprovam conexão individual. Uma confirmação histórica não afirma disponibilidade do servidor em tempo real. Endereços locais, ausentes ou inválidos não são apresentados como URLs públicas.

A URL vem do mesmo `MCP_PUBLIC_URL` usado pelo servidor existente, sempre com `/mcp`. Não há servidor ou URL por usuário; o isolamento das ferramentas continua exclusivamente na autenticação. A preferência de IA não é usada para selecionar usuário, modificar escopos ou invalidar integrações existentes.

“Sem IA” salva a preferência e informa quando ainda existem autorizações. A ação explícita “Revogar meus acessos MCP” revoga access/refresh tokens e invalida códigos pendentes somente da conta autenticada, preservando o registro compartilhado do cliente e os acessos de outras pessoas. Uma nova conexão requer OAuth novamente.

O componente de autenticação reserva uma seção “Tokens pessoais / Personal Access Tokens”, marcada como indisponível. Não há emissão, armazenamento ou endpoint de tokens permanentes. Consulte o [guia de conexão do usuário](MCP_USER_GUIDE.md).

## Administração local

Usuários novos recebem sempre `role=user`. A promoção para `role=admin` é explícita pelo comando `npm run user:make-admin -- email@usuario.com`. Páginas e APIs `/admin/*` repetem a autorização no servidor e retornam `403` para usuários comuns; o último administrador não pode ser rebaixado.

O painel não armazena configuração no navegador e nunca entrega hashes de senha, access tokens, refresh tokens ou segredos. Clientes OAuth podem ser revogados, o que revoga seus tokens. A indicação “ChatGPT conectado” depende de cliente com redirect do `chatgpt.com`, autorização ainda ativa e chamada MCP autenticada auditada para o mesmo cliente.

Diagnósticos administrativos são auditados em `admin_audit_log` com horário, administrador, ação, resultado, duração e erro resumido. O teste de escrita usa as próprias ferramentas MCP e remove a atividade, o assunto e a matéria temporários ao final.

## Ferramentas

### Habilidades e catálogo compartilhado

O MCP oferece ferramentas (o que a IA pode fazer) e habilidades (como seguir os fluxos recomendados). As habilidades oficiais ficam em `mcp/skills/*/SKILL.md`. O leitor `mcp/skills/catalog.ts` deriva nome, descrição e instruções desses arquivos, sem duplicar regras na interface.

A rota autenticada `/ia` consulta esse catálogo no servidor a cada renderização e envia ao navegador somente nome, descrição e disponibilidade. A lista é dinâmica em relação aos arquivos incluídos na instalação, não uma consulta de disponibilidade ao serviço remoto. Catálogo vazio, ausente ou inválido produz um aviso independente do estado OAuth. Atualizações dos arquivos aparecem ao recarregar a página.

O servidor registra recursos MCP `studyflow://skills/<identificador>` para clientes que conseguem descobri-los e as ferramentas de compatibilidade `list_skills` e `get_skill`. Expor recursos não garante suporte nativo a Skills em todo cliente. Essas consultas passam pela mesma autenticação OAuth do endpoint `/mcp`; não executam fluxos, não concedem escrita e não chamam o AI Gateway. Instruções completas são entregues ao cliente MCP que as solicita, nunca à tela `/ia`.

O Dockerfile existente já inclui a pasta `mcp` nos serviços web e MCP. Ambos devem usar a mesma versão dos arquivos. Se o catálogo falhar, as demais ferramentas continuam disponíveis e as consultas pelo catálogo podem ser tentadas novamente.

### Operações de estudo

Leitura: `get_current_user`, `list_sources`, `get_source`, `get_source_file`, `get_active_plan`, `list_plans`, `get_plan_sources`, `list_questions`, `list_calendar`, `get_activity`, `get_performance`.

Escrita: `activate_plan`, `rename_plan`, `archive_plan`, `restore_plan`, `create_source`, `save_source_analysis`, `save_source_topics`, `save_incidence`, `save_questions`, `create_activity`, `update_activity`.

Não existe ferramenta de SQL arbitrário, leitura de caminho arbitrário, exclusão de calendário, exclusão destrutiva ou execução de comandos.
