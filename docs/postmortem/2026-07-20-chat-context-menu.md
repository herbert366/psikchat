# Postmortem: menu contextual dos chats

## Contexto

A sidebar precisava oferecer tres acoes por conversa: `Renomear`, `Fixar` e `Excluir`. O menu deveria abrir pelo botao de tres pontos e aparecer lateralmente, sobre a area do chat, como na referencia visual.

## Estado original

Cada conversa era um unico `<button>`, sem estado de menu, sem operacoes de chat persistidas e sem suporte a chats fixados.

## Primeiro sinal de problema

A primeira implementacao separou o titulo e o botao de opcoes, mas posicionou o popup abaixo da linha. Isso fazia o menu parecer parte da lista, em vez de um menu contextual ancorado ao chat.

## Diagnostico inicial incompleto

O posicionamento foi corrigido para `left: calc(100% + 8px)`, mas o popup continuou invisivel no navegador. O DOM e a acessibilidade mostravam o menu, porem a captura visual nao mostrava nada.

## Reenquadramento

O problema nao era o estado React nem o `z-index`. O menu estava sendo cortado por `overflow: hidden` na propria linha `.chat-list-item`. Como o popup precisava atravessar o limite da sidebar, qualquer overflow oculto no item ou na lista era incompatível com a referencia.

## Mudanca decisiva

O menu passou a ser lateral, com largura de `230px`, padding maior, fundo `#343434`, bordas de `16px` e sombra. O clipping foi removido de `.chat-list-item`, `.chat-list` e `.sidebar`, permitindo que o popup avance para a area principal.

As operacoes passaram a usar a base SQLite local:

- `renameChat` atualiza o titulo;
- `toggleChatPinned` alterna o estado e ordena fixados no topo;
- `deleteChat` remove a conversa e seleciona outra quando necessario.

## Evidencia da validacao

O Playwright confirmou que o menu existe no DOM, possui os tres itens esperados e, depois da remocao do clipping, aparece visualmente ao lado do item. `npm run build` e `npm run lint` passaram sem erros, e nao houve erros no console do navegador.

## Estado atual

O botao de tres pontos abre um popup lateral com apenas as tres acoes solicitadas. Renomear usa um formulario inline separado; fixar mostra um indicador e move a conversa para o topo; excluir atualiza a conversa ativa.

## Aprendizado

Para overlays contextuais, validar somente a arvore de acessibilidade nao basta. E necessario conferir o retangulo renderizado e a captura visual, porque ancestrais com `overflow: hidden` podem deixar um elemento presente no DOM, mas invisivel para o usuario.

## Guardrails contra regressao

1. O menu deve continuar com `position: absolute`, `left: calc(100% + 8px)` e `z-index` acima do conteudo.
2. Nenhum ancestral do item pode usar `overflow: hidden` enquanto o popup permanecer renderizado dentro da linha.
3. Toda alteracao no popup deve ser validada com abertura pelo botao de tres pontos e captura visual no navegador.
4. O menu deve continuar limitado a `Renomear`, `Fixar`/`Desfixar` e `Excluir`, sem mover a acao de criar memoria para a sidebar.
