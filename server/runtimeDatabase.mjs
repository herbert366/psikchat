import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_APP_CONFIG = {
  maxCaracteresMemory: 80,
  maxCaracteresMemoryToCreateMemory: 500,
  maxCaracteresMemoryContext: 500,
  maxMemoriesPerReply: 20,
  embeddingSimilarityThreshold: 0.4,
  similarityThresholdToCreate: 0.86,
}

const APP_CONFIG_PATH = path.resolve(process.cwd(), 'src', 'config.ts')

const DEFAULT_SEED_DATA = { chats: [], memories: [] }
const NO_SIMILAR_MEMORY_LABEL = 'nenhuma memoria existente'

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function loadSourceAppConfig() {
  try {
    const source = fs.readFileSync(APP_CONFIG_PATH, 'utf8')
    const match = source.match(/export const APP_CONFIG = (\{[\s\S]*?\}) as const/)
    if (!match) return {}
    return Function(`"use strict"; return (${match[1]})`)()
  }
  catch {
    return {}
  }
}

function normalizeMemoryText(value) {
  return compactWhitespace(value).replace(/[.!?]+$/g, '')
}

function toPercent(value) {
  return Math.round(Math.max(0, value) * 100)
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
  for (let index = 0;index < first.length;index += 1) {
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

function now() {
  return new Date().toISOString()
}

function parseStatusHistory(statusHistoryJson) {
  try {
    const parsed = JSON.parse(statusHistoryJson)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item) => (
      item
      && (item.status === 'positive' || item.status === 'negative')
      && typeof item.at === 'string'
    ))
  }
  catch {
    return []
  }
}

function serializeStatusHistory(statusHistory) {
  return JSON.stringify(statusHistory)
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
    memoryMatches: message.memoryMatches ?? [],
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
  const normalized = normalizeMemoryText(text)
  const words = normalized
    .split(' ')
    .filter(Boolean)

  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxCharacters) break
    current = next
  }

  return current || normalized.slice(0, maxCharacters).trim()
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

function validateLlmMemoryCandidate(candidate, maxCharacters) {
  const normalizedCandidate = normalizeMemoryText(candidate)
  const separatorIndex = normalizedCandidate.indexOf(':')
  if (separatorIndex >= 0 && !normalizedCandidate.slice(separatorIndex + 1).trim()) {
    throw new Error(
      `Erro ao gerar memoria: a LLM retornou um rotulo sem valor util. Texto bruto: "${candidate}" | texto normalizado: "${normalizedCandidate}" | tamanho bruto: ${candidate.length} | tamanho normalizado: ${normalizedCandidate.length}. Ajuste o prompt ou maxCaracteresMemory.`,
    )
  }

  if (normalizedCandidate.length > maxCharacters) {
    throw new Error(
      `Erro ao gerar memoria: a LLM retornou uma memoria acima do limite. Limite: ${maxCharacters} | tamanho bruto: ${candidate.length} | tamanho normalizado: ${normalizedCandidate.length} | excesso: ${normalizedCandidate.length - maxCharacters} | texto bruto: "${candidate}" | texto normalizado: "${normalizedCandidate}". Ajuste o prompt ou maxCaracteresMemory.`,
    )
  }
}

function buildMemoryEvent(sourceText, partial = {}) {
  return {
    action: 'create',
    sourceText,
    ...partial,
  }
}

function buildDuplicateMemoryDetail(attemptedText, conflictingMemoryText) {
  return `Memoria rejeitada: tentou criar "${attemptedText}", mas ela duplica "${conflictingMemoryText}".`
}

function buildMemoryFeedbackDetail(memory, score) {
  if (score > 0) return `Feedback positivo: memoria ${memory.id} confirmada por "${memory.text}".`
  if (score < 0) return `Feedback negativo: memoria ${memory.id} contradita por "${memory.text}".`
  return `Feedback neutro: memoria ${memory.id} sem evidencia suficiente para "${memory.text}".`
}

function buildSimilarityDiagnostics(score, threshold) {
  return {
    embeddingSimilarityPercent: toPercent(score.embeddingSimilarity),
    lexicalSimilarityPercent: toPercent(score.textSimilarity),
    similarityPercent: toPercent(score.similarity),
    truthSimilaritySource: score.embeddingSimilarity >= score.textSimilarity ? 'embedding' : 'lexical',
    similarityThresholdPercent: toPercent(threshold),
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
  const config = { ...DEFAULT_APP_CONFIG, ...loadSourceAppConfig(), ...(options.config ?? {}) }
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
      embedding BLOB NOT NULL,
      status_history_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      history_chat_json TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS message_feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      embedding BLOB NOT NULL
    );
  `)

  const memoryColumns = sqlite.prepare('PRAGMA table_info(memories)').all()
  if (!memoryColumns.some((column) => column.name === 'status_history_json')) {
    sqlite.exec("ALTER TABLE memories ADD COLUMN status_history_json TEXT NOT NULL DEFAULT '[]'")
  }

  const getMemoryByIdStatement = sqlite.prepare('SELECT * FROM memories WHERE id = ?')
  const getChatByIdStatement = sqlite.prepare('SELECT * FROM chats WHERE id = ?')
  const listMemoriesStatement = sqlite.prepare('SELECT * FROM memories ORDER BY updated_at DESC, id DESC')
  const listChatsStatement = sqlite.prepare('SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC, id DESC')
  const insertMemoryStatement = sqlite.prepare(`
    INSERT INTO memories (text, created_at, updated_at, feedback_score, usage_count, embedding, status_history_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const updateMemoryStatement = sqlite.prepare(`
    UPDATE memories
    SET text = ?, updated_at = ?, embedding = ?
    WHERE id = ?
  `)
  const deleteMemoryStatement = sqlite.prepare('DELETE FROM memories WHERE id = ?')
  const updateMemoryStatusHistoryStatement = sqlite.prepare(`
    UPDATE memories
    SET status_history_json = ?, updated_at = ?
    WHERE id = ?
  `)
  const listMessageFeedbacksStatement = sqlite.prepare('SELECT * FROM message_feedbacks ORDER BY id DESC')
  const insertMessageFeedbackStatement = sqlite.prepare(`
    INSERT INTO message_feedbacks (chat_id, message_id, type, content, created_at, embedding)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
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
      statusHistory: parseStatusHistory(row.status_history_json),
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

  function appendMessageToChat(chatId, message) {
    const chat = getChat(chatId)
    if (!chat) return null

    const nextMessage = {
      rating: 0,
      memoryIds: [],
      ...message,
    }

    writeChat({
      ...chat,
      updated_at: toIsoDay(),
      messages: [...chat.messages, nextMessage],
    })

    return nextMessage
  }

  function appendMemoryEventsToChat(chatId, memoryEvents) {
    if (!chatId || memoryEvents.length === 0) return null

    return appendMessageToChat(chatId, {
      id: createMessageId(),
      author: 'system',
      text: memoryEvents.map((event) => event.detail).join('\n'),
      memoryIds: memoryEvents
        .filter((event) => event.status === 'created' && typeof event.memoryId === 'number')
        .map((event) => event.memoryId),
      memoryEvents,
      memoryEvent: memoryEvents[0],
    })
  }

  function appendMemoryFeedbacksToChat(chatId, memoryFeedbacks) {
    if (!chatId || memoryFeedbacks.length === 0) return null

    return appendMessageToChat(chatId, {
      id: createMessageId(),
      author: 'system',
      text: memoryFeedbacks.map((feedback) => feedback.detail).join('\n'),
      memoryIds: memoryFeedbacks.map((feedback) => feedback.memoryId),
      memoryFeedbacks,
    })
  }

  function buildMemoryScore(memory, chatText, queryEmbedding) {
    const embeddingSimilarity = cosineSimilarity(memory.embedding, queryEmbedding)
    const textSimilarity = lexicalSimilarity(memory.text, chatText)
    const similarity = Math.max(embeddingSimilarity, textSimilarity)

    return {
      memory,
      similarity,
      embeddingSimilarity,
      textSimilarity,
    }
  }

  function rankMemoryMatches(matches) {
    return matches
      .map((match) => {
        const lastHistory = match.memory.statusHistory.at(-1)
        return {
          ...match,
          rankingScore: -(lastHistory ? daysSince(lastHistory.at) : 0)
            + match.memory.usage_count * 0.4
            + match.similarity * 0.7,
        }
      })
      .sort((first, second) => second.rankingScore - first.rankingScore)
  }

  async function generateLlmMemoryCandidates(historyChat, existingMemories) {
    const lastUserMessage = compactWhitespace(historyChat.lastUserMessage).slice(-config.maxCaracteresMemoryToCreateMemory)
    if (!lastUserMessage) return []

    const response = await llmClient.generateText([
      {
        role: 'system',
        content: 'Voce extrai memorias curtas e reutilizaveis de conversas. Retorne apenas JSON valido.',
      },
      {
        role: 'user',
        content: [
          'Ultima mensagem do usuario:',
          lastUserMessage || '(vazia)',
          '',
          'Memorias ja existentes:',
          existingMemories.join('\n') || '(nenhuma)',
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
          `Cada memoria deve ter no maximo ${config.maxCaracteresMemory} caracteres.`,
          'Formato obrigatorio: escreva cada memoria em ingles como "titulo semantico: valor concreto".',
          'Cada memoria deve preservar o valor concreto do fato. Um titulo, rotulo ou categoria sem valor e invalido.',
          'Exemplo: para "O nome do meu cachorro e Billy", retorne "user dog\'s name: Billy".',
          'Exemplo: para "Quando eu falar de sentimentos e voce nao souber opinar, me faca uma pergunta no final", retorne uma memoria equivalente que preserve essa instrucao condicional.',
          'Se precisar, use um texto um pouco maior para preservar o fato completo e util.',
          'Ignore informacoes genericas, redundantes ou que so repetem a pergunta.',
          'Retorne apenas um array JSON de strings. Exemplo: ["Nome: Ana", "Nome do cachorro: Billy", "Prefere exemplos curtos"]',
        ].join('\n'),
      },
    ], { temperature: 0 })

    return extractJsonArray(response)
  }

  function memoryAlreadyExists(existingTexts, candidate) {
    const normalizedCandidate = normalizeText(candidate)
    return existingTexts.some((text) => normalizeText(text) === normalizedCandidate)
  }

  function memoryIsTooSimilar(existingMemories, candidate, candidateEmbedding) {
    return existingMemories.some((memory) => buildMemoryScore(memory, candidate, candidateEmbedding).similarity >= config.similarityThresholdToCreate)
  }

  function dedupeCandidates(candidates) {
    const entries = candidates
      .map((candidate) => normalizeMemoryText(candidate))
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
    const matches = await embeddingsSearchWithScores(input)
    return matches.map((item) => item.memory)
  }

  async function embeddingsSearchWithScores(input) {
    const chatText = input.chatText ?? input.chat_text ?? ''
    const maxMemories = input.maxMemories ?? input.max_memories ?? config.maxMemoriesPerReply
    if (!compactWhitespace(chatText)) return []

    const queryEmbedding = await llmClient.embed(chatText)
    const matches = listMemories()
      .map((memory) => buildMemoryScore(memory, chatText, queryEmbedding))
      .filter((item) => item.similarity > config.embeddingSimilarityThreshold)

    return rankMemoryMatches(matches).slice(0, maxMemories)
  }

  async function insertMemory(text, overrides = {}) {
    if (!text) return null

    const createdAt = overrides.created_at ?? toIsoDay()
    const updatedAt = overrides.updated_at ?? createdAt
    const feedbackScore = overrides.feedback_score ?? 0
    const usageCount = overrides.usage_count ?? 0
    const embedding = overrides.embedding ?? await llmClient.embed(text)
    const statusHistory = overrides.statusHistory ?? []
    const result = insertMemoryStatement.run(
      text,
      createdAt,
      updatedAt,
      feedbackScore,
      usageCount,
      encodeEmbedding(embedding),
      serializeStatusHistory(statusHistory),
    )

    return getMemory(Number(result.lastInsertRowid))
  }

  function parseMemoryFeedbacks(text) {
    const json = text.match(/\[[\s\S]*\]/)?.[0]
    if (!json) return []

    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item) => (
        item
        && Number.isInteger(item.memory_id)
        && [-1, 0, 1].includes(item.score)
      ))
    }
    catch {
      return []
    }
  }

  async function feedbackMemories(lastUserMessage, chatId = null) {
    const memories = await embeddingsSearch({
      chatText: lastUserMessage,
      maxMemories: config.maxMemoriesPerReply,
    })
    if (memories.length === 0) return []

    const response = await llmClient.generateText([
      {
        role: 'system',
        content: 'Valide memorias com base na mensagem do usuario. Retorne apenas JSON valido.',
      },
      {
        role: 'user',
        content: [
          'Mensagem do usuario:',
          lastUserMessage,
          '',
          'Memorias:',
          ...memories.map((memory) => `${memory.id}: ${memory.text}`),
          '',
          'Para cada memoria, valide a relacao dela com a mensagem do usuario.',
          'Retorne somente JSON no formato [{"memory_id": 1, "score": 1}].',
          'score: 1 se a mensagem confirma ou se relaciona diretamente com a memoria;',
          'score: -1 se a mensagem contradiz a memoria;',
          'score: 0 se nao ha evidencia suficiente.',
        ].join('\n'),
      },
    ], { temperature: 0 })

    const memoryIds = new Set(memories.map((memory) => memory.id))
    const feedbacks = parseMemoryFeedbacks(response)
      .filter((feedback) => memoryIds.has(feedback.memory_id))

    const feedbackDetails = feedbacks
      .map((feedback) => {
        const memory = getMemory(feedback.memory_id)
        if (!memory) return null

        return {
          memoryId: memory.id,
          memoryText: memory.text,
          score: feedback.score,
          status: feedback.score > 0 ? 'positive' : feedback.score < 0 ? 'negative' : 'neutral',
          detail: buildMemoryFeedbackDetail(memory, feedback.score),
        }
      })
      .filter(Boolean)

    appendMemoryFeedbacksToChat(chatId, feedbackDetails)

    for (const feedback of feedbacks) {
      if (feedback.score === 0) continue
      const memory = getMemory(feedback.memory_id)
      if (!memory) continue
      const status = feedback.score > 0 ? 'positive' : 'negative'
      updateMemoryStatusHistoryStatement.run(
        serializeStatusHistory([...memory.statusHistory, { status, at: now() }]),
        toIsoDay(),
        memory.id,
      )
    }

    return feedbacks
  }

  async function attemptManualMemoryCreate(text, chatId = null) {
    const sourceText = text
    const normalizedText = normalizeMemoryText(text)
    const baseEvent = {
      maxCharacters: config.maxCaracteresMemory,
      characterCount: normalizedText.length,
    }

    if (!normalizedText) {
      const memoryEvent = {
        ...buildMemoryEvent(sourceText, baseEvent),
        status: 'rejected',
        reason: 'empty',
        detail: 'Memoria rejeitada: texto vazio apos normalizacao.',
      }

      const eventMessage = appendMemoryEventsToChat(chatId, [memoryEvent])
      return {
        eventMessage,
        state: listState(),
        memoryEvent,
      }
    }

    if (normalizedText.length > config.maxCaracteresMemory) {
      const memoryEvent = {
        ...buildMemoryEvent(sourceText, baseEvent),
        status: 'rejected',
        reason: 'too_long',
        storedText: normalizedText,
        detail: `Memoria rejeitada: ${normalizedText.length}/${config.maxCaracteresMemory} caracteres.`,
      }

      const eventMessage = appendMemoryEventsToChat(chatId, [memoryEvent])
      return {
        eventMessage,
        state: listState(),
        memoryEvent,
      }
    }

    const currentMemories = listMemories()
    const candidateEmbedding = await llmClient.embed(normalizedText)
    const exactDuplicate = currentMemories.find((memory) => normalizeText(memory.text) === normalizeText(normalizedText))
    if (exactDuplicate) {
      const exactDuplicateScore = buildMemoryScore(exactDuplicate, normalizedText, candidateEmbedding)
      const memoryEvent = {
        ...buildMemoryEvent(sourceText, baseEvent),
        status: 'rejected',
        reason: 'already_exists',
        storedText: normalizedText,
        conflictingMemoryText: exactDuplicate.text,
        ...buildSimilarityDiagnostics(exactDuplicateScore, config.similarityThresholdToCreate),
        detail: buildDuplicateMemoryDetail(normalizedText, exactDuplicate.text),
      }

      const eventMessage = appendMemoryEventsToChat(chatId, [memoryEvent])
      return {
        eventMessage,
        state: listState(),
        memoryEvent,
      }
    }
    let bestScore = null
    for (const memory of currentMemories) {
      const score = buildMemoryScore(memory, normalizedText, candidateEmbedding)
      if (!bestScore || score.similarity > bestScore.similarity) {
        bestScore = score
      }
    }

    if (bestScore && bestScore.similarity >= config.similarityThresholdToCreate) {
      const memoryEvent = {
        ...buildMemoryEvent(sourceText, baseEvent),
        status: 'rejected',
        reason: 'too_similar',
        storedText: normalizedText,
        conflictingMemoryText: bestScore.memory.text,
        ...buildSimilarityDiagnostics(bestScore, config.similarityThresholdToCreate),
        detail: `Memoria rejeitada: ${toPercent(bestScore.similarity)}% similar a "${bestScore.memory.text}".`,
      }

      const eventMessage = appendMemoryEventsToChat(chatId, [memoryEvent])
      return {
        eventMessage,
        state: listState(),
        memoryEvent,
      }
    }

    const createdMemory = await insertMemory(normalizedText, { embedding: candidateEmbedding })
    const createdPercent = toPercent(bestScore?.similarity ?? 0)
    const createdConflictText = bestScore?.memory.text ?? NO_SIMILAR_MEMORY_LABEL
    const memoryEvent = {
      ...buildMemoryEvent(sourceText, baseEvent),
      status: 'created',
      reason: 'created',
      storedText: createdMemory?.text ?? normalizedText,
      memoryId: createdMemory?.id,
      conflictingMemoryText: createdConflictText,
      similarityPercent: createdPercent,
      detail: `Memoria criada: "${createdMemory?.text ?? normalizedText}" (${createdPercent}% similar a "${createdConflictText}").`,
    }

    const eventMessage = appendMemoryEventsToChat(chatId, [memoryEvent])
    return {
      eventMessage,
      state: listState(),
      memoryEvent,
    }
  }

  function buildCandidateValidationEvent(candidate, error) {
    const message = error instanceof Error ? error.message : String(error)
    const normalizedCandidate = normalizeMemoryText(candidate)
    if (/rotulo sem valor util/i.test(message)) {
      return buildMemoryEvent(candidate, {
        status: 'rejected',
        reason: 'empty',
        storedText: normalizedCandidate,
        detail: `Memoria rejeitada: rotulo sem valor util em "${normalizedCandidate}".`,
      })
    }

    if (/acima do limite/i.test(message)) {
      return buildMemoryEvent(candidate, {
        status: 'rejected',
        reason: 'too_long',
        storedText: normalizedCandidate,
        characterCount: normalizedCandidate.length,
        maxCharacters: config.maxCaracteresMemory,
        detail: `Memoria rejeitada: ${normalizedCandidate.length}/${config.maxCaracteresMemory} caracteres.`,
      })
    }

    return buildMemoryEvent(candidate, {
      status: 'rejected',
      reason: 'empty',
      detail: message,
    })
  }

  async function createNewMemories(historyChat, chatId = null) {
    const lastUserMessage = compactWhitespace(historyChat.lastUserMessage).slice(-config.maxCaracteresMemoryToCreateMemory)
    if (!lastUserMessage) {
      return { created: [], events: [] }
    }

    const relatedMemories = await embeddingsSearch({
      chatText: lastUserMessage,
      maxMemories: config.maxMemoriesPerReply,
    })

    const candidates = dedupeCandidates(
      await generateLlmMemoryCandidates(historyChat, relatedMemories.map((memory) => memory.text)),
    )

    const created = []
    const events = []
    for (const candidate of candidates) {
      try {
        validateLlmMemoryCandidate(candidate, config.maxCaracteresMemory)
      }
      catch (error) {
        events.push(buildCandidateValidationEvent(candidate, error))
        continue
      }

      const normalizedCandidate = normalizeMemoryText(candidate)
      if (!normalizedCandidate) continue

      const candidateEmbedding = await llmClient.embed(normalizedCandidate)
      const duplicatePool = [...listMemories(), ...created]
      const duplicateMatch = duplicatePool.find((memory) => memoryAlreadyExists([memory.text], normalizedCandidate))
      if (duplicateMatch) {
        const duplicateScore = buildMemoryScore(duplicateMatch, normalizedCandidate, candidateEmbedding)
        events.push(buildMemoryEvent(candidate, {
          status: 'rejected',
          reason: 'already_exists',
          storedText: normalizedCandidate,
          conflictingMemoryText: duplicateMatch.text,
          ...buildSimilarityDiagnostics(duplicateScore, config.similarityThresholdToCreate),
          detail: buildDuplicateMemoryDetail(normalizedCandidate, duplicateMatch.text),
        }))
        continue
      }

      const similarMatch = [...listMemories(), ...created]
        .map((memory) => buildMemoryScore(memory, normalizedCandidate, candidateEmbedding))
        .sort((first, second) => second.similarity - first.similarity)[0]

      if (similarMatch && similarMatch.similarity >= config.similarityThresholdToCreate) {
        events.push(buildMemoryEvent(candidate, {
          status: 'rejected',
          reason: 'too_similar',
          storedText: normalizedCandidate,
          conflictingMemoryText: similarMatch.memory.text,
          ...buildSimilarityDiagnostics(similarMatch, config.similarityThresholdToCreate),
          detail: `Memoria rejeitada: ${toPercent(similarMatch.similarity)}% similar a "${similarMatch.memory.text}".`,
        }))
        continue
      }

      const memory = await insertMemory(normalizedCandidate, { embedding: candidateEmbedding })
      if (!memory) continue
      created.push(memory)
      const createdPercent = toPercent(similarMatch?.similarity ?? 0)
      const createdConflictText = similarMatch?.memory.text ?? NO_SIMILAR_MEMORY_LABEL
      events.push(buildMemoryEvent(candidate, {
        status: 'created',
        reason: 'created',
        storedText: memory.text,
        memoryId: memory.id,
        conflictingMemoryText: createdConflictText,
        similarityPercent: createdPercent,
        detail: `Memoria criada: "${memory.text}" (${createdPercent}% similar a "${createdConflictText}").`,
      }))
    }

    appendMemoryEventsToChat(chatId, events)
    return { created, events }
  }

  function formatMemoriesForLlm(memories) {
    return memories.map((memory) => [
      `Memoria: ${memory.text}`,
      `Historico de status: ${JSON.stringify(memory.statusHistory.slice(-10).map((item) => ({
        status: item.status,
        atDays: daysSince(item.at),
      })))} `,
    ].join('\n')).join('\n\n')
  }

  async function generateAssistantText(lastUserMessage, chatText, memories, goodMessages, badMessages) {
    return llmClient.generateText([
      {
        role: 'system',
        content: [
          'Voce responde em portugues do Brasil.',
          'Use as memorias como fonte de verdade para fatos pessoais, preferencias e contexto recorrente.',
          'Se a resposta estiver nas memorias, responda diretamente usando essa informacao.',
          'REGRA CRITICA: inclua todos os fatos recuperados que forem relevantes para a categoria da pergunta, mesmo que tenham sujeitos diferentes do sujeito perguntado.',
          'Interprete cada memoria como um fato limitado pelo seu sujeito, relacao e valor; preserve esses tres elementos.',
          'Nao atribua um fato de uma pessoa a outra nem infira que uma memoria sobre o usuario vale para familiares, parceiros ou outras pessoas.',
          'Antes de responder, compare o sujeito e a categoria do fato pedido com cada fato recuperado. Se houver um fato da mesma categoria para outro sujeito, responda naturalmente com duas afirmacoes: uma informa que o fato pedido para esse sujeito e desconhecido; a outra cita o fato relacionado conhecido, identificando seu sujeito. A resposta e invalida se faltar uma dessas afirmacoes.',
          'Nao ofereca ajuda adicional, nao faca perguntas de acompanhamento e nao mencione memorias.',
          'Nao invente fatos ausentes nas memorias ou no chat.',
          'Use mensagens boas como exemplos de qualidade e evite os padroes das mensagens ruins.',
          'Seja objetivo, util e natural.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Mensagens boas:',
          goodMessages.join('\n') || '(nenhuma)',
          '',
          'Mensagens ruins:',
          badMessages.join('\n') || '(nenhuma)',
          '',
          'Memories:',
          formatMemoriesForLlm(memories) || '(nenhuma memoria relevante)',
          '',
          'Chat recente:',
          chatText.slice(-config.maxCaracteresMemoryContext) || '(vazio)',
          '',
          `Mensagem final do usuario: ${lastUserMessage || '(vazia)'}`,
        ].join('\n'),
      },
    ], { temperature: 0.55 })
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

  async function findMessageFeedbacks(type, chatText) {
    const queryEmbedding = await llmClient.embed(chatText)
    return listMessageFeedbacksStatement.all()
      .map((feedback) => ({
        type: feedback.type,
        content: feedback.content,
        similarity: cosineSimilarity(decodeEmbedding(feedback.embedding), queryEmbedding),
      }))
      .filter((feedback) => feedback.similarity > config.embeddingSimilarityThreshold && feedback.type === type)
      .sort((first, second) => second.similarity - first.similarity)
      .slice(0, config.maxMemoriesPerReply)
      .map((feedback) => feedback.content)
  }

  async function saveMessageFeedback(chatId, message, rating) {
    const type = rating === 1 ? 'good' : 'bad'
    const embedding = await llmClient.embed(message.text)
    insertMessageFeedbackStatement.run(
      chatId,
      message.id,
      type,
      message.text,
      now(),
      encodeEmbedding(embedding),
    )
  }

  function stripMemoryFromChats(memoryId) {
    for (const chat of listChats()) {
      const nextMessages = chat.messages.map((message) => ({
        ...message,
        memoryIds: (message.memoryIds ?? []).filter((currentId) => currentId !== memoryId),
        memoryMatches: (message.memoryMatches ?? []).filter((match) => match.memoryId !== memoryId),
      }))
      writeChat({ ...chat, messages: nextMessages })
    }
  }

  async function agentRespond(chatId) {
    const chat = getChat(chatId)
    if (!chat) return null

    const historyChat = buildHistoryChat(chat.messages)
    await feedbackMemories(historyChat.lastUserMessage, chatId)
    await createNewMemories(historyChat, chatId)

    const memoryQuery = historyChat.chat_text.slice(-config.maxCaracteresMemoryContext)
    const memoriesForReply = await embeddingsSearchWithScores({
      chatText: memoryQuery,
      maxMemories: config.maxMemoriesPerReply,
    })
    const [goodMessages, badMessages] = await Promise.all([
      findMessageFeedbacks('good', historyChat.lastUserMessage),
      findMessageFeedbacks('bad', historyChat.lastUserMessage),
    ])

    incrementMemoryUsage(memoriesForReply.map((item) => item.memory.id))
    const refreshedChat = getChat(chatId)
    if (!refreshedChat) return null

    const assistantMessage = {
      id: createMessageId(),
      author: 'assistant',
      text: await generateAssistantText(
        historyChat.lastUserMessage,
        historyChat.chat_text,
        memoriesForReply.map((item) => item.memory),
        goodMessages,
        badMessages,
      ),
      memoryIds: memoriesForReply.map((item) => item.memory.id),
      memoryMatches: memoriesForReply.map((item) => ({
        memoryId: item.memory.id,
        similarityPercent: toPercent(item.similarity),
      })),
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
      await insertMemory(memory.text, memory)
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
    async createMemory(text, options = {}) {
      return attemptManualMemoryCreate(text, options.chatId ?? null)
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
    async rateAssistantMessage(chatId, messageId, nextRating) {
      const chat = getChat(chatId)
      if (!chat) return { state: listState() }
      if (nextRating !== 1 && nextRating !== -1) return { state: listState() }

      const message = chat.messages.find((entry) => entry.id === messageId && entry.author === 'assistant')
      if (!message) return { state: listState() }

      const previousRating = message.rating ?? 0
      if (previousRating === nextRating) return { state: listState() }

      await saveMessageFeedback(chatId, message, nextRating)
      writeChat({
        ...chat,
        updated_at: toIsoDay(),
        messages: chat.messages.map((entry) => entry.id === messageId ? { ...entry, rating: nextRating } : entry),
      })
      return { state: listState() }
    },
  }
}
