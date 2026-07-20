import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_APP_CONFIG = {
  maxCaracteresMemory: 20,
  maxCaracteresMemoryToCreateMemory: 500,
  maxCaracteresMemoryContext: 500,
  maxMemoriesPerReply: 20,
  embeddingSimilarityThreshold: 0.18,
}

const DEFAULT_SEED_DATA = {
  chats: [
    {
      id: 1,
      title: 'Reescrever Prompt UI Memórias',
      created_at: '2026-06-01',
      updated_at: '2026-07-12',
      pinned: 0,
      messages: [
        { id: 'message-1', author: 'assistant', text: 'Como posso ajudar voce hoje?' },
        { id: 'message-2', author: 'user', text: 'Quero organizar minhas metas da semana.' },
        { id: 'message-3', author: 'assistant', text: 'Claro. Podemos transformar suas metas em pequenas acoes e definir uma prioridade para cada dia.' },
      ],
    },
    {
      id: 2,
      title: 'Bilhão e Valuation',
      created_at: '2026-06-07',
      updated_at: '2026-07-10',
      pinned: 0,
      messages: [
        { id: 'message-4', author: 'user', text: 'Como penso sobre valuation de uma empresa?' },
        { id: 'message-5', author: 'assistant', text: 'Comece separando crescimento, margem, risco e o fluxo de caixa que o negocio pode gerar.' },
      ],
    },
    {
      id: 3,
      title: 'Neymar e o Ranking de Gols',
      created_at: '2026-06-12',
      updated_at: '2026-07-16',
      pinned: 0,
      messages: [
        { id: 'message-6', author: 'user', text: 'Quero comparar os numeros de gols por temporada.' },
        { id: 'message-7', author: 'assistant', text: 'Podemos montar a comparacao por clube, selecao e competicao para evitar conclusoes enviesadas.' },
      ],
    },
  ],
  memories: [
    { id: 1, text: 'Prefere listas objetivas', feedback_score: 4, usage_count: 18, created_at: '2026-06-02', updated_at: '2026-07-12' },
    { id: 2, text: 'Esta organizando metas semanais em formato de checklist', feedback_score: 3, usage_count: 11, created_at: '2026-06-09', updated_at: '2026-07-10' },
    { id: 3, text: 'Gosta de exemplos praticos antes de definicoes formais', feedback_score: 5, usage_count: 24, created_at: '2026-05-21', updated_at: '2026-07-15' },
    { id: 4, text: 'Tom direto, sem enrolacao', feedback_score: 4, usage_count: 32, created_at: '2026-04-18', updated_at: '2026-07-18' },
    { id: 5, text: 'Prefere comparar cenarios antes de decidir', feedback_score: 2, usage_count: 7, created_at: '2026-07-01', updated_at: '2026-07-16' },
  ],
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function lexicalSimilarity(first, second) {
  const firstTokens = new Set(tokenize(first))
  const secondTokens = new Set(tokenize(second))
  if (firstTokens.size === 0 || secondTokens.size === 0) return 0

  function tokensMatch(firstToken, secondToken) {
    if (firstToken === secondToken) return true
    if (firstToken.length < 5 || secondToken.length < 5) return false
    return firstToken.startsWith(secondToken) || secondToken.startsWith(firstToken)
  }

  let intersection = 0
  const matchedSecondTokens = new Set()
  for (const token of firstTokens) {
    const match = [...secondTokens].find((candidate) => !matchedSecondTokens.has(candidate) && tokensMatch(token, candidate))
    if (!match) continue
    matchedSecondTokens.add(match)
    intersection += 1
  }

  const union = firstTokens.size + secondTokens.size - intersection
  const overlap = intersection / union
  const firstNormalized = normalizeText(first)
  const secondNormalized = normalizeText(second)
  if (firstNormalized && secondNormalized && (firstNormalized.includes(secondNormalized) || secondNormalized.includes(firstNormalized))) {
    return Math.max(overlap, 0.82)
  }

  return overlap
}

function cosineSimilarity(first = [], second = []) {
  if (first.length === 0 || second.length === 0 || first.length !== second.length) return 0

  let dot = 0
  let firstMagnitude = 0
  let secondMagnitude = 0
  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index]
    firstMagnitude += first[index] ** 2
    secondMagnitude += second[index] ** 2
  }

  if (firstMagnitude === 0 || secondMagnitude === 0) return 0
  return dot / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude))
}

function toIsoDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function daysSince(date) {
  const parsed = new Date(date)
  const diff = Date.now() - parsed.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function serializeHistory(messages) {
  return JSON.stringify(messages.map(hydrateMessage))
}

function parseHistory(historyChatJson) {
  try {
    const parsed = JSON.parse(historyChatJson)
    return Array.isArray(parsed) ? parsed.map(hydrateMessage) : []
  }
  catch {
    return []
  }
}

function hydrateMessage(message) {
  return {
    ...message,
    rating: message.rating ?? 0,
    memoryIds: message.memoryIds ?? [],
  }
}

function buildChatText(entries) {
  return entries.map((entry) => `${entry.role}: ${entry.content}`).join('\n')
}

function buildHistoryChat(messages) {
  const entries = messages.map((message) => ({ role: message.author, content: message.text }))
  const userEntries = entries.filter((entry) => entry.role === 'user')
  return {
    entries,
    chat_text_without_last: buildChatText(entries.slice(0, -1)),
    chat_text: buildChatText(entries),
    lastUserMessage: userEntries[userEntries.length - 1]?.content ?? '',
  }
}

function toShortMemory(text, maxCharacters) {
  const words = compactWhitespace(text)
    .replace(/[.!?]+$/g, '')
    .split(' ')
    .filter(Boolean)

  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxCharacters) break
    current = next
  }

  return current || compactWhitespace(text).slice(0, maxCharacters).trim()
}

function extractJsonArray(text) {
  if (!text) return []

  const direct = tryParseJsonArray(text)
  if (direct) return direct

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  return tryParseJsonArray(match[0]) ?? []
}

function tryParseJsonArray(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : null
  }
  catch {
    return null
  }
}

function encodeEmbedding(embedding) {
  return Buffer.from(JSON.stringify(embedding), 'utf8')
}

function decodeEmbedding(value) {
  if (!value) return []
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : Buffer.from(value).toString('utf8')
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : []
  }
  catch {
    return []
  }
}

function createOpenRouterClient({
  fetchImpl = fetch,
  apiKey,
  baseUrl = 'https://openrouter.ai/api/v1',
  chatModel = 'openai/gpt-4.1-nano',
  embeddingModel = 'openai/text-embedding-3-large',
  siteUrl = 'http://localhost:5173',
  appName = 'psikchat',
}) {
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY ausente. Configure a chave no arquivo .env.')
  }

  const commonHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': siteUrl,
    'X-Title': appName,
  }

  async function request(endpoint, body) {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter ${endpoint} falhou: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  return {
    async embed(text) {
      const response = await request('/embeddings', {
        model: embeddingModel,
        input: text,
      })

      return response?.data?.[0]?.embedding ?? []
    },
    async generateText(messages, options = {}) {
      const response = await request('/chat/completions', {
        model: chatModel,
        temperature: options.temperature ?? 0.2,
        messages,
      })

      return response?.choices?.[0]?.message?.content?.trim() ?? ''
    },
  }
}

export function createRuntimeDatabase(options = {}) {
  const config = { ...DEFAULT_APP_CONFIG, ...(options.config ?? {}) }
  const seedData = options.seedData ?? DEFAULT_SEED_DATA
  const dbPath = path.resolve(options.dbPath ?? path.join(process.cwd(), 'data', 'psikchat.sqlite'))
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const sqlite = new DatabaseSync(dbPath)
  const llmClient = options.llmClient ?? createOpenRouterClient({
    fetchImpl: options.fetchImpl ?? fetch,
    apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY,
    baseUrl: options.baseUrl ?? process.env.OPENROUTER_BASE_URL,
    chatModel: options.chatModel ?? process.env.OPENROUTER_CHAT_MODEL,
    embeddingModel: options.embeddingModel ?? process.env.OPENROUTER_EMBEDDING_MODEL,
    siteUrl: options.siteUrl ?? process.env.OPENROUTER_SITE_URL,
    appName: options.appName ?? process.env.OPENROUTER_APP_NAME,
  })

  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      feedback_score REAL NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      embedding BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      history_chat_json TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );
  `)

  const getMemoryByIdStatement = sqlite.prepare('SELECT * FROM memories WHERE id = ?')
  const getChatByIdStatement = sqlite.prepare('SELECT * FROM chats WHERE id = ?')
  const listMemoriesStatement = sqlite.prepare('SELECT * FROM memories ORDER BY updated_at DESC, id DESC')
  const listChatsStatement = sqlite.prepare('SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC, id DESC')
  const insertMemoryStatement = sqlite.prepare(`
    INSERT INTO memories (text, created_at, updated_at, feedback_score, usage_count, embedding)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const updateMemoryStatement = sqlite.prepare(`
    UPDATE memories
    SET text = ?, updated_at = ?, embedding = ?
    WHERE id = ?
  `)
  const deleteMemoryStatement = sqlite.prepare('DELETE FROM memories WHERE id = ?')
  const insertChatStatement = sqlite.prepare(`
    INSERT INTO chats (title, created_at, updated_at, history_chat_json, pinned)
    VALUES (?, ?, ?, ?, ?)
  `)
  const updateChatStatement = sqlite.prepare(`
    UPDATE chats
    SET title = ?, updated_at = ?, history_chat_json = ?, pinned = ?
    WHERE id = ?
  `)
  const deleteChatStatement = sqlite.prepare('DELETE FROM chats WHERE id = ?')

  let nextMessageId = readNextMessageId()

  function readNextMessageId() {
    return listChatsStatement.all().reduce((maxId, row) => {
      const messages = parseHistory(row.history_chat_json)
      return messages.reduce((messageMax, message) => {
        const parsed = Number(String(message.id).replace('message-', ''))
        return Number.isFinite(parsed) ? Math.max(messageMax, parsed) : messageMax
      }, maxId)
    }, 0) + 1
  }

  function createMessageId() {
    const id = `message-${nextMessageId}`
    nextMessageId += 1
    return id
  }

  function hydrateMemory(row) {
    if (!row) return null
    return {
      id: row.id,
      text: row.text,
      created_at: row.created_at,
      updated_at: row.updated_at,
      feedback_score: row.feedback_score,
      usage_count: row.usage_count,
      embedding: decodeEmbedding(row.embedding),
    }
  }

  function hydrateChat(row) {
    if (!row) return null
    const messages = parseHistory(row.history_chat_json)
    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      pinned: Boolean(row.pinned),
      history_chat_json: serializeHistory(messages),
      messages,
    }
  }

  function listMemories() {
    return listMemoriesStatement.all().map(hydrateMemory)
  }

  function listChats() {
    return listChatsStatement.all().map(hydrateChat)
  }

  function getChat(chatId) {
    return hydrateChat(getChatByIdStatement.get(chatId))
  }

  function getMemory(memoryId) {
    return hydrateMemory(getMemoryByIdStatement.get(memoryId))
  }

  function listState() {
    return {
      chats: listChats(),
      memories: listMemories(),
    }
  }

  function writeChat(chat) {
    updateChatStatement.run(
      chat.title,
      chat.updated_at,
      serializeHistory(chat.messages),
      Number(chat.pinned),
      chat.id,
    )
  }

  function buildMemoryScore(memory, chatText, queryEmbedding) {
    const embeddingSimilarity = cosineSimilarity(memory.embedding, queryEmbedding)
    const textSimilarity = lexicalSimilarity(memory.text, chatText)
    const recencyScore = 1 / (daysSince(memory.created_at) + 1)
    const usageScore = memory.usage_count / 10
    const feedbackScore = memory.feedback_score / 5

    return {
      memory,
      similarity: Math.max(embeddingSimilarity, textSimilarity),
      score: embeddingSimilarity * 3 + textSimilarity * 2 + recencyScore + usageScore + feedbackScore,
    }
  }

  function createHeuristicMemories(message) {
    const compact = compactWhitespace(message)
    if (!compact) return []

    const rules = [
      { pattern: /prefiro\s+(.+)/i, prefix: 'Prefere ' },
      { pattern: /gosto\s+de\s+(.+)/i, prefix: 'Gosta de ' },
      { pattern: /quero\s+(.+)/i, prefix: 'Quer ' },
      { pattern: /preciso\s+de\s+(.+)/i, prefix: 'Precisa de ' },
      { pattern: /meu\s+nome\s+e\s+(.+?)(?:\s+e\s+eu\b|\s+e\s+me\b|[.,!?\n]|$)/i, prefix: 'Nome: ' },
      { pattern: /me\s+chama\s+(.+?)(?:\s+e\s+eu\b|\s+e\s+me\b|[.,!?\n]|$)/i, prefix: 'Nome: ' },
      { pattern: /trabalho\s+com\s+(.+)/i, prefix: 'Trabalha com ' },
      { pattern: /meu\s+cachorro\s+(?:se\s+chama|chama)\s+(.+?)(?:\s+e\s+eu\b|\s+e\s+me\b|[.,!?\n]|$)/i, prefix: 'Cachorro: ' },
      { pattern: /meu\s+gato\s+(?:se\s+chama|chama)\s+(.+?)(?:\s+e\s+eu\b|\s+e\s+me\b|[.,!?\n]|$)/i, prefix: 'Gato: ' },
    ]

    const matches = []
    for (const rule of rules) {
      const match = compact.match(rule.pattern)
      if (!match?.[1]) continue
      matches.push(toShortMemory(rule.prefix + match[1], config.maxCaracteresMemory))
    }

    return matches
  }

  async function generateLlmMemoryCandidates(historyChat, existingMemories) {
    const recentChat = historyChat.chat_text.slice(-config.maxCaracteresMemoryToCreateMemory)
    const response = await llmClient.generateText([
      {
        role: 'system',
        content: 'Voce extrai memorias curtas e reutilizaveis de conversas. Retorne apenas JSON valido.',
      },
      {
        role: 'user',
        content: [
          'Chat recente:',
          recentChat || '(vazio)',
          '',
          'Memorias ja existentes:',
          existingMemories.join('\n') || '(nenhuma)',
          '',
          'Crie apenas memorias novas e realmente reutilizaveis.',
          'Priorize fatos do usuario, preferencias, nomes, metas, projetos e restricoes.',
          `Cada memoria deve ter no maximo ${config.maxCaracteresMemory} caracteres.`,
          'Ignore informacoes genericas, redundantes ou que so repetem a pergunta.',
          'Retorne apenas um array JSON de strings. Exemplo: ["Nome: Ana", "Prefere exemplos"]',
        ].join('\n'),
      },
    ], { temperature: 0 })

    return extractJsonArray(response)
  }

  function memoryAlreadyExists(existingTexts, candidate) {
    return existingTexts.some((text) => lexicalSimilarity(text, candidate) > 0.74)
  }

  function dedupeCandidates(candidates) {
    const entries = candidates
      .map((candidate) => toShortMemory(candidate, config.maxCaracteresMemory))
      .filter(Boolean)
      .map((candidate) => {
        const [rawLabel, ...rawValueParts] = candidate.split(':')
        return {
          candidate,
          label: normalizeText(rawLabel ?? ''),
          value: normalizeText(rawValueParts.join(':').trim()),
        }
      })

    const specificValues = new Set(
      entries
        .filter((entry) => entry.label && entry.label !== 'nome' && entry.value)
        .map((entry) => entry.value),
    )

    const seen = new Set()
    return entries
      .filter((entry) => !(entry.label === 'nome' && entry.value && specificValues.has(entry.value)))
      .map((entry) => entry.candidate)
      .filter((candidate) => {
        const key = normalizeText(candidate)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  async function embeddingsSearch(input) {
    const chatText = input.chatText ?? input.chat_text ?? ''
    const maxMemories = input.maxMemories ?? input.max_memories ?? config.maxMemoriesPerReply
    if (!compactWhitespace(chatText)) return []

    const queryEmbedding = await llmClient.embed(chatText)
    return listMemories()
      .map((memory) => buildMemoryScore(memory, chatText, queryEmbedding))
      .filter((item) => item.similarity >= config.embeddingSimilarityThreshold)
      .sort((first, second) => second.score - first.score)
      .slice(0, maxMemories)
      .map((item) => item.memory)
  }

  async function createMemory(text, overrides = {}) {
    const trimmed = toShortMemory(text, config.maxCaracteresMemory)
    if (!trimmed) return null

    const createdAt = overrides.created_at ?? toIsoDay()
    const updatedAt = overrides.updated_at ?? createdAt
    const feedbackScore = overrides.feedback_score ?? 0
    const usageCount = overrides.usage_count ?? 0
    const embedding = await llmClient.embed(trimmed)
    const result = insertMemoryStatement.run(
      trimmed,
      createdAt,
      updatedAt,
      feedbackScore,
      usageCount,
      encodeEmbedding(embedding),
    )

    return getMemory(Number(result.lastInsertRowid))
  }

  async function createNewMemories(historyChat) {
    const recentChat = historyChat.chat_text.slice(-config.maxCaracteresMemoryToCreateMemory)
    const relatedMemories = await embeddingsSearch({
      chatText: recentChat,
      maxMemories: config.maxMemoriesPerReply,
    })

    const existingTexts = listMemories().map((memory) => memory.text)
    const candidates = dedupeCandidates([
      ...createHeuristicMemories(historyChat.lastUserMessage),
      ...await generateLlmMemoryCandidates(historyChat, relatedMemories.map((memory) => memory.text)),
    ])

    const created = []
    for (const candidate of candidates) {
      const normalizedCandidate = toShortMemory(candidate, config.maxCaracteresMemory)
      if (!normalizedCandidate) continue

      const alreadyExists = memoryAlreadyExists(
        [...existingTexts, ...created.map((memory) => memory.text)],
        normalizedCandidate,
      )
      if (alreadyExists) continue

      const memory = await createMemory(normalizedCandidate)
      if (memory) created.push(memory)
    }

    return created
  }

  async function generateAssistantText(lastUserMessage, chatText, memoryTexts) {
    return llmClient.generateText([
      {
        role: 'system',
        content: [
          'Voce responde em portugues do Brasil.',
          'Use as memorias como fonte de verdade para fatos pessoais, preferencias e contexto recorrente.',
          'Se a resposta estiver nas memorias, responda diretamente usando essa informacao.',
          'Nao invente fatos ausentes nas memorias ou no chat.',
          'Seja objetivo, util e natural.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Memories:',
          memoryTexts.join('\n') || '(nenhuma memoria relevante)',
          '',
          'Chat recente:',
          chatText.slice(-config.maxCaracteresMemoryContext) || '(vazio)',
          '',
          `Mensagem final do usuario: ${lastUserMessage || '(vazia)'}`,
        ].join('\n'),
      },
    ], { temperature: 0.3 })
  }

  function incrementMemoryUsage(memoryIds) {
    if (memoryIds.length === 0) return
    const usedIds = new Set(memoryIds)
    const today = toIsoDay()
    for (const memory of listMemories()) {
      if (!usedIds.has(memory.id)) continue
      sqlite.prepare('UPDATE memories SET usage_count = ?, updated_at = ? WHERE id = ?').run(
        memory.usage_count + 1,
        today,
        memory.id,
      )
    }
  }

  function adjustMemoryFeedback(memoryIds, delta) {
    if (memoryIds.length === 0 || delta === 0) return
    const affectedIds = new Set(memoryIds)
    const today = toIsoDay()
    for (const memory of listMemories()) {
      if (!affectedIds.has(memory.id)) continue
      sqlite.prepare('UPDATE memories SET feedback_score = ?, updated_at = ? WHERE id = ?').run(
        memory.feedback_score + delta,
        today,
        memory.id,
      )
    }
  }

  function stripMemoryFromChats(memoryId) {
    for (const chat of listChats()) {
      const nextMessages = chat.messages.map((message) => ({
        ...message,
        memoryIds: (message.memoryIds ?? []).filter((currentId) => currentId !== memoryId),
      }))
      writeChat({ ...chat, messages: nextMessages })
    }
  }

  async function agentRespond(chatId) {
    const chat = getChat(chatId)
    if (!chat) return null

    const historyChat = buildHistoryChat(chat.messages)
    await createNewMemories(historyChat)

    const memoryQuery = historyChat.chat_text.slice(-config.maxCaracteresMemoryContext)
    const memoriesForReply = await embeddingsSearch({
      chatText: memoryQuery,
      maxMemories: config.maxMemoriesPerReply,
    })

    incrementMemoryUsage(memoriesForReply.map((memory) => memory.id))
    const refreshedChat = getChat(chatId)
    if (!refreshedChat) return null

    const assistantMessage = {
      id: createMessageId(),
      author: 'assistant',
      text: await generateAssistantText(
        historyChat.lastUserMessage,
        historyChat.chat_text,
        memoriesForReply.map((memory) => memory.text),
      ),
      memoryIds: memoriesForReply.map((memory) => memory.id),
      rating: 0,
    }

    writeChat({
      ...refreshedChat,
      updated_at: toIsoDay(),
      messages: [...refreshedChat.messages, assistantMessage],
    })

    return assistantMessage
  }

  async function ensureSeeded() {
    const memoryCount = sqlite.prepare('SELECT COUNT(*) AS count FROM memories').get().count
    const chatCount = sqlite.prepare('SELECT COUNT(*) AS count FROM chats').get().count
    if (memoryCount > 0 || chatCount > 0) return

    for (const memory of seedData.memories) {
      await createMemory(memory.text, memory)
    }

    for (const chat of seedData.chats) {
      insertChatStatement.run(
        chat.title,
        chat.created_at,
        chat.updated_at,
        serializeHistory(chat.messages),
        chat.pinned ?? 0,
      )
    }

    nextMessageId = readNextMessageId()
  }

  return {
    async initialize() {
      await ensureSeeded()
      return listState()
    },
    close() {
      sqlite.close()
    },
    listState,
    chats: () => listChats(),
    memories: () => listMemories(),
    embeddingsSearch,
    async sendUserMessage(chatId, text) {
      const chat = getChat(chatId)
      if (!chat) {
        return { userMessage: null, assistantMessage: null, state: listState() }
      }

      const userMessage = {
        id: createMessageId(),
        author: 'user',
        text,
        memoryIds: [],
        rating: 0,
      }

      writeChat({
        ...chat,
        updated_at: toIsoDay(),
        messages: [...chat.messages, userMessage],
      })

      const assistantMessage = await agentRespond(chatId)
      return {
        userMessage,
        assistantMessage,
        state: listState(),
      }
    },
    async createChat(title = 'Novo chat') {
      const today = toIsoDay()
      const result = insertChatStatement.run(title, today, today, '[]', 0)
      return {
        chat: getChat(Number(result.lastInsertRowid)),
        state: listState(),
      }
    },
    renameChat(chatId, title) {
      const chat = getChat(chatId)
      if (!chat) return { state: listState() }
      writeChat({ ...chat, title, updated_at: toIsoDay() })
      return { state: listState() }
    },
    toggleChatPinned(chatId) {
      const chat = getChat(chatId)
      if (!chat) return { state: listState() }
      writeChat({ ...chat, pinned: !chat.pinned, updated_at: toIsoDay() })
      return { state: listState() }
    },
    deleteChat(chatId) {
      deleteChatStatement.run(chatId)
      return { state: listState() }
    },
    async createMemory(text) {
      await createMemory(text)
      return { state: listState() }
    },
    async updateMemory(memoryId, text) {
      const memory = getMemory(memoryId)
      if (!memory) return { state: listState() }

      const nextText = toShortMemory(text, config.maxCaracteresMemory)
      if (!nextText) return { state: listState() }

      const embedding = await llmClient.embed(nextText)
      updateMemoryStatement.run(nextText, toIsoDay(), encodeEmbedding(embedding), memoryId)
      return { state: listState() }
    },
    deleteMemory(memoryId) {
      deleteMemoryStatement.run(memoryId)
      stripMemoryFromChats(memoryId)
      return { state: listState() }
    },
    rateAssistantMessage(chatId, messageId, nextRating) {
      const chat = getChat(chatId)
      if (!chat) return { state: listState() }

      const message = chat.messages.find((entry) => entry.id === messageId && entry.author === 'assistant')
      if (!message) return { state: listState() }

      const previousRating = message.rating ?? 0
      if (previousRating === nextRating) return { state: listState() }

      adjustMemoryFeedback(message.memoryIds ?? [], nextRating - previousRating)
      writeChat({
        ...chat,
        updated_at: toIsoDay(),
        messages: chat.messages.map((entry) => entry.id === messageId ? { ...entry, rating: nextRating } : entry),
      })
      return { state: listState() }
    },
  }
}
