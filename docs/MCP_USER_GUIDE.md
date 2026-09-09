# Conectar minha IA via MCP

1. Entre no Study Flow e abra **IA / Integrações** pelo menu ou por **Configurações → Conectar minha IA via MCP**.
2. Selecione **Minha IA via MCP** e clique em **Copiar URL**.
3. Adicione o Study Flow à sua IA seguindo um dos caminhos abaixo.
4. No login OAuth do Study Flow, use o mesmo e-mail exibido na área de integração e revise as permissões.
5. Ative o conector em uma conversa, peça uma consulta ao calendário e clique em **Atualizar estado** no Study Flow.

O endereço é compartilhado por todos. A autenticação é individual e determina os dados acessíveis. Copiar a URL não autoriza acesso.

## ChatGPT

Habilite o modo de desenvolvedor em **Configurações → Segurança e login**, quando disponível. Abra **Plugins**, adicione uma conexão chamada Study Flow e informe a URL pública completa terminada em `/mcp`. Use OAuth e conclua o login individual. Ative a conexão nas ferramentas da conversa.

A disponibilidade depende da conta e das políticas do workspace. [Instruções oficiais do ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Claude

Abra **Personalizar (Customize) → Conectores → + → Adicionar conector personalizado**. Informe Study Flow e a URL copiada. Deixe Client ID e segredo opcionais vazios, adicione o conector e use **Conectar** para fazer o login OAuth. Ative o conector na conversa.

Em Team e Enterprise, o proprietário pode precisar disponibilizar o conector no workspace antes do login de cada pessoa. [Instruções oficiais do Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Outros clientes MCP

Use os campos equivalentes no seu aplicativo; não existe um arquivo JSON universal entre clientes.

| Campo | Valor |
| --- | --- |
| Nome | Study Flow |
| URL | O endereço público copiado da tela, incluindo `/mcp` |
| Transporte | Streamable HTTP |
| Autenticação | OAuth 2.1, Authorization Code e PKCE S256 |
| Registro | Dynamic Client Registration, cliente público sem segredo, callback HTTPS |
| Escopos | `studyflow:read`; adicione `studyflow:write` para salvar alterações |

O cliente deve suportar descoberta OAuth e abrir o login no navegador. Clientes sem OAuth ainda não são atendidos; tokens pessoais estão reservados para uma evolução futura.

## Estado e controle do acesso

- **Não conectada:** adicione a conexão na IA e conclua o OAuth.
- **Autorizada · aguardando uso:** ative o conector e faça uma consulta.
- **Conexão confirmada:** houve uma chamada autenticada com autorização ativa. Não é uma verificação de disponibilidade em tempo real.
- **Autorização inativa:** reconecte e faça o login novamente.

Se não aparecerem seus estudos, confira o e-mail usado no OAuth. Se a IA não alcançar o serviço, confira a URL completa e tente novamente. Uma URL pública indisponível será indicada na tela, sem oferecer endereços locais como alternativa para serviços na nuvem.

**Sem IA** salva sua preferência de uso manual. Autorizações anteriores permanecem ativas até você usar **Revogar meus acessos MCP** e confirmar. A revogação afeta apenas sua conta, preserva seus estudos e permite uma nova conexão por OAuth.

**IA do Study Flow** fica disponível quando a instalação possui um provider configurado. Ao selecioná-la, você pode testar disponibilidade, pedir recomendações de revisão e controlar a permissão de processamento externo dos seus materiais. Essa escolha é independente da conexão MCP. Consulte a [documentação da IA integrada](AI_GATEWAY.md).

**Tokens pessoais / Personal Access Tokens** continuam indisponíveis nesta versão.
