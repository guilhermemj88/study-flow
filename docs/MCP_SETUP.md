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

## 4. Conectar ao ChatGPT Business

No workspace Business, habilite o modo de desenvolvedor para conectores/MCP nas configurações administrativas, abra as configurações de conectores e crie um conector com:

```text
https://mcp.seudominio.com/mcp
```

Escolha autenticação OAuth quando solicitado. O ChatGPT descobre os endpoints, registra um cliente e abre a página “Conectar ao Study Flow”. Entre com a mesma conta criada no app local e autorize.

Em uma conversa, habilite o conector e teste pedidos como:

- “Liste minhas fontes ativas no Study Flow.”
- “Leia esta prova local, classifique as questões e salve a análise.”
- “Mostre meu desempenho das últimas quatro semanas.”
- “Crie amanhã uma atividade de 45 minutos de Direito Constitucional.”

## 5. Operação e segurança

- mantenha o MCP ligado para o ChatGPT conseguir acessar o computador;
- mantenha `MCP_HOST=127.0.0.1`; o túnel é quem fornece HTTPS;
- a URL em `MCP_PUBLIC_URL` deve ser exatamente a origem vista pelo ChatGPT;
- não exponha `data/`, o arquivo SQLite ou a aplicação web;
- faça backup de `data/` com os processos parados;
- trate a conta local e o acesso ao túnel como credenciais privadas;
- consulte `mcp_audit_log` no SQLite ao investigar operações do conector.

Referências oficiais: [construir um servidor MCP](https://developers.openai.com/plugins/build/mcp-server), [conectar e testar no ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [autenticação MCP](https://developers.openai.com/plugins/build/auth) e [limitações dos Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
