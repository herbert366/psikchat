import http from 'node:http'
import { createRuntimeDatabase } from '../server/runtimeDatabase.mjs'

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function buildEmbedding(text) {
  const vector = Array.from({ length: 12 }, () => 0)

  for (const token of tokenize(text)) {
    const bucket = token.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % vector.length
    vector[bucket] += 1 + token.length / 10
  }

  return vector
}

function buildMemoryCandidates(prompt) {
  const normalizedPrompt = normalizeText(prompt)
  const candidates = []

  if (normalizedPrompt.includes('meu cachorro se chama bob')) {
    candidates.push("user dog's name: Bob")
  }

  if (normalizedPrompt.includes('o nome do meu cachorro e billy')) {
    candidates.push(
      prompt.includes('Formato obrigatorio: escreva cada memoria em ingles como "titulo semantico: valor concreto".')
        ? "user dog's name: Billy"
        : "user dog's name:",
    )
  }

  if (normalizedPrompt.includes('prefiro mapas')) {
    candidates.push('Prefere mapas')
  }

  if (normalizedPrompt.includes('prefiro respostas curtas')) {
    candidates.push('Resposta curta')
  }

  if (normalizedPrompt.includes('prefiro listas')) {
    candidates.push('Prefere listas')
  }

  if (normalizedPrompt.includes('gosto de ferrari')) {
    candidates.push('user likes Ferrari')
  }

  if (
    normalizedPrompt.includes('quando eu falar de sentimentos')
    && normalizedPrompt.includes('me faca uma pergunta no final')
  ) {
    candidates.push('user preference for emotional topics: ask a question at end if unsure')
  }

  return JSON.stringify(candidates)
}

function buildAssistantReply(prompt) {
  const normalizedPrompt = normalizeText(prompt)

  if (normalizedPrompt.includes('qual o nome do meu cachorro?') && normalizedPrompt.includes("user dog's name: bob")) {
    return 'O nome do seu cachorro e Bob.'
  }

  if (
    normalizedPrompt.includes('qual o nome do meu cachorro?')
    && normalizedPrompt.includes("user dog's name: billy")
  ) {
    return 'O nome do seu cachorro e Billy.'
  }

  if (normalizedPrompt.includes('meu cachorro se chama bob')) {
    return 'Vou guardar que o nome do seu cachorro e Bob.'
  }

  if (normalizedPrompt.includes('o nome do meu cachorro e billy')) {
    return 'Vou guardar que o nome do seu cachorro e Billy.'
  }

  if (normalizedPrompt.includes('gosto de ferrari')) {
    return 'Voce gosta de Ferrari.'
  }

  if (normalizedPrompt.includes('rag')) {
    return [
      'RAG mistura busca com geracao.',
      '1. O sistema busca trechos relevantes em uma base.',
      '2. Esses trechos entram no contexto do modelo.',
      '3. O modelo responde usando esse material como apoio.',
    ].join('\n')
  }

  if (normalizedPrompt.includes('compare') || normalizedPrompt.includes('comparar')) {
    return [
      'Vale comparar por criterio.',
      '1. Objetivo.',
      '2. Custo.',
      '3. Risco.',
    ].join('\n')
  }

  return 'Resposta generica.'
}

function createTestLlmClient() {
  return {
    async embed(text) {
      return buildEmbedding(text)
    },
    async generateText(messages) {
      const prompt = messages.map((message) => message.content).join('\n')

      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return buildMemoryCandidates(prompt)
      }

      if (prompt.includes('Para cada memoria, valide a relacao dela com a mensagem do usuario.')) {
        const lines = prompt.split('\n')
        const userMessageLabelIndex = lines.findIndex((line) => line.trim() === 'Mensagem do usuario:')
        const userMessage = normalizeText(userMessageLabelIndex >= 0 ? (lines[userMessageLabelIndex + 1] ?? '') : '')
        const memoryLines = lines.filter((line) => /^\d+:\s+/.test(line))
        const feedbacks = memoryLines.map((line) => {
          const match = line.match(/^(\d+):\s+(.+)$/)
          if (!match) return null
          const memoryId = Number(match[1])
          const memoryText = normalizeText(match[2])
          const score = userMessage && memoryText && (userMessage.includes(memoryText) || memoryText.includes(userMessage)) ? 1 : 0
          return { memory_id: memoryId, score }
        }).filter(Boolean)

        return JSON.stringify(feedbacks)
      }

      return buildAssistantReply(prompt)
    },
  }
}

const port = Number(process.env.PORT)
const dbPath = process.env.TEST_DB_PATH
const seedData = JSON.parse(process.env.TEST_SEED_DATA_JSON ?? '{"chats":[],"memories":[]}')
const runtimeDb = createRuntimeDatabase({
  dbPath,
  llmClient: createTestLlmClient(),
  seedData,
})

await runtimeDb.initialize()

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  catch {
    return {}
  }
}

const server = http.createServer(async (request, response) => {
  const method = request.method ?? 'GET'
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  try {
    if (method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    if (method === 'GET' && url.pathname === '/api/state') {
      sendJson(response, 200, runtimeDb.listState())
      return
    }

    if (method === 'POST' && url.pathname === '/api/chats') {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.createChat(body.title))
      return
    }

    const chatTitleMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/title$/)
    if (method === 'PATCH' && chatTitleMatch) {
      const body = await readBody(request)
      sendJson(response, 200, runtimeDb.renameChat(Number(chatTitleMatch[1]), body.title ?? 'Novo chat'))
      return
    }

    const chatPinMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/toggle-pin$/)
    if (method === 'POST' && chatPinMatch) {
      sendJson(response, 200, runtimeDb.toggleChatPinned(Number(chatPinMatch[1])))
      return
    }

    const chatDeleteMatch = url.pathname.match(/^\/api\/chats\/(\d+)$/)
    if (method === 'DELETE' && chatDeleteMatch) {
      sendJson(response, 200, runtimeDb.deleteChat(Number(chatDeleteMatch[1])))
      return
    }

    const chatMessageMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/messages$/)
    if (method === 'POST' && chatMessageMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.sendUserMessage(Number(chatMessageMatch[1]), body.text ?? ''))
      return
    }

    const chatRatingMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/messages\/([^/]+)\/rating$/)
    if (method === 'POST' && chatRatingMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.rateAssistantMessage(Number(chatRatingMatch[1]), chatRatingMatch[2], body.rating ?? 0))
      return
    }

    if (method === 'POST' && url.pathname === '/api/memories') {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.createMemory(body.text ?? '', { chatId: body.chatId ?? null }))
      return
    }

    const memoryUpdateMatch = url.pathname.match(/^\/api\/memories\/(\d+)$/)
    if (method === 'PATCH' && memoryUpdateMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.updateMemory(Number(memoryUpdateMatch[1]), body.text ?? ''))
      return
    }

    if (method === 'DELETE' && memoryUpdateMatch) {
      sendJson(response, 200, runtimeDb.deleteMemory(Number(memoryUpdateMatch[1])))
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  }
  catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

server.listen(port)

function shutdown() {
  server.close(() => {
    runtimeDb.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
