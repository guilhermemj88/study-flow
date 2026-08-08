# Study Flow

MVP de uma aplicação web para planejamento de estudos com calendário mensal, registro rápido de resultados e persistência local. A interface foi desenhada para deixar o plano do mês visível, reduzir cliques e destacar o estado de cada atividade.

## O que está incluído

- Calendário mensal responsivo com estados visuais: no prazo, atenção, reforço, atrasada e concluída.
- Criação, edição, reagendamento e exclusão de atividades.
- Fluxos de conclusão específicos para estudo e para questões/revisões/reforços.
- Cálculo automático de aproveitamento e armazenamento dos resultados.
- Página **Hoje** com itens críticos e atrasados primeiro.
- Página **Desempenho** com totais e aproveitamento por matéria.
- CRUD local de matérias e assuntos.
- Dados de demonstração relativos ao mês atual.
- Persistência no `localStorage`, sem autenticação ou serviços externos.

## Stack

- Next.js 16 com App Router
- React 19
- TypeScript em modo estrito
- Tailwind CSS 4
- Lucide React para ícones
- ESLint com as regras recomendadas do Next.js

## Como executar

Pré-requisito: Node.js 20.9 ou superior. O projeto foi validado com Node.js 24 LTS.

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Outros comandos:

```bash
npm run lint
npm run build
npm start
```

## Estrutura principal

```text
src/
├── app/                  # Rotas, metadata e estilos globais
├── components/           # Calendário, atividades e páginas do dashboard
├── hooks/                # Estado da aplicação e mutações persistidas
├── lib/
│   ├── study-engine/     # Pontos de extensão do futuro motor adaptativo
│   ├── mock-data.ts      # Conteúdo inicial de demonstração
│   └── storage.ts        # Persistência local versionada
└── types/                # Modelos TypeScript do domínio
```

Os componentes não contêm regras do futuro algoritmo adaptativo. As funções `processStudyResult`, `processExerciseResult`, `calculateNextReview` e `calculatePriority` ficam isoladas em `src/lib/study-engine` e, neste MVP, não criam atividades automaticamente.

## Dados locais

Os dados são armazenados sob a chave `study-flow:data:v1` do `localStorage`. Em **Configurações → Restaurar demonstração**, é possível recuperar o conjunto inicial. Essa ação substitui alterações feitas no navegador atual.

Não há chaves de API, arquivos `.env`, banco externo, telemetria própria ou dados sensíveis neste projeto.
