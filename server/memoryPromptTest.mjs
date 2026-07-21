import assert from 'node:assert/strict'

const userMessage = 'Eu trabalho com internet e tenho canal do YouTube'
const apiKey = process.env.OPENROUTER_API_KEY
const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const chatModel = process.env.OPENROUTER_CHAT_MODEL ?? 'openai/gpt-4.1-nano'

assert.ok(apiKey, 'OPENROUTER_API_KEY ausente. Execute com --env-file=.env.')

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:5173',
    'X-Title': process.env.OPENROUTER_APP_NAME ?? 'psikchat',
  },
  body: JSON.stringify({
    model: chatModel,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'Voce extrai memorias curtas e reutilizaveis de conversas. Retorne apenas JSON valido.',
      },
      {
        role: 'user',
        content: [
          'Ultima mensagem do usuario:',
          userMessage,
          '',
          'Memorias ja existentes:',
          '(nenhuma)',
          '',
          'Crie apenas memorias novas, realmente reutilizaveis e explicitamente declaradas pelo usuario.',
          'Priorize fatos do usuario, preferencias, nomes, metas, projetos e restricoes.',
          'Tambem salve instrucoes explicitas do usuario sobre como voce deve responder em situacoes recorrentes.',
          'Uma pergunta nao declara um fato: nunca crie memoria a partir de perguntas, mesmo se elas contiverem "eu", "meu", "gosto", "prefiro" ou uma alternativa como "ou nao".',
          'Nao responda, complete, corrija ou suponha a resposta de uma pergunta ao extrair memorias.',
          'Se nao houver uma declaracao explicita e duradoura na mensagem, retorne []. Em caso de duvida, retorne [].',
          'Nao infira metas permanentes, preferencias duradouras ou prioridades a partir de uma pergunta isolada, exercicio, teste, curiosidade ou pedido pontual.',
          'Nao extrapole, nao resuma demais e nao transforme um exemplo casual em perfil do usuario.',
          'Se o usuario descreveu uma regra condicional reutilizavel, preserve essa regra na memoria em vez de inventar uma abstracao mais ampla.',
          'Cada memoria deve ter no maximo 80 caracteres.',
          'Formato obrigatorio: escreva cada memoria em portugues como "titulo semantico: valor concreto" ou, quando ficar mais natural, como uma frase curta em primeira pessoa.',
          'Para fatos, preferencias, dificuldades, metas e instrucoes do proprio usuario, escreva em primeira pessoa quando fizer sentido, usando formulacoes como "eu", "meu" e "minha" em vez de "user", "the user" ou "usuario".',
          'Nunca escreva memorias sobre o proprio usuario com "user", "the user" ou "usuario".',
          'Cada memoria deve preservar o valor concreto do fato. Um titulo, rotulo ou categoria sem valor e invalido.',
          'Exemplo: para "O nome do meu cachorro e Billy", retorne "nome do meu cachorro: Billy".',
          'Exemplo: para "Tenho dificuldade de escolher as melhores ideias para executar", retorne "tenho dificuldade de escolher as melhores ideias para executar".',
          'Exemplo: para "Quando eu falar de sentimentos e voce nao souber opinar, me faca uma pergunta no final", retorne "em temas emocionais, se nao souber opinar, faca uma pergunta no final".',
          'Se precisar, use um texto um pouco maior para preservar o fato completo e util.',
          'Ignore informacoes genericas, redundantes ou que so repetem a pergunta.',
          'Retorne apenas um array JSON de strings. Exemplo: ["nome do meu cachorro: Billy", "prefiro exemplos curtos"]',
        ].join('\n'),
      },
    ],
  }),
})

if (!response.ok) {
  throw new Error(`OpenRouter respondeu ${response.status}: ${await response.text()}`)
}
const body = await response.json()
const content = body?.choices?.[0]?.message?.content?.trim() ?? ''
let memories

try {
  memories = JSON.parse(content)
}
catch {
  assert.fail(`A LLM nao retornou um array JSON valido: ${content}`)
}

assert.ok(Array.isArray(memories), `A LLM nao retornou um array: ${content}`)
assert.ok(memories.some((memory) => typeof memory === 'string' && memory.trim()), `A LLM nao sugeriu memoria: ${content}`)

console.log(`Teste de prompt aprovado: ${content}`)
