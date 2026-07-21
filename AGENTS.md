# AGENTS.md

## Projeto

Este repositorio e um chat com frontend React/Vite e API Node local com persistencia em SQLite.

Arquivos canonicos:
- `src/App.tsx`: estrutura da interface e fluxos da UI.
- `src/App.css`: layout, responsividade e aparencia.
- `src/index.css`: reset e base visual global.
- `server/runtimeDatabase.mjs`: modelo de dados, persistencia, busca de memoria e operacoes do chat.
- `server/index.mjs`: endpoints HTTP locais.

Leia tambem `CONTEXT.md` antes de mexer em UI ou comportamento central.

## O que e `pseudo-index.jsp`

`pseudo-index.jsp` nao faz parte do app em execucao.

Ele e um pseudo-codigo conceitual enviado pelo usuario para representar ideias de produto, regras de negocio e direcao desejada para o motor de memoria. Ele serve como referencia de conceito, nao como fonte canonica de implementacao.

Interpretacao correta:
- ele descreve intencoes de arquitetura e comportamento;
- ele pode divergir do schema real, da UI real e dos nomes reais do projeto;
- ele pode conter trechos incompletos, simplificados ou nao totalmente consistentes;
- ele nao deve ser tratado como codigo pronto para copiar cegamente.

## Regras ao usar `pseudo-index.jsp`

1. Nao alterar `pseudo-index.jsp` a menos que o usuario peca explicitamente.
2. Nao importar, executar, renomear ou integrar esse arquivo ao runtime.
3. Use o pseudo apenas como especificacao conceitual complementar.
4. Antes de implementar qualquer ideia do pseudo, mapeie essa ideia para os arquivos canonicos reais do projeto.
5. Preserve a arquitetura atual: React no frontend, API local Node, persistencia em SQLite.
6. Preserve os invariantes de UX definidos em `CONTEXT.md`.
7. Nao assumir que todos os trechos do pseudo devem ser aplicados; implemente apenas o que o usuario selecionar.
8. Quando o pseudo conflitar com o codigo real, com o schema real ou com instrucoes explicitas do usuario, prevalece o codigo canonico e a instrucao atual do usuario.
9. Ao portar uma ideia do pseudo, adapte nomes, tipos, tabelas, prompts e fluxos ao projeto atual em vez de tentar reproduzir a estrutura literalmente.
10. Sempre validar as mudancas no projeto real com testes, lint e build quando aplicavel.

## Heuristica de uso

Quando o usuario citar `pseudo-index.jsp`, siga esta ordem:
- identificar qual conceito do pseudo foi pedido;
- localizar onde isso vive hoje no projeto real;
- implementar so o recorte solicitado;
- evitar expandir o escopo para outras ideias do pseudo sem autorizacao;
- explicar no fim o que foi adaptado do conceito para a arquitetura real.

## Anti-patterns

- tratar o pseudo como fonte de verdade acima de `src/App.tsx` e `server/runtimeDatabase.mjs`;
- copiar estruturas inexistentes sem migracao real de schema;
- introduzir comportamento nao pedido so porque aparece no pseudo;
- quebrar a UI atual para aproximar a tela de um pseudo focado em backend;
- esquecer que o banco real e SQLite e que o app depende da API local.
- adicionar matching hardcoded no motor de memoria com listas manuais de sinonimos, categorias, intents ou regexes especificas para cobrir perguntas como atalho de recuperacao;
- mascarar falhas de embedding, ranking ou qualidade de memoria com heuristicas textuais ad hoc em vez de melhorar a representacao, os dados ou o fluxo real.
