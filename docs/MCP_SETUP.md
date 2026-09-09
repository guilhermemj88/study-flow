# Conectar o Study Flow ao ChatGPT Business

## 1. Iniciar os serviços locais

Crie `.env.local` a partir de `.env.example`. A primeira execução cria automaticamente o SQLite e a pasta de uploads.

```bash
npm install
npm run db:init
npm run dev:all
```

O comando combinado inicia o Next.js em `localhost:3000` e o MCP em `127.0.0.1:3333`. Também é possível usar terminais separados com `npm run dev` e `npm run mcp:dev`.

Abra `http://localhost:3000`, crie sua conta e valide `http://127.0.0.1:3333/health`.

Promova explicitamente a conta que administrará a integração e entre novamente:

```bash
npm run user:make-admin -- email@usuario.com
```

O comando promove somente uma conta local já existente. Não há administrador automático. Depois, abra `http://localhost:3000/admin/chatgpt`.

## 2. Testar o MCP localmente

O MCP exige OAuth inclusive localmente. Para um cliente local como o MCP Inspector, defina temporariamente:

```dotenv
MCP_ALLOW_INSECURE_DEV_REDIRECTS=true
MCP_PUBLIC_URL=http://127.0.0.1:3333
```

Reinicie o MCP e execute:

```bash
npm run mcp:inspect
```

Use `http://127.0.0.1:3333/mcp`. Concluído o teste, volte `MCP_ALLOW_INSECURE_DEV_REDIRECTS=false`.

## 3. Expor somente o MCP por HTTPS

Você precisa de uma URL HTTPS alcançável pelo ChatGPT. Um túnel Cloudflare é uma opção; não publique a porta 3000 nem a pasta `data`.

Teste rápido apenas de HTTPS, saúde e discovery, com URL temporária:

```bash
cloudflared tunnel --url http://127.0.0.1:3333
```

Copie a URL `https://...trycloudflare.com` para `MCP_PUBLIC_URL`, sem `/mcp`, e reinicie o MCP. Quick Tunnels têm URL aleatória e não suportam SSE; portanto, não são a opção indicada para a conexão MCP do ChatGPT. Use-os somente para validar `/health` e os endpoints `/.well-known/...`.

Para conectar o ChatGPT, crie um túnel nomeado e um hostname estável no seu domínio:

```bash
cloudflared tunnel login
cloudflared tunnel create study-flow-mcp
cloudflared tunnel route dns study-flow-mcp mcp.seudominio.com
```

Exemplo de configuração do `cloudflared`:

```yaml
tunnel: SEU_TUNNEL_ID
credentials-file: CAMINHO_PARA_SEU_ARQUIVO_JSON
ingress:
  - hostname: mcp.seudominio.com
    service: http://127.0.0.1:3333
  - service: http_status:404
```

Inicie com `cloudflared tunnel run study-flow-mcp`, defina `MCP_PUBLIC_URL=https://mcp.seudominio.com` e reinicie `npm run mcp:start`.

Valide:

```text
https://mcp.seudominio.com/health
https://mcp.seudominio.com/.well-known/oauth-protected-resource/mcp
https://mcp.seudominio.com/mcp
```

O último endpoint deve responder `401` sem OAuth; isso é esperado.

Use **Testar MCP** no painel administrativo para verificar separadamente servidor local, descoberta OAuth, túnel e acesso público. O teste **Ferramentas** usa uma autorização OAuth temporária; o teste **Leitura e escrita** cria uma atividade `__mcp_test__...` e confirma a remoção automática sem deixar resíduos de estudo.

## 4. Conectar ao ChatGPT Business

No ChatGPT, abra **Configurações → Segurança e login → Modo de desenvolvedor** e habilite-o. A disponibilidade pode depender da política do workspace Business. Depois, abra a [página Plugins do ChatGPT](https://chatgpt.com/plugins), use o botão de adicionar e cadastre:

```text
https://mcp.seudominio.com/mcp
```

Escolha autenticação OAuth quando solicitado. O ChatGPT descobre os endpoints, registra um cliente e abre a página “Conectar ao Study Flow”. Entre com a mesma conta criada no app local e autorize.

O botão **Conectar ao ChatGPT** do painel apenas copia o endpoint validado e abre a página correta do ChatGPT. A conexão só é marcada como concluída quando o Study Flow encontra as três evidências reais: cliente ChatGPT registrado, autorização OAuth ativa e chamada MCP autenticada.

Em uma conversa, habilite o conector e teste pedidos como:

- “Liste minhas fontes ativas no Study Flow.”
- “Leia esta prova local, classifique as questões e salve a análise.”
- “Mostre meu desempenho das últimas quatro semanas.”
- “Crie amanhã uma atividade de 45 minutos de Direito Constitucional.”

## 5. Operação e segurança

- mantenha o MCP ligado para o ChatGPT conseguir acessar o computador;
- na execução direta, mantenha `MCP_HOST=127.0.0.1`; no [Docker](DOCKER.md), use `0.0.0.0` com `MCP_ALLOW_NON_LOOPBACK=true` e publique a porta no loopback do host para o túnel HTTPS;
- a URL em `MCP_PUBLIC_URL` deve ser exatamente a origem vista pelo ChatGPT;
- não exponha `data/`, o arquivo SQLite ou a aplicação web;
- faça backup de `data/` com os processos parados;
- trate a conta local e o acesso ao túnel como credenciais privadas;
- use `/admin/mcp-logs` para investigar operações sem expor tokens, senhas, segredos ou payloads;
- revogar um cliente OAuth no painel invalida também seus tokens locais;
- nunca remova o último administrador; essa regra também é aplicada no servidor.

Referências oficiais: [construir um servidor MCP](https://developers.openai.com/plugins/build/mcp-server), [conectar e testar no ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [autenticação MCP](https://developers.openai.com/plugins/build/auth) e [limitações dos Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
