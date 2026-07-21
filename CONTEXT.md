# CONTEXT.md

## Dominio e termos

Este projeto e uma interface de chat com memoria manual persistida em SQLite por uma API local.

- **Sidebar:** area persistente a esquerda para conversas. Deve existir em telas desktop.
- **Chat:** area principal da conversa; mensagens do assistente ficam a esquerda e mensagens do usuario a direita.
- **Memorias:** contexto explicito armazenado manualmente e exibido no inicio da conversa.
- **Criar memoria:** acao ligada ao fluxo atual da conversa, localizada na barra de composicao ao lado do campo de mensagem.

## Fontes canonicas

- `src/App.tsx`: estrutura, estado local e interacoes da interface.
- `src/App.css`: layout, paleta e responsividade do chat.
- `src/index.css`: reset global e fundamentos tipograficos.
- `server/runtimeDatabase.mjs`: persistencia SQLite, busca de memorias e operacoes de chat.

## Invariantes de UX

- Preservar a sidebar em desktop; nao a remova ao reposicionar controles do chat.
- O botao `Criar memoria` deve ficar junto ao input de mensagem, nunca na sidebar.
- O modal de memoria deve ser centralizado em relacao a area do chat, nao a viewport inteira. A sidebar precisa continuar visivel e fora do overlay.
- Respostas do assistente exibem controles de avaliacao positiva e negativa; mensagens do usuario nao.
- O modal cria uma memoria manual e a adiciona a lista via API local com persistencia em SQLite.
- Em telas pequenas, ocultar a sidebar e manter todos os controles acessiveis dentro do chat.
- Icones devem ficar centralizados verticalmente em relacao ao texto usando um container compartilhado, preferencialmente com `display: flex` e `align-items: center`.
- Controles relacionados, como titulo, chevron e icone de novo chat, devem permanecer no mesmo container com `gap` explicito e area clicavel consistente.

## Direcao visual

- Fundo principal: preto quase absoluto, `#080808`.
- Sidebar: cinza escuro, `#1d1d1d`.
- Cards e mensagens do assistente: `#292929`.
- Mensagens do usuario: `#343434`.
- Acao de destaque: coral, `#e87958`, com texto branco.
- Campo de entrada: cinza quente, `#94938f`, com texto escuro.
- Texto principal: `#f4f4f4`.
- Cantos arredondados moderados: 10px a 16px; evitar bordas pesadas, gradientes e ornamentacao desnecessaria.

## Riscos e anti-patterns

- Nao reintroduzir fallback em memoria ou seeds visuais no app; o fluxo padrao deve permanecer ligado ao SQLite.
- Nao introduzir dependencias para icones, modal ou estado simples; React e CSS nativos sao suficientes.
- Nao centralizar overlays com `position: fixed` no documento quando a intencao for um overlay contextual do chat.
- Nao usar `position: absolute` para alinhar icones em relacao a textos; isso remove o icone do fluxo do container e causa desalinhamento responsivo.
- Nao alterar o alinhamento semantico das mensagens: assistente a esquerda, usuario a direita.
