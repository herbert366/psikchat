# psikchat

Mock visual de chat com memórias manuais na UI e backend local para memória semântica com SQLite.

## Stack

- Frontend: React + Vite
- API local: Node HTTP nativo
- Persistência: `node:sqlite`
- Chat model: OpenRouter `openai/gpt-4.1-nano`
- Embeddings: OpenRouter `openai/text-embedding-3-large`

## Variáveis de ambiente

O projeto usa `.env` para o frontend e para a API local. Há um `.env.example` com o formato esperado.

## Deploy em nuvem

- Use Node.js `>=22.5.0`, pois a API depende de `node:sqlite`.
- Monte um volume persistente e configure `APP_DB_PATH` dentro dele. O diretório local do processo não é adequado para plataformas serverless, pois pode ser efêmero ou somente leitura.
- O backend atual não possui autenticação nem isolamento por usuário. Ele é adequado apenas para uma instância privada de um único usuário. Antes de expor o app para múltiplas pessoas, implemente autenticação e associe chats e memórias ao usuário autenticado.
- Publique o frontend estático e a API como serviços separados, definindo `VITE_API_BASE_URL` com a URL pública da API.

## Rodando

```bash
npm run dev
```

O comando inicia a API local e o frontend. Abra a URL mostrada pelo Vite.

Para iniciar apenas a API, use `npm run dev:api`.

## Smoke test da memória

Esse teste faz duas mensagens reais com o modelo: cria uma memória no primeiro turno e verifica se o segundo turno lembra dela.

```bash
npm run smoke:memory
```

## Testes

```bash
npm test
```
