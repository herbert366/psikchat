import { APP_CONFIG } from './config'

export type Message = {
  id: string
  author: 'assistant' | 'user'
  text: string
  memoryIds?: number[]
  rating?: -1 | 0 | 1
}

export type Memory = {
  id: number
  text: string
  created_at: string
  updated_at: string
  feedback_score: number
  usage_count: number
  embedding: number[]
}

export type Chat = {
  id: number
  title: string
  created_at: string
  updated_at: string
  history_chat_json: string
  messages: Message[]
  pinned: boolean
}

type HistoryEntry = { role: 'user' | 'assistant'; content: string }
type HistoryChat = {
  entries: HistoryEntry[]
  chat_text_without_last: string
  chat_text: string
  lastUserMessage: string
}

type MemoryScore = { memory: Memory; similarity: number; score: number }
type SearchInput = { chatText?: string; chat_text?: string; maxMemories?: number; max_memories?: number }

let chats: Chat[] = []
let memories: Memory[] = []
let nextChatId = 1
let nextMemoryId = 1
let nextMessageId = 1

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function buildChatText(entries: HistoryEntry[]) {
  return entries.map((entry) => `${entry.role}: ${entry.content}`).join('\n')
}

function buildHistoryChat(entries: HistoryEntry[]): HistoryChat {
  const userEntries = entries.filter((entry) => entry.role === 'user')
  return {
    entries,
    chat_text_without_last: buildChatText(entries.slice(0, -1)),
    chat_text: buildChatText(entries),
    lastUserMessage: userEntries[userEntries.length - 1]?.content ?? '',
  }
}

function similarityBetween(first: string, second: string) {
  const firstTokens = new Set(tokenize(first))
  const secondTokens = new Set(tokenize(second))
  if (firstTokens.size === 0 || secondTokens.size === 0) return 0

  function tokensMatch(firstToken: string, secondToken: string) {
    if (firstToken === secondToken) return true
    if (firstToken.length < 5 || secondToken.length < 5) return false
    return firstToken.startsWith(secondToken) || secondToken.startsWith(firstToken)
  }

  let intersection = 0
  const matchedSecondTokens = new Set<string>()
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
  if (firstNormalized.includes(secondNormalized) || secondNormalized.includes(firstNormalized)) {
    return Math.max(overlap, 0.82)
  }

  return overlap
}

function buildEmbedding(text: string) {
  return tokenize(text)
    .slice(0, 12)
    .map((token) => token.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0))
}

function serializeHistory(messages: Message[]) {
  return JSON.stringify(messages)
}

function hydrateMessage(message: Message): Message {
  return {
    ...message,
    rating: message.rating ?? 0,
    memoryIds: message.memoryIds ?? [],
  }
}

function createChatRecord({
  id,
  title,
  created_at,
  updated_at,
  messages,
  pinned,
}: {
  id: number
  title: string
  created_at: string
  updated_at: string
  messages: Message[]
  pinned: boolean
}) {
  const hydratedMessages = messages.map(hydrateMessage)
  return {
    id,
    title,
    created_at,
    updated_at,
    messages: hydratedMessages,
    history_chat_json: serializeHistory(hydratedMessages),
    pinned,
  }
}

function rebuildChat(chat: Chat, changes: Partial<Pick<Chat, 'title' | 'updated_at' | 'messages' | 'pinned'>>) {
  const messages = changes.messages ?? chat.messages
  return {
    ...chat,
    ...changes,
    messages,
    history_chat_json: serializeHistory(messages),
  }
}

function initializeState() {
  memories = APP_CONFIG.seedMemories.map((memory) => ({
    ...memory,
    embedding: buildEmbedding(memory.text),
  }))

  chats = APP_CONFIG.seedChats.map((chat) => createChatRecord({
    id: chat.id,
    title: chat.title,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    messages: chat.messages.map((message) => ({ ...message })),
    pinned: false,
  }))

  nextMemoryId = memories.reduce((maxId, memory) => Math.max(maxId, memory.id), 0) + 1
  nextChatId = chats.reduce((maxId, chat) => Math.max(maxId, chat.id), 0) + 1
  nextMessageId = chats
    .flatMap((chat) => chat.messages)
    .reduce((maxId, message) => {
      const parsed = Number(message.id.replace('message-', ''))
      return Number.isFinite(parsed) ? Math.max(maxId, parsed) : maxId
    }, 0) + 1
}

function daysSince(date: string) {
  const parsed = new Date(date)
  const diff = Date.now() - parsed.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function toIsoDay() {
  return new Date().toISOString().slice(0, 10)
}

function createMessageId() {
  const id = `message-${nextMessageId}`
  nextMessageId += 1
  return id
}

function createMemoryId() {
  const id = nextMemoryId
  nextMemoryId += 1
  return id
}

function createChatId() {
  const id = nextChatId
  nextChatId += 1
  return id
}

function buildMemoryScore(memory: Memory, chatText: string): MemoryScore {
  const similarity = similarityBetween(memory.text, chatText)
  const recencyScore = 1 / (daysSince(memory.created_at) + 1)
  const usageScore = memory.usage_count / 10
  const feedbackScore = memory.feedback_score / 5
  return {
    memory,
    similarity,
    score: similarity * 4 + recencyScore + usageScore + feedbackScore,
  }
}

function toShortMemory(text: string) {
  const words = compactWhitespace(text)
    .replace(/[.!?]+$/g, '')
    .split(' ')
    .filter(Boolean)

  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > APP_CONFIG.maxCaracteresMemory) break
    current = next
  }

  return current || compactWhitespace(text).slice(0, APP_CONFIG.maxCaracteresMemory).trim()
}

function createCandidateMemoryFromMessage(message: string) {
  const normalized = normalizeText(message)
  const compact = compactWhitespace(message)
  if (!compact) return null

  const rules = [
    { pattern: /prefiro\s+(.+)/i, prefix: 'Prefere ' },
    { pattern: /gosto\s+de\s+(.+)/i, prefix: 'Gosta de ' },
    { pattern: /quero\s+(.+)/i, prefix: 'Quer ' },
    { pattern: /preciso\s+(.+)/i, prefix: 'Precisa de ' },
    { pattern: /estou\s+(.+)/i, prefix: 'Esta ' },
    { pattern: /me chama\s+(.+)/i, prefix: 'Nome: ' },
    { pattern: /trabalho\s+com\s+(.+)/i, prefix: 'Trabalha com ' },
  ]

  for (const rule of rules) {
    const match = compact.match(rule.pattern)
    if (!match?.[1]) continue
    return toShortMemory(rule.prefix + match[1])
  }

  if (normalized.includes('minha meta') || normalized.includes('meu objetivo')) {
    return toShortMemory(compact.replace(/^.*?(minha meta|meu objetivo)\s*/i, 'Meta: '))
  }

  return null
}

function normalizeSearchInput(input: SearchInput) {
  return {
    chatText: input.chatText ?? input.chat_text ?? '',
    maxMemories: input.maxMemories ?? input.max_memories ?? APP_CONFIG.maxMemoriesPerReply,
  }
}

function embeddingsSearch(input: SearchInput) {
  const { chatText, maxMemories } = normalizeSearchInput(input)
  return memories
    .map((memory) => buildMemoryScore(memory, chatText))
    .filter((item) => item.similarity >= APP_CONFIG.embeddingSimilarityThreshold)
    .sort((first, second) => second.score - first.score)
    .slice(0, maxMemories)
    .map((item) => item.memory)
}

function createNewMemories(historyChat: HistoryChat) {
  const recentChat = historyChat.chat_text.slice(-APP_CONFIG.maxCaracteresMemoryToCreateMemory)
  const recentMemories = embeddingsSearch({ chatText: recentChat, maxMemories: APP_CONFIG.maxMemoriesPerReply })
  const existingTexts = recentMemories.map((memory) => memory.text)
  const candidates = [historyChat.lastUserMessage]
    .map((message) => createCandidateMemoryFromMessage(message))
    .filter((value): value is string => Boolean(value))

  const created: Memory[] = []

  for (const candidate of candidates) {
    const alreadyExists = [...existingTexts, ...created.map((memory) => memory.text), ...memories.map((memory) => memory.text)]
      .some((text) => similarityBetween(text, candidate) > 0.74)

    if (alreadyExists) continue
    created.push(createMemory(candidate))
  }

  return created
}

function summarizeForReply(question: string) {
  const normalized = normalizeText(question)

  if (normalized.includes('rag')) {
    return [
      'RAG mistura busca com geracao.',
      '1. O sistema busca trechos relevantes em uma base.',
      '2. Esses trechos entram no contexto do modelo.',
      '3. O modelo responde usando esse material como apoio.',
      'Exemplo: voce pergunta sobre um contrato e o sistema recupera as clausulas antes de responder.',
    ]
  }

  if (normalized.includes('como funciona')) {
    return [
      'Funciona em tres partes.',
      '1. Entrada do usuario.',
      '2. Recuperacao do contexto util.',
      '3. Resposta orientada por esse contexto.',
    ]
  }

  if (normalized.includes('compare') || normalized.includes('compar')) {
    return [
      'Vale comparar por criterio.',
      '1. Objetivo.',
      '2. Custo.',
      '3. Risco.',
      '4. Velocidade para testar.',
    ]
  }

  return [
    'Entendi o ponto principal.',
    'Posso te ajudar quebrando isso em objetivo, contexto e proximo passo pratico.',
  ]
}

function applyMemoryStyle(lines: string[], memoryTexts: string[]) {
  const normalizedMemories = memoryTexts.map((memory) => normalizeText(memory))
  const wantsExampleFirst = normalizedMemories.some((memory) => memory.includes('exemplo'))
  const wantsComparison = normalizedMemories.some((memory) => memory.includes('compar'))
  const wantsDirect = normalizedMemories.some((memory) => memory.includes('direto') || memory.includes('objetivas'))

  const nextLines = [...lines]
  if (wantsExampleFirst && !nextLines.some((line) => normalizeText(line).startsWith('exemplo:'))) {
    nextLines.unshift('Exemplo: voce faz uma pergunta, o sistema busca contexto relevante e so depois gera a resposta.')
  }

  if (wantsComparison) {
    nextLines.push('Se quiser, comparo isso com busca keyword pura ou fine-tuning.')
  }

  if (wantsDirect) {
    return nextLines.slice(0, 5)
  }

  return nextLines
}

function generateAssistantText(lastUserMessage: string, memoryTexts: string[]) {
  const baseLines = summarizeForReply(lastUserMessage)
  return applyMemoryStyle(baseLines, memoryTexts).join('\n')
}

function createMemory(text: string) {
  const trimmed = toShortMemory(text)
  const today = toIsoDay()
  const memory = {
    id: createMemoryId(),
    text: trimmed,
    created_at: today,
    updated_at: today,
    feedback_score: 0,
    usage_count: 0,
    embedding: buildEmbedding(trimmed),
  }
  memories = [...memories, memory]
  return memory
}

function incrementMemoryUsage(memoryIds: number[]) {
  if (memoryIds.length === 0) return
  const usedIds = new Set(memoryIds)
  const today = toIsoDay()
  memories = memories.map((memory) => usedIds.has(memory.id)
    ? { ...memory, usage_count: memory.usage_count + 1, updated_at: today }
    : memory)
}

function adjustMemoryFeedback(memoryIds: number[], delta: number) {
  if (memoryIds.length === 0 || delta === 0) return
  const affectedIds = new Set(memoryIds)
  const today = toIsoDay()
  memories = memories.map((memory) => affectedIds.has(memory.id)
    ? { ...memory, feedback_score: memory.feedback_score + delta, updated_at: today }
    : memory)
}

function setChatMessages(chatId: number, messages: Message[]) {
  const today = toIsoDay()
  chats = chats.map((chat) => chat.id === chatId
    ? rebuildChat(chat, { messages: messages.map(hydrateMessage), updated_at: today })
    : chat)
}

function agentRespond(chatId: number) {
  const chat = chats.find((item) => item.id === chatId)
  if (!chat) return null

  const historyChat = buildHistoryChat(chat.messages.map((message) => ({ role: message.author, content: message.text })))
  createNewMemories(historyChat)

  const memoriesForReply = embeddingsSearch({
    chatText: historyChat.lastUserMessage || historyChat.chat_text,
    maxMemories: APP_CONFIG.maxMemoriesPerReply,
  })

  incrementMemoryUsage(memoriesForReply.map((memory) => memory.id))

  const assistantMessage: Message = {
    id: createMessageId(),
    author: 'assistant',
    text: generateAssistantText(
      historyChat.lastUserMessage,
      memoriesForReply.map((memory) => memory.text),
    ),
    memoryIds: memoriesForReply.map((memory) => memory.id),
    rating: 0,
  }

  setChatMessages(chatId, [...chat.messages, assistantMessage])
  return assistantMessage
}

initializeState()

export const db = {
  reset: () => {
    initializeState()
  },
  chats: () => chats,
  messages: (chatId: number) => chats.find((chat) => chat.id === chatId)?.messages ?? [],
  memories: () => memories,
  embeddingsSearch: (input: SearchInput) => embeddingsSearch(input),
  addMessage: (chatId: number, message: Message) => {
    const chat = chats.find((item) => item.id === chatId)
    if (!chat) return
    setChatMessages(chatId, [...chat.messages, hydrateMessage(message)])
  },
  sendUserMessage: (chatId: number, text: string) => {
    const chat = chats.find((item) => item.id === chatId)
    if (!chat) return { userMessage: null, assistantMessage: null }

    const userMessage: Message = { id: createMessageId(), author: 'user', text, memoryIds: [], rating: 0 }
    setChatMessages(chatId, [...chat.messages, userMessage])
    const assistantMessage = agentRespond(chatId)
    return { userMessage, assistantMessage }
  },
  createChat: (title = 'Novo chat') => {
    const today = toIsoDay()
    const chat = createChatRecord({
      id: createChatId(),
      title,
      created_at: today,
      updated_at: today,
      messages: [],
      pinned: false,
    })
    chats = [...chats, chat]
    return chat
  },
  renameChat: (id: number, title: string) => {
    const today = toIsoDay()
    chats = chats.map((chat) => chat.id === id ? rebuildChat(chat, { title, updated_at: today }) : chat)
  },
  toggleChatPinned: (id: number) => {
    const today = toIsoDay()
    chats = chats.map((chat) => chat.id === id ? rebuildChat(chat, { pinned: !chat.pinned, updated_at: today }) : chat)
  },
  deleteChat: (id: number) => {
    chats = chats.filter((chat) => chat.id !== id)
  },
  createMemory,
  updateMemory: (id: number, text: string) => {
    const nextText = toShortMemory(text)
    if (!nextText) return

    const today = toIsoDay()
    memories = memories.map((memory) => memory.id === id ? {
      ...memory,
      text: nextText,
      updated_at: today,
      embedding: buildEmbedding(nextText),
    } : memory)
  },
  deleteMemory: (id: number) => {
    memories = memories.filter((memory) => memory.id !== id)
    chats = chats.map((chat) => rebuildChat(chat, {
      messages: chat.messages.map((message) => ({
        ...message,
        memoryIds: message.memoryIds?.filter((memoryId) => memoryId !== id) ?? [],
      })),
    }))
  },
  rateAssistantMessage: (chatId: number, messageId: string, nextRating: -1 | 0 | 1) => {
    const chat = chats.find((item) => item.id === chatId)
    const message = chat?.messages.find((item) => item.id === messageId && item.author === 'assistant')
    if (!chat || !message) return

    const previousRating = message.rating ?? 0
    if (previousRating === nextRating) return

    adjustMemoryFeedback(message.memoryIds ?? [], nextRating - previousRating)
    setChatMessages(chatId, chat.messages.map((entry) => entry.id === messageId ? { ...entry, rating: nextRating } : entry))
  },
}
