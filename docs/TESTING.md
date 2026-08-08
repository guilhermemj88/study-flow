# Matriz de testes

## Automatizados e locais

```bash
npm install
npm test
npm run lint
npm run build
```

`npm test` cobre a ordem determinística e a não repetição da seleção inicial de questões. Lint e build verificam todos os componentes, rotas e tipos mesmo sem credenciais.

## Integração com um projeto Supabase

Estes testes exigem `.env.local`, migration aplicada e acesso ao projeto; não podem ser simulados com credenciais inventadas.

- cadastro, confirmação de e-mail quando habilitada, login, reload da sessão e logout;
- bloqueio das rotas principais para usuário anônimo;
- isolamento com dois usuários, inclusive tentativa direta de ler/alterar IDs do outro;
- upload válido, rejeição de tipo inválido e arquivo acima de 20 MB;
- abertura por URL assinada e bloqueio do arquivo para outro usuário;
- criação/edição/remoção de fonte e persistência após reload;
- seleção individual, selecionar todas e limpar fontes do plano;
- cadastro manual de questão e alternativas;
- filtros por fonte, matéria, tema, ano e status;
- sessão com uma questão por vez, correção, explicação, motivo do erro e resultado final;
- atividade de banco vinculada ao calendário e atualização do desempenho;
- conclusão manual com tema/subtema/motivo do erro;
- incidência manual acompanhada da base;
- validação visual em 1440 px, 768 px e 390 px.

Para o teste de dois usuários, siga o procedimento sem `service_role` descrito em [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Registre o resultado e a data no processo de release; não versione e-mails, senhas, tokens ou arquivos privados de teste.
