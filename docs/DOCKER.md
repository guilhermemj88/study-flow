# Deploy com Docker

O repositório inclui uma imagem Node.js 24 para Next.js e MCP e um Compose com os serviços `study-flow-web` e `study-flow-mcp`. Ambos montam `/opt/study-flow-data:/app/data`, preservando o banco SQLite e os uploads do deploy existente. Requer Docker com containers Linux e Docker Compose v2.

## Instalação nova

Na raiz do clone:

```bash
docker compose up -d --build
docker compose ps
```

O web executa `npm run db:init` e depois `next start --hostname 0.0.0.0 --port 3030`. O MCP executa `npm run mcp:start` após o web ficar saudável, evitando que os dois processos apliquem migrations simultaneamente na primeira inicialização. Todas as migrations, inclusive 007 e 008, estão na imagem. O diretório de dados é criado pelo bind mount quando necessário.

O Dockerfile usa `npm ci` com o lockfile e mantém as dependências de desenvolvimento porque os comandos existentes de banco/MCP usam `tsx` e a configuração Next.js usa TypeScript. A imagem final recebe explicitamente build, dependências, código, configuração e migrations. `.dockerignore` exclui ambientes locais, dados, bancos, chaves, logs, Git e artefatos da máquina; nenhum dado local é copiado para a imagem. O runtime mantém o usuário padrão da imagem Node (root), compatível com o bind mount existente e com a criação inicial de `/opt/study-flow-data`.

O web fica em `http://127.0.0.1:3030`; a saúde do MCP fica em `http://127.0.0.1:3333/health`. O Compose publica as duas portas no loopback do host. Dentro do container, o MCP escuta em `0.0.0.0` com autorização explícita `MCP_ALLOW_NON_LOOPBACK=true`; as validações de Host e de headers encaminhados continuam ativas.

Os diagnósticos administrativos do web usam `MCP_INTERNAL_URL=http://study-flow-mcp:3333` para alcançar o outro container. O MCP permite esse hostname específico, além de loopback e do hostname público configurado; hosts desconhecidos continuam bloqueados. Fora do Docker, o endereço interno padrão permanece `http://127.0.0.1:3333` (ou a porta `MCP_PORT`). A origem pública OAuth permanece definida exclusivamente por `MCP_PUBLIC_URL`.

Mantenha o proxy/túnel HTTPS do servidor encaminhando para essas portas. A origem MCP padrão é `https://mcp-study-flow.gmjtelecom.com.br`, e o endpoint é essa origem com `/mcp`. Outra instalação deve definir `MCP_PUBLIC_URL` com sua própria origem HTTPS, sem `/mcp`. Essa variável é passada ao web (inclusive `/ia`) e ao MCP. Se o proxy estiver em outro container, encaminhe preservando o Host público configurado. Para publicação em outra interface do host, configure `STUDY_FLOW_BIND_ADDRESS` e/ou `MCP_BIND_ADDRESS` no ambiente conforme a rede do deploy.

Crie sua conta pela aplicação. Para promover o primeiro administrador:

```bash
docker compose exec study-flow-web npm run user:make-admin -- email@usuario.com
```

## Ambiente e AI Gateway

O Compose aceita variáveis exportadas no shell, um `.env` na raiz ou um arquivo indicado por `--env-file`. Para reutilizar o formato de `.env.example`:

```bash
cp .env.example .env.production
# Configure os valores necessários apenas nesse arquivo local.
docker compose --env-file .env.production up -d --build
```

Arquivos `.env*` privados são ignorados pelo Git e pelo Docker. O Compose não carrega `.env.local` automaticamente: use `--env-file .env.local` caso esse seja o arquivo do servidor. `STUDY_FLOW_DATA_DIR`, `MCP_HOST` e `MCP_PORT` do exemplo local não substituem os valores internos fixados para os containers.

Somente o web recebe as sete variáveis do AI Gateway: `STUDY_FLOW_AI_ENABLED`, `STUDY_FLOW_AI_PROVIDER`, `STUDY_FLOW_AI_BASE_URL`, `STUDY_FLOW_AI_MODEL`, `STUDY_FLOW_AI_API_KEY`, `STUDY_FLOW_AI_TIMEOUT_MS` e `STUDY_FLOW_AI_EXTRA_BODY_JSON`. A chave vem exclusivamente do ambiente; não há chave, segredo OAuth ou credencial no Compose ou nos argumentos de build. O MCP não recebe a chave de IA. Sem configuração, a IA integrada permanece desabilitada e o restante da aplicação funciona normalmente. Veja os valores e contratos em [AI_GATEWAY.md](AI_GATEWAY.md).

Essas variáveis são lidas pelo backend em runtime. Após alterá-las, recrie o web com o mesmo arquivo de ambiente; não é necessário recompilar a imagem:

```bash
docker compose --env-file .env.production up -d --no-deps --force-recreate study-flow-web
```

## Atualização de uma instalação existente

Antes de atualizar, pare os dois serviços e faça backup de `/opt/study-flow-data`. Preserve as configurações privadas do servidor fora dos arquivos versionados. Incorpore o commit aprovado ao checkout e execute `docker compose up -d --build`, acrescentando o mesmo `--env-file` utilizado no deploy. O web aplica apenas as migrations pendentes antes de iniciar; o MCP aguarda o web ficar saudável.

Não substitua os arquivos OAuth atuais por cópias antigas do servidor. O parser de formulários suporta tanto `request.body` já processado pelo Express quanto o fluxo sem parser prévio, mantendo autorização genérica, PKCE, refresh tokens e `authorizationPage(authorization)`.
