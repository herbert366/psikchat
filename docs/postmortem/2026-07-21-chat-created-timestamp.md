# Decisao: timestamp de criacao dos chats

## Decisao

Novos chats passam a salvar `created_at` como timestamp ISO completo em `createChat()` e `resetApp()`. O `updated_at` continua usando apenas a data, porque a mudanca foi feita para representar o horario real de criacao sem alterar a semantica atual de atualizacao e ordenacao.

Chats existentes continuam validos mesmo quando possuem apenas `YYYY-MM-DD`.

## Por que

O frontend passou a exibir o horario de criacao antes das mensagens. Salvar somente o dia fazia o navegador interpretar o valor como meia-noite e apresentar um horario incorreto para a pessoa.

O timestamp ISO inclui a referencia UTC (`Z`), permitindo que o frontend converta o instante para o fuso horario local do computador.

## Proibido

- Nao substituir `created_at` de chats antigos por um horario inventado.
- Nao formatar o timestamp no backend para um fuso fixo.
- Nao alterar `updated_at` junto com esta decisao sem uma necessidade separada.

## Permitido

- O frontend deve aceitar tanto timestamps ISO completos quanto datas antigas no formato `YYYY-MM-DD`.
- Seeds e fixtures podem continuar usando datas sem horario quando representam dados historicos de teste.
- Uma migracao futura pode preencher timestamps antigos somente se existir uma fonte confiavel para a hora original.

## Testes que protegem esta decisao

- `tests/runtimeDatabase.chatTitle.test.ts` confirma que novos chats recebem timestamp ISO completo.
- `npm run build` e `npm run lint` validam a integracao entre banco, API e frontend.
