import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'
import { APP_CONFIG } from './config'
import { appDataSource } from './dataSource'
import type { AppDataSource, AppSnapshot, StateResult } from './dataSource'
import type { Chat, Memory, MemoryEmbeddingSimilarityPage, MemoryEvent, MemoryFeedback, MemoryStatus, Message } from './appTypes'
import { MessageHoverActions } from './components/MessageHoverActions'

type View = 'chat' | 'memories'
type MemorySort = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'usage-desc' | 'usage-asc' | 'feedback-desc' | 'feedback-asc'
type MemoryCluster = { id: number; items: Memory[]; similarityPercent: number }
type QueuedMessage = { id: string; chatId: number; text: string }
type OptimisticUserMessage = { id: string; chatId: number; text: string }
type MemorySimilarityDebug = { text: string; result: MemoryEmbeddingSimilarityPage | null; error: string | null }
type LlmPromptDialog = { title: string; text: string }

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 10.4V20M12 10.4C12 8.15979 12 7.03969 11.564 6.18404C11.1805 5.43139 10.5686 4.81947 9.81596 4.43597C8.96031 4 7.84021 4 5.6 4H4.6C4.03995 4 3.75992 4 3.54601 4.10899C3.35785 4.20487 3.20487 4.35785 3.10899 4.54601C3 4.75992 3 5.03995 3 5.6V16.4C3 16.9601 3 17.2401 3.10899 17.454C3.20487 17.6422 3.35785 17.7951 3.54601 17.891C3.75992 18 4.03995 18 4.6 18H7.54668C8.08687 18 8.35696 18 8.61814 18.0466C8.84995 18.0879 9.0761 18.1563 9.29191 18.2506C9.53504 18.3567 9.75977 18.5065 10.2092 18.8062L12 20M12 10.4C12 8.15979 12 7.03969 12.436 6.18404C12.8195 5.43139 13.4314 4.81947 14.184 4.43597C15.0397 4 16.1598 4 18.4 4H19.4C19.9601 4 20.2401 4 20.454 4.10899C20.6422 4.20487 20.7951 4.35785 20.891 4.54601C21 4.75992 21 5.03995 21 5.6V16.4C21 16.9601 21 17.2401 20.891 17.454C20.7951 17.6422 20.6422 17.7951 20.454 17.891C20.2401 18 19.9601 18 19.4 18H16.4533C15.9131 18 15.643 18 15.3819 18.0466C15.15 18.0879 14.9239 18.1563 14.7081 18.2506C14.465 18.3567 14.2402 18.5065 13.7908 18.8062L12 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function renderMemoryEventDebug(memoryEvent: MemoryEvent) {
  switch (memoryEvent.reason) {
    case 'created':
      return <p><span className="memory-event-emphasis success">criou:</span> "{memoryEvent.storedText}"{memoryEvent.similarityPercent != null && memoryEvent.conflictingMemoryText && <span className="memory-event-similarity"> ({memoryEvent.similarityPercent}% similar a "{memoryEvent.conflictingMemoryText}")</span>}</p>
    case 'too_long':
      return <p><span className="memory-event-emphasis danger">rejeitou:</span> {memoryEvent.characterCount}/{memoryEvent.maxCharacters} caracteres</p>
    case 'already_exists':
      return (
        <>
          <p><span className="memory-event-emphasis danger">rejeitou:</span> tentou criar "{memoryEvent.storedText ?? memoryEvent.sourceText}", mas ja existe "{memoryEvent.conflictingMemoryText}"</p>
          {renderSimilarityBreakdown(memoryEvent)}
        </>
      )
    case 'too_similar':
      return (
        <>
          <p><span className="memory-event-emphasis danger">rejeitou:</span> {memoryEvent.similarityPercent}% similar a "{memoryEvent.conflictingMemoryText}"</p>
          {renderSimilarityBreakdown(memoryEvent)}
        </>
      )
    default:
      return <p><span className="memory-event-emphasis danger">rejeitou:</span> texto vazio apos normalizacao</p>
  }
}

function renderMemoryFeedbackDebug(memoryFeedback: MemoryFeedback) {
  if (memoryFeedback.status === 'positive') {
    return <p><span className="memory-event-emphasis success">confirmou:</span> "{memoryFeedback.memoryText}"</p>
  }

  if (memoryFeedback.status === 'negative') {
    return <p><span className="memory-event-emphasis danger">contradisse:</span> "{memoryFeedback.memoryText}"</p>
  }

  return <p><span className="memory-event-emphasis">sem evidencia:</span> "{memoryFeedback.memoryText}"</p>
}

function sortMemoryStatusHistory(statusHistory: MemoryStatus[]) {
  return [...statusHistory].sort((first, second) => second.at.localeCompare(first.at))
}

function renderMemoryStatusLabel(status: MemoryStatus['status']) {
  return status === 'positive' ? 'positivo' : 'negativo'
}

function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const monthMs = 30 * dayMs

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs))
    return `ha ${minutes} min`
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs)
    return `ha ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  }

  if (diffMs < monthMs) {
    const days = Math.floor(diffMs / dayMs)
    return `ha ${days} ${days === 1 ? 'dia' : 'dias'}`
  }

  const months = Math.floor(diffMs / monthMs)
  return `ha ${months} ${months === 1 ? 'mes' : 'meses'}`
}

function resolveMemoryEventTitle(memoryEvents: MemoryEvent[]) {
  const createdCount = memoryEvents.filter((event) => event.status === 'created').length
  const rejectedCount = memoryEvents.length - createdCount
  if (createdCount > 0 && rejectedCount > 0) return 'Memoria atualizada'
  if (createdCount > 1) return 'Memorias atualizadas'
  if (createdCount === 1) return 'Memoria atualizada'
  return rejectedCount > 1 ? 'Memorias rejeitadas' : 'Memoria rejeitada'
}

function parseMemoryFeedbacksFromSystemText(text: string): MemoryFeedback[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map<MemoryFeedback | null>((line) => {
      const positiveMatch = line.match(/^Feedback positivo: memoria (\d+) confirmada por "(.+)"\.$/)
      if (positiveMatch) return { memoryId: Number(positiveMatch[1]), memoryText: positiveMatch[2]!, score: 1, status: 'positive', detail: line }

      const negativeMatch = line.match(/^Feedback negativo: memoria (\d+) contradita por "(.+)"\.$/)
      if (negativeMatch) return { memoryId: Number(negativeMatch[1]), memoryText: negativeMatch[2]!, score: -1, status: 'negative', detail: line }

      const neutralMatch = line.match(/^Feedback neutro: memoria (\d+) sem evidencia suficiente para "(.+)"\.$/)
      if (neutralMatch) return { memoryId: Number(neutralMatch[1]), memoryText: neutralMatch[2]!, score: 0, status: 'neutral', detail: line }

      return null
    })
    .filter((feedback): feedback is MemoryFeedback => Boolean(feedback))
}

function parseMemoryEventsFromSystemText(text: string): MemoryEvent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map<MemoryEvent | null>((line) => {
      const createdMatch = line.match(/^Memoria criada: "(.+)"(?:\s*\((\d+)% similar a "(.+)"\))?\.$/)
      if (createdMatch) return { action: 'create', status: 'created', reason: 'created', sourceText: createdMatch[1]!, storedText: createdMatch[1]!, similarityPercent: createdMatch[2] != null ? Number(createdMatch[2]) : undefined, conflictingMemoryText: createdMatch[3], detail: line }

      const similarMatch = line.match(/^Memoria rejeitada: (\d+)% similar a "(.+)"\.$/)
      if (similarMatch) return { action: 'create', status: 'rejected', reason: 'too_similar', sourceText: line, conflictingMemoryText: similarMatch[2]!, similarityPercent: Number(similarMatch[1]), detail: line }

      const tooLongMatch = line.match(/^Memoria rejeitada: (\d+)\/(\d+) caracteres\.$/)
      if (tooLongMatch) return { action: 'create', status: 'rejected', reason: 'too_long', sourceText: line, characterCount: Number(tooLongMatch[1]), maxCharacters: Number(tooLongMatch[2]), detail: line }

      const duplicateDetailMatch = line.match(/^Memoria rejeitada: tentou criar "(.+)", mas ela duplica "(.+)"\.$/)
      if (duplicateDetailMatch) return { action: 'create', status: 'rejected', reason: 'already_exists', sourceText: duplicateDetailMatch[1]!, storedText: duplicateDetailMatch[1]!, conflictingMemoryText: duplicateDetailMatch[2]!, detail: line }

      const duplicateMatch = line.match(/^Memoria rejeitada: ja existe (?:uma memoria igual|algo equivalente a "(.+)")\.?$/)
      if (duplicateMatch) return { action: 'create', status: 'rejected', reason: 'already_exists', sourceText: line, conflictingMemoryText: duplicateMatch[1], detail: line }

      if (line.startsWith('Memoria rejeitada:')) return { action: 'create', status: 'rejected', reason: 'empty', sourceText: line, detail: line }
      return null
    })
    .filter((event): event is MemoryEvent => Boolean(event))
}

function renderMessageBody(item: Message) {
  const memoryEvents = item.memoryEvents ?? (item.memoryEvent ? [item.memoryEvent] : parseMemoryEventsFromSystemText(item.text))
  const memoryFeedbacks = item.memoryFeedbacks ?? parseMemoryFeedbacksFromSystemText(item.text)
  if (item.author === 'system' && memoryEvents.length > 0) {
    return (
      <div className="memory-event-card">
        <div className="memory-event-header">
          <BookIcon />
          <strong>{resolveMemoryEventTitle(memoryEvents)}</strong>
        </div>
        {memoryEvents.map((memoryEvent, index) => (
          <div key={`${memoryEvent.reason}-${index}`}>
            {renderMemoryEventDebug(memoryEvent)}
          </div>
        ))}
      </div>
    )
  }

  if (item.author === 'system' && memoryFeedbacks.length > 0) {
    return (
      <div className="memory-event-card">
        <div className="memory-event-header">
          <BookIcon />
          <strong>Feedbacks</strong>
        </div>
        {memoryFeedbacks.map((memoryFeedback, index) => (
          <div key={`${memoryFeedback.memoryId}-${memoryFeedback.score}-${index}`}>
            {renderMemoryFeedbackDebug(memoryFeedback)}
          </div>
        ))}
      </div>
    )
  }

  return <p>{item.text}</p>
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Algo falhou ao sincronizar os dados.'
}

function formatMemoryAge(createdAt: string) {
  const createdDate = new Date(`${createdAt}T00:00:00`)
  const ageInDays = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))

  if (ageInDays === 0) return 'criada hoje'
  return `criada ha ${ageInDays} ${ageInDays === 1 ? 'dia' : 'dias'}`
}

function tokenizeText(value: string) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function renderSimilarityBreakdown(memoryEvent: MemoryEvent) {
  if (memoryEvent.embeddingSimilarityPercent == null && memoryEvent.lexicalSimilarityPercent == null && memoryEvent.similarityPercent == null) return null

  return (
    <p className="memory-event-similarity">
      embedding: {memoryEvent.embeddingSimilarityPercent ?? 0}% · lexical: {memoryEvent.lexicalSimilarityPercent ?? 0}% · score final: {memoryEvent.similarityPercent ?? 0}%
      {memoryEvent.truthSimilaritySource && ` (fonte da verdade: max = ${memoryEvent.truthSimilaritySource})`}
      {memoryEvent.similarityThresholdPercent != null && ` · limiar: ${memoryEvent.similarityThresholdPercent}%`}
    </p>
  )
}

function lexicalSimilarity(first: string, second: string) {
  const firstTokens = new Set(tokenizeText(first))
  const secondTokens = new Set(tokenizeText(second))
  if (firstTokens.size === 0 || secondTokens.size === 0) return 0

  let intersection = 0
  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      intersection += 1
    }
  }

  return intersection / (firstTokens.size + secondTokens.size - intersection)
}

function cosineSimilarity(first: number[], second: number[]) {
  if (first.length === 0 || second.length === 0 || first.length !== second.length) return 0

  let dot = 0
  let firstMagnitude = 0
  let secondMagnitude = 0
  for (let index = 0; index < first.length; index += 1) {
    dot += first[index]! * second[index]!
    firstMagnitude += first[index]! ** 2
    secondMagnitude += second[index]! ** 2
  }

  if (firstMagnitude === 0 || secondMagnitude === 0) return 0
  return dot / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude))
}

function memoryClusterSimilarityScore(first: Memory, second: Memory) {
  const lexicalScore = lexicalSimilarity(first.text, second.text)
  const embeddingScore = Math.max(0, cosineSimilarity(first.embedding, second.embedding))
  const weightedScore = (lexicalScore * APP_CONFIG.memoryClusterSimilarityWeights.lexical)
    + (embeddingScore * APP_CONFIG.memoryClusterSimilarityWeights.embedding)

  return Math.max(lexicalScore, weightedScore)
}

function clusterSimilarityPercent(items: Memory[]) {
  if (items.length < 2) return 0

  let totalScore = 0
  let pairCount = 0

  for (let firstIndex = 0; firstIndex < items.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      totalScore += memoryClusterSimilarityScore(items[firstIndex]!, items[secondIndex]!)
      pairCount += 1
    }
  }

  return pairCount === 0 ? 0 : Math.round((totalScore / pairCount) * 100)
}

function memoriesAreRelated(first: Memory, second: Memory) {
  const lexicalScore = lexicalSimilarity(first.text, second.text)
  if (lexicalScore >= APP_CONFIG.memoryClusterSimilarityThreshold) return true

  const embeddingScore = cosineSimilarity(first.embedding, second.embedding)
  return lexicalScore >= APP_CONFIG.memoryClusterLexicalFloor
    && embeddingScore >= APP_CONFIG.memoryClusterEmbeddingThreshold
}

function buildMemoryClusters(memories: Memory[]): MemoryCluster[] {
  const remaining = [...memories]
  const clusters: MemoryCluster[] = []

  while (remaining.length > 0) {
    const current = remaining.shift()
    if (!current) break

    const similarItems = remaining.filter((candidate) => memoriesAreRelated(current, candidate))

    if (similarItems.length === 0) continue

    const clusterItemIds = new Set([current.id, ...similarItems.map((item) => item.id)])
    const items = [current, ...similarItems]
    clusters.push({ id: current.id, items, similarityPercent: clusterSimilarityPercent(items) })

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (clusterItemIds.has(remaining[index]!.id)) {
        remaining.splice(index, 1)
      }
    }
  }

  return clusters
}

type AppProps = {
  dataSource?: AppDataSource
}

function App({ dataSource = appDataSource }: AppProps) {
  const [view, setView] = useState<View>('chat')
  const [isChatsOpen, setIsChatsOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [memory, setMemory] = useState('')
  const [memories, setMemories] = useState<Memory[]>([])
  const [isMemoryOpen, setIsMemoryOpen] = useState(false)
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null)
  const [memoryMessageId, setMemoryMessageId] = useState<string | null>(null)
  const [llmPromptDialog, setLlmPromptDialog] = useState<LlmPromptDialog | null>(null)
  const [memorySimilarityDebug, setMemorySimilarityDebug] = useState<MemorySimilarityDebug | null>(null)
  const [isLoadingMemorySimilarityDebug, setIsLoadingMemorySimilarityDebug] = useState(false)
  const [tablePage, setTablePage] = useState(0)
  const [memorySearch, setMemorySearch] = useState('')
  const [memorySort, setMemorySort] = useState<MemorySort>('updated-desc')
  const [clusterPage, setClusterPage] = useState(0)
  const [openChatMenuId, setOpenChatMenuId] = useState<number | null>(null)
  const [editingChatId, setEditingChatId] = useState<number | null>(null)
  const [chatTitle, setChatTitle] = useState('')
  const [appError, setAppError] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isResettingApp, setIsResettingApp] = useState(false)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [sendingChatId, setSendingChatId] = useState<number | null>(null)
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<OptimisticUserMessage | null>(null)
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const chatTitleInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const activeChatRef = useRef<number | null>(null)
  const queuedMessagesRef = useRef<QueuedMessage[]>([])

  const searchableText = normalizeSearchText(memorySearch.trim())
  const filteredMemories = memories.filter((memoryItem) => normalizeSearchText(memoryItem.text).includes(searchableText))
  const sortedMemories = [...filteredMemories].sort((first, second) => {
    const [field, direction] = memorySort.split('-') as ['updated' | 'created' | 'usage' | 'feedback', 'asc' | 'desc']
    const firstValue = field === 'updated' ? first.updated_at : field === 'created' ? first.created_at : field === 'usage' ? first.usage_count : first.feedback_score
    const secondValue = field === 'updated' ? second.updated_at : field === 'created' ? second.created_at : field === 'usage' ? second.usage_count : second.feedback_score
    const comparison = typeof firstValue === 'string' ? firstValue.localeCompare(secondValue as string) : firstValue - (secondValue as number)
    return direction === 'asc' ? comparison : -comparison
  })
  const totalTablePages = Math.max(1, Math.ceil(sortedMemories.length / APP_CONFIG.tablePageSize))
  const currentMemoryIds = new Set(memories.map((memoryItem) => memoryItem.id))
  const memoriesById = new Map(memories.map((memoryItem) => [memoryItem.id, memoryItem]))
  const visibleClusters = buildMemoryClusters(memories)
    .map((cluster) => {
      const items = cluster.items.filter((item) => currentMemoryIds.has(item.id))
      return { ...cluster, items, similarityPercent: clusterSimilarityPercent(items) }
    })
    .filter((cluster) => cluster.items.length > 1)
  const totalClusterPages = Math.max(1, Math.ceil(visibleClusters.length / APP_CONFIG.clusterPageSize))

  const currentTablePage = Math.min(tablePage, totalTablePages - 1)
  const paginatedMemories = sortedMemories.slice(currentTablePage * APP_CONFIG.tablePageSize, (currentTablePage + 1) * APP_CONFIG.tablePageSize)
  const currentClusterPage = Math.min(clusterPage, totalClusterPages - 1)
  const paginatedClusters = visibleClusters.slice(currentClusterPage * APP_CONFIG.clusterPageSize, (currentClusterPage + 1) * APP_CONFIG.clusterPageSize)
  const orderedChats = [...chats].sort((first, second) => Number(second.pinned) - Number(first.pinned))
  const currentActiveChatId = activeChat && chats.some((chat) => chat.id === activeChat)
    ? activeChat
    : orderedChats[0]?.id ?? null
  const activeChatRecord = chats.find((chat) => chat.id === currentActiveChatId) ?? orderedChats[0] ?? null
  const messages = activeChatRecord?.messages ?? []
  const visibleMessages = optimisticUserMessage?.chatId === currentActiveChatId
    ? [...messages, { id: optimisticUserMessage.id, author: 'user' as const, text: optimisticUserMessage.text }]
    : messages
  const queuedMessagesForActiveChat = queuedMessages.filter((item) => item.chatId === currentActiveChatId)

  useEffect(() => {
    activeChatRef.current = currentActiveChatId
  }, [currentActiveChatId])

  useEffect(() => {
    if (view === 'chat' && currentActiveChatId && !isMemoryOpen) {
      messageInputRef.current?.focus()
    }
  }, [view, currentActiveChatId, isMemoryOpen])

  useEffect(() => {
    if (editingChatId) {
      chatTitleInputRef.current?.focus()
      chatTitleInputRef.current?.select()
    }
  }, [editingChatId])

  useEffect(() => {
    let isActive = true

    void dataSource.loadState()
      .then((snapshot) => {
        if (!isActive) return
        setChats(snapshot.chats)
        setMemories(snapshot.memories)
        setActiveChat((current) => current && snapshot.chats.some((chat) => chat.id === current)
          ? current
          : snapshot.chats[0]?.id ?? null)
        setAppError(null)
      })
      .catch((error) => {
        if (!isActive) return
        setAppError(resolveErrorMessage(error))
      })
      .finally(() => {
        if (isActive) {
          setIsBootstrapping(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [dataSource])

  function applySnapshot(snapshot: AppSnapshot, preferredChatId: number | null = currentActiveChatId) {
    setChats(snapshot.chats)
    setMemories(snapshot.memories)

    if (preferredChatId && snapshot.chats.some((chat) => chat.id === preferredChatId)) {
      setActiveChat(preferredChatId)
      return
    }

    setActiveChat(snapshot.chats[0]?.id ?? null)
  }

  function syncStateOperation<T extends StateResult>(
    result: Promise<T>,
    options: { preferredChatId?: number | null; clearError?: boolean; onSuccess?: (value: T) => void; trackSending?: boolean } = {},
  ) {
    const applyResult = (value: T) => {
      if (options.clearError !== false) {
        setAppError(null)
      }
      applySnapshot(value.state, options.preferredChatId)
      options.onSuccess?.(value)
    }

    if (options.trackSending) {
      setIsSendingMessage(true)
    }

    void result
      .then((value) => applyResult(value))
      .catch((error) => setAppError(resolveErrorMessage(error)))
      .finally(() => {
        if (options.trackSending) {
          setIsSendingMessage(false)
        }
      })
  }

  function updateQueuedMessages(updater: (current: QueuedMessage[]) => QueuedMessage[]) {
    setQueuedMessages((current) => {
      const next = updater(current)
      queuedMessagesRef.current = next
      return next
    })
  }

  function takeNextQueuedMessage() {
    const [nextMessage, ...rest] = queuedMessagesRef.current
    if (!nextMessage) return null

    queuedMessagesRef.current = rest
    setQueuedMessages(rest)
    return nextMessage
  }

  function startMessageRequest(chatId: number, text: string) {
    setAppError(null)
    setMessage('')
    setMemoryMessageId(null)
    setIsSendingMessage(true)
    setSendingChatId(chatId)
    setOptimisticUserMessage({
      id: `pending-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chatId,
      text,
    })

    void dataSource.sendUserMessageStream(chatId, text, (event) => {
      setOptimisticUserMessage(null)
      applySnapshot(event.state, activeChatRef.current)
      setAppError(null)
    })
      .then((value) => {
        applySnapshot(value.state, activeChatRef.current)
        setAppError(null)
      })
      .catch((error) => setAppError(resolveErrorMessage(error)))
      .finally(() => {
        setIsSendingMessage(false)
        setSendingChatId(null)
        setOptimisticUserMessage(null)

        const nextMessage = takeNextQueuedMessage()
        if (nextMessage) {
          startMessageRequest(nextMessage.chatId, nextMessage.text)
        }
      })
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text) return

    if (!currentActiveChatId) return

    if (isSendingMessage) {
      updateQueuedMessages((current) => [...current, {
        id: `queued-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        chatId: currentActiveChatId,
        text,
      }])
      setMessage('')
      return
    }

    startMessageRequest(currentActiveChatId, text)
  }

  function createMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = memory.trim()
    if (!text) return

    syncStateOperation(dataSource.createMemory(text, currentActiveChatId), {
      onSuccess: () => {
        setMemory('')
        setIsMemoryOpen(false)
        setView('chat')
      },
    })
  }

  function editMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = memory.trim()
    if (!text || editingMemoryId === null) return
    syncStateOperation(dataSource.updateMemory(editingMemoryId, text), {
      onSuccess: () => {
        setMemory('')
        setEditingMemoryId(null)
        setIsMemoryOpen(false)
      },
    })
  }

  function openMemoryEditor(memoryItem: Memory) {
    setEditingMemoryId(memoryItem.id)
    setMemory(memoryItem.text)
    setIsMemoryOpen(true)
  }

  function deleteMemory(id: number) {
    syncStateOperation(dataSource.deleteMemory(id), { preferredChatId: currentActiveChatId })
    setClusterPage((page) => Math.min(page, Math.max(0, Math.ceil(visibleClusters.length / APP_CONFIG.clusterPageSize) - 1)))
  }

  function rateAssistantMessage(messageId: string, rating: -1 | 1) {
    if (!currentActiveChatId) return
    syncStateOperation(dataSource.rateAssistantMessage(currentActiveChatId, messageId, rating), { preferredChatId: currentActiveChatId })
  }

  function loadMemorySimilarityDebug(text: string, page: number) {
    setIsLoadingMemorySimilarityDebug(true)
    void dataSource.inspectMemoryEmbeddingSimilarity(text, page, APP_CONFIG.tablePageSize)
      .then((result) => {
        setMemorySimilarityDebug((current) => current?.text === text
          ? { text, result, error: null }
          : current)
      })
      .catch((error) => {
        setMemorySimilarityDebug((current) => current?.text === text
          ? { ...current, error: resolveErrorMessage(error) }
          : current)
      })
      .finally(() => setIsLoadingMemorySimilarityDebug(false))
  }

  function openMemorySimilarityDebug(text: string) {
    setMemorySimilarityDebug({ text, result: null, error: null })
    loadMemorySimilarityDebug(text, 0)
  }

  function navigate(target: View) {
    setIsMemoryOpen(false)
    setView(target)
  }

  function selectChat(chatId: number) {
    setActiveChat(chatId)
    navigate('chat')
  }

  function openRenameChat(chatId: number) {
    const chat = chats.find((item) => item.id === chatId)
    if (!chat) return
    setEditingChatId(chatId)
    setChatTitle(chat.title)
    setOpenChatMenuId(null)
  }

  function saveChatRename() {
    const title = chatTitle.trim()
    if (!title || !editingChatId) return
    syncStateOperation(dataSource.renameChat(editingChatId, title), {
      preferredChatId: currentActiveChatId,
      onSuccess: () => {
        setEditingChatId(null)
        setChatTitle('')
      },
    })
  }

  function handleChatRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveChatRename()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditingChatId(null)
      setChatTitle('')
    }
  }

  function toggleChatPinned(chatId: number) {
    syncStateOperation(dataSource.toggleChatPinned(chatId), {
      preferredChatId: currentActiveChatId,
      onSuccess: () => setOpenChatMenuId(null),
    })
  }

  function deleteChat(chatId: number) {
    syncStateOperation(dataSource.deleteChat(chatId), {
      preferredChatId: currentActiveChatId === chatId ? null : currentActiveChatId,
      onSuccess: () => setOpenChatMenuId(null),
    })
  }

  function startNewChat() {
    syncStateOperation(dataSource.createChat(), {
      onSuccess: ({ chat }) => {
        setMessage('')
        setMemoryMessageId(null)
        if (chat) {
          setActiveChat(chat.id)
        }
        updateQueuedMessages(() => [])
        setOptimisticUserMessage(null)
        setSendingChatId(null)
        navigate('chat')
      },
    })
  }

  function resetAppData() {
    setIsResettingApp(true)
    setAppError(null)

    void dataSource.resetApp()
      .then((value) => {
        applySnapshot(value.state, value.chat?.id ?? null)
        setMessage('')
        setMemory('')
        setMemoryMessageId(null)
        setEditingMemoryId(null)
        setIsMemoryOpen(false)
        setEditingChatId(null)
        setChatTitle('')
        setOpenChatMenuId(null)
        setIsChatsOpen(true)
        setView('chat')
        updateQueuedMessages(() => [])
        setOptimisticUserMessage(null)
        setSendingChatId(null)
        setAppError(null)
        setIsResetDialogOpen(false)
      })
      .catch((error) => setAppError(resolveErrorMessage(error)))
      .finally(() => setIsResettingApp(false))
  }

  return (
    <main className="chat-shell">
      <aside className="sidebar" aria-label="Conversas">
        <nav className="side-nav" aria-label="Navegacao principal">
          <div className="sidebar-header">
          <button
            className="chats-toggle"
            type="button"
            aria-expanded={isChatsOpen}
            onClick={() => setIsChatsOpen((current) => !current)}
          >
            <span>Chats</span>
             <span className="chevron" aria-hidden="true" />
          </button>
          <button className="new-chat" type="button" aria-label="Novo chat" onClick={startNewChat}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M8 9.00006H6.2C5.0799 9.00006 4.51984 9.00006 4.09202 9.21805C3.71569 9.40979 3.40973 9.71575 3.21799 10.0921C3 10.5199 3 11.08 3 12.2001V17.8001C3 18.9202 3 19.4802 3.21799 19.908C3.40973 20.2844 3.71569 20.5903 4.09202 20.7821C4.51984 21.0001 5.07989 21.0001 6.2 21.0001H17.787C18.9071 21.0001 19.4671 21.0001 19.895 20.7821C20.2713 20.5903 20.5772 20.2844 20.769 19.908C20.987 19.4802 20.987 18.9202 20.987 17.8001V12.0001M6 15.0001H6.01M10 15H10.01M11.5189 12.8946L12.8337 12.6347C13.5432 12.4945 13.8979 12.4244 14.2287 12.2953C14.5223 12.1807 14.8013 12.0318 15.06 11.8516C15.3514 11.6487 15.607 11.393 16.1184 10.8816L21.2668 5.73321C21.9541 5.04596 21.9541 3.9317 21.2668 3.24444C20.5796 2.55719 19.4653 2.55719 18.7781 3.24445L13.5416 8.48088C13.0625 8.96004 12.8229 9.19963 12.6294 9.47121C12.4576 9.71232 12.3131 9.97174 12.1986 10.2447C12.0696 10.5522 12.0696 10.8821 11.837 11.5417L11.5189 12.8946Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          </div>
          {isChatsOpen && (
            <div className="chat-list">
                {orderedChats.map((chat) => (
                  <div
                      className={`chat-list-item ${view === 'chat' && activeChat === chat.id ? 'active' : ''}`}
                      key={chat.id}
                   >
                       <button className="chat-title" type="button" onClick={() => selectChat(chat.id)}>
                         {chat.pinned && <span className="chat-pin" aria-label="Chat fixado">&#128204;</span>}
                         <span>{chat.title}</span>
                       </button>
                       <button
                         className="chat-menu-trigger"
                         type="button"
                         aria-label={`Opcoes de ${chat.title}`}
                         aria-expanded={openChatMenuId === chat.id}
                         onClick={() => setOpenChatMenuId((current) => current === chat.id ? null : chat.id)}
                       >
                         <span aria-hidden="true">&#8943;</span>
                       </button>
                       {openChatMenuId === chat.id && (
                         <div className="chat-context-menu" role="menu">
                           <button type="button" role="menuitem" onClick={() => openRenameChat(chat.id)}>Renomear</button>
                           <button type="button" role="menuitem" onClick={() => toggleChatPinned(chat.id)}>{chat.pinned ? 'Desfixar' : 'Fixar'}</button>
                           <button className="danger" type="button" role="menuitem" onClick={() => deleteChat(chat.id)}>Excluir</button>
                         </div>
                       )}
                  </div>
                ))}
              </div>
            )}
          <button
            className={`nav-item ${view === 'memories' ? 'active' : ''}`}
            type="button"
            aria-current={view === 'memories' ? 'page' : undefined}
            onClick={() => navigate('memories')}
          >
            Memorias
          </button>
          <div className="sidebar-footer">
            <button
              className="sidebar-danger-button"
              type="button"
              onClick={() => setIsResetDialogOpen(true)}
              disabled={isResettingApp}
            >
              {isResettingApp ? 'Apagando save...' : 'Apagar save'}
            </button>
          </div>
        </nav>
        {/* <button className="new-chat" type="button" aria-label="Novo chat" onClick={startNewChat}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M8 9.00006H6.2C5.0799 9.00006 4.51984 9.00006 4.09202 9.21805C3.71569 9.40979 3.40973 9.71575 3.21799 10.0921C3 10.5199 3 11.08 3 12.2001V17.8001C3 18.9202 3 19.4802 3.21799 19.908C3.40973 20.2844 3.71569 20.5903 4.09202 20.7821C4.51984 21.0001 5.07989 21.0001 6.2 21.0001H17.787C18.9071 21.0001 19.4671 21.0001 19.895 20.7821C20.2713 20.5903 20.5772 20.2844 20.769 19.908C20.987 19.4802 20.987 18.9202 20.987 17.8001V12.0001M6 15.0001H6.01M10 15H10.01M11.5189 12.8946L12.8337 12.6347C13.5432 12.4945 13.8979 12.4244 14.2287 12.2953C14.5223 12.1807 14.8013 12.0318 15.06 11.8516C15.3514 11.6487 15.607 11.393 16.1184 10.8816L21.2668 5.73321C21.9541 5.04596 21.9541 3.9317 21.2668 3.24444C20.5796 2.55719 19.4653 2.55719 18.7781 3.24445L13.5416 8.48088C13.0625 8.96004 12.8229 9.19963 12.6294 9.47121C12.4576 9.71232 12.3131 9.97174 12.1986 10.2447C12.0696 10.5522 11.9921 10.8821 11.837 11.5417L11.5189 12.8946Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button> */}
      </aside>

      <section className="chat" aria-label="Conteudo principal">
        <nav className="mobile-nav" aria-label="Navegacao principal">
          <button
            className={`nav-item ${view === 'chat' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate('chat')}
          >
            Chat
          </button>
          <button
            className={`nav-item ${view === 'memories' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate('memories')}
          >
            Memorias
          </button>
        </nav>

        {view === 'chat' ? (
          <>
            <div className="messages">
              {isBootstrapping && orderedChats.length === 0 && (
                <p className="chat-status">Carregando conversas...</p>
              )}
              {!isBootstrapping && orderedChats.length === 0 && (
                <p className="chat-status">Nenhum chat disponivel.</p>
              )}
              {appError && (
                <p className="chat-status error" role="alert">{appError}</p>
              )}
              {visibleMessages.map((item) => {
                const relatedMemories = (item.memoryMatches?.length
                  ? item.memoryMatches.map((match) => {
                      const memoryItem = memoriesById.get(match.memoryId)
                      if (!memoryItem) return null
                      return {
                        ...memoryItem,
                        similarityPercent: match.similarityPercent,
                      }
                    })
                  : (item.memoryIds ?? []).map((memoryId) => {
                      const memoryItem = memoriesById.get(memoryId)
                      if (!memoryItem) return null
                      return {
                        ...memoryItem,
                        similarityPercent: null,
                      }
                    }))
                  .filter((memoryItem): memoryItem is Memory & { similarityPercent: number | null } => Boolean(memoryItem))

                return (
                  <article className={`message ${item.author}`} key={item.id}>
                    {item.author === 'user' && (
                      <MessageHoverActions>
                        <MessageHoverActions.Tools>
                          <MessageHoverActions.Action
                            aria-label="Depurar similaridade das memorias"
                            onClick={() => openMemorySimilarityDebug(item.text)}
                          >
                            Similaridade
                          </MessageHoverActions.Action>
                        </MessageHoverActions.Tools>
                        {renderMessageBody(item)}
                      </MessageHoverActions>
                    )}
                    {item.author === 'assistant' && (
                      <button
                        className="message-menu"
                        type="button"
                        aria-label="Mostrar memorias usadas"
                        aria-expanded={memoryMessageId === item.id}
                        onClick={() => setMemoryMessageId((current) => current === item.id ? null : item.id)}
                      >
                        ...
                      </button>
                    )}
                    {item.author === 'system' && item.memoryPrompt ? (
                      <MessageHoverActions>
                        <MessageHoverActions.Tools>
                          <MessageHoverActions.Action
                            aria-label={item.memoryFeedbacks?.length ? 'Mostrar prompt de feedback' : 'Mostrar prompt de criacao de memoria'}
                            onClick={() => setLlmPromptDialog({
                              title: item.memoryFeedbacks?.length ? 'Prompt de feedback' : 'Prompt de criacao de memoria',
                              text: item.memoryPrompt!,
                            })}
                          >
                            Show prompt
                          </MessageHoverActions.Action>
                        </MessageHoverActions.Tools>
                        {renderMessageBody(item)}
                      </MessageHoverActions>
                    ) : item.author !== 'user' && renderMessageBody(item)}
                    {item.author === 'assistant' && (
                      <>
                        <div className="rating" aria-label="Avalie esta resposta">
                          <button
                            className={item.rating === 1 ? 'active' : ''}
                            type="button"
                            aria-label="Resposta positiva"
                            aria-pressed={item.rating === 1}
                            onClick={() => rateAssistantMessage(item.id, 1)}
                          >
                            &#128077;
                          </button>
                          <button
                            className={item.rating === -1 ? 'active' : ''}
                            type="button"
                            aria-label="Resposta negativa"
                            aria-pressed={item.rating === -1}
                            onClick={() => rateAssistantMessage(item.id, -1)}
                          >
                            &#128078;
                          </button>
                        </div>
                        {memoryMessageId === item.id && (
                          <section className="message-memories" aria-label="Memorias usadas nesta resposta">
                            <strong>memorias usadas:</strong>
                            {relatedMemories.length > 0 ? (
                              <ul className="message-memory-list">
                                {relatedMemories.map((memoryItem) => (
                                 <li className="message-memory-item" key={memoryItem.id}>
                                    <span className="message-memory-content">
                                      <span className="message-memory-text">{memoryItem.text}</span>
                                       <span className="message-memory-similarity">
                                         {memoryItem.similarityPercent !== null && `${memoryItem.similarityPercent}% similar a query - `}
                                         {formatMemoryAge(memoryItem.created_at)}
                                       </span>
                                    </span>
                                    <span className="message-memory-actions">
                                      <button type="button" aria-label="Apagar memoria" onClick={() => deleteMemory(memoryItem.id)}>
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                          <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M19 6V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                      <button type="button" aria-label="Editar memoria" onClick={() => openMemoryEditor(memoryItem)}>
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                          <path d="M15.4998 5.50067L18.3282 8.3291M13 21H21M3 21.0004L3.04745 20.6683C3.21536 19.4929 3.29932 18.9052 3.49029 18.3565C3.65975 17.8697 3.89124 17.4067 4.17906 16.979C4.50341 16.497 4.92319 16.0772 5.76274 15.2377L17.4107 3.58969C18.1918 2.80865 19.4581 2.80864 20.2392 3.58969C21.0202 4.37074 21.0202 5.63707 20.2392 6.41812L8.37744 18.2798C7.61579 19.0415 7.23497 19.4223 6.8012 19.7252C6.41618 19.994 6.00093 20.2167 5.56398 20.3887C5.07171 20.5824 4.54375 20.6889 3.48793 20.902L3 21.0004Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <ul className="message-memory-list">
                                <li className="message-memory-item empty">Sem memorias relevantes.</li>
                              </ul>
                            )}
                          </section>
                        )}
                      </>
                    )}
                  </article>
                )
              })}
              {isSendingMessage && sendingChatId === currentActiveChatId && (
                <article className="message assistant typing" aria-label="Assistente digitando">
                  <div className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <button className="create-memory" type="button" onClick={() => { setEditingMemoryId(null); setMemory(''); setIsMemoryOpen(true) }}>
                Criar memoria
              </button>
              <input
                ref={messageInputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Escreva sua mensagem..."
                aria-label="Mensagem"
                maxLength={APP_CONFIG.maxCaracteresMemoryContext}
                disabled={!currentActiveChatId}
              />
              <button type="submit" disabled={!currentActiveChatId || !message.trim()}>{isSendingMessage ? 'Agendar' : 'Enviar'}</button>
            </form>
            {queuedMessagesForActiveChat.length > 0 && (
              <p className="composer-queue-status">
                {queuedMessagesForActiveChat.length} mensagem{queuedMessagesForActiveChat.length > 1 ? 'ens' : ''} aguardando envio.
              </p>
            )}

          </>
        ) : (
          <div className="memories-view">
            <header className="memories-header">
              <h1>Memorias</h1>
              <p>Conhecimentos explicitos salvos manualmente para uso do assistente.</p>
            </header>

            <div className="memories-toolbar" role="group" aria-label="Filtros e busca">
               <input
                 className="memories-search"
                 type="search"
                 value={memorySearch}
                 placeholder="Buscar memoria..."
                 aria-label="Buscar memoria"
                 onChange={(event) => {
                   setMemorySearch(event.target.value)
                   setTablePage(0)
                 }}
               />
               <select
                 className="memories-sort"
                 aria-label="Ordenar memorias"
                 value={memorySort}
                 onChange={(event) => {
                   setMemorySort(event.target.value as MemorySort)
                   setTablePage(0)
                 }}
               >
                 <option value="updated-desc">Atualizacao: mais recente</option>
                 <option value="updated-asc">Atualizacao: mais antiga</option>
                 <option value="created-desc">Criacao: mais recente</option>
                 <option value="created-asc">Criacao: mais antiga</option>
                 <option value="usage-desc">Uso: maior primeiro</option>
                 <option value="usage-asc">Uso: menor primeiro</option>
                 <option value="feedback-desc">Feedback: maior primeiro</option>
                 <option value="feedback-asc">Feedback: menor primeiro</option>
               </select>
              <select className="memories-filter" aria-label="Filtrar memorias" disabled defaultValue="all">
                <option value="all">Todas as memorias</option>
                <option value="positive">Com feedback positivo</option>
                <option value="negative">Com feedback negativo</option>
                <option value="unused">Sem uso recente</option>
              </select>
            </div>

            <div className="memories-table-wrap">
              <table className="memories-table" aria-label="Lista de memorias">
                <thead>
                  <tr>
                    <th>Texto</th>
                    <th>Status</th>
                    <th>Uso</th>
                    <th>Criado em</th>
                    <th>Atualizado em</th>
                    <th>Acoes</th>
                  </tr>
                 </thead>
                 <tbody>
                    {paginatedMemories.length > 0 ? paginatedMemories.map((m) => (
                        <tr key={m.id}>
                          <td>{m.text}</td>
                          <td>
                            {m.statusHistory.length > 0 ? sortMemoryStatusHistory(m.statusHistory).map((item, index) => (
                              <div key={`${item.status}-${item.at}-${index}`}>
                                {renderMemoryStatusLabel(item.status)} · {formatRelativeTime(item.at)}
                              </div>
                            )) : '-'}
                          </td>
                          <td className="num">{m.usage_count}</td>
                          <td>{m.created_at}</td>
                          <td>{m.updated_at}</td>
                         <td className="memory-actions">
                           <button type="button" onClick={() => openMemoryEditor(m)}>Editar</button>
                           <button type="button" onClick={() => deleteMemory(m.id)}>Apagar</button>
                         </td>
                       </tr>
                     )) : (
                       <tr>
                         <td className="empty-state" colSpan={6}>Nenhuma memoria encontrada.</td>
                       </tr>
                     )}
                 </tbody>
              </table>
              <div className="pagination" role="group" aria-label="Paginacao da tabela">
                 <button type="button" disabled={currentTablePage === 0} onClick={() => setTablePage((p) => Math.max(0, p - 1))}>Anterior</button>
                 <span className="page-info">{currentTablePage + 1} de {totalTablePages}</span>
                 <button type="button" disabled={currentTablePage >= totalTablePages - 1} onClick={() => setTablePage((p) => Math.min(totalTablePages - 1, p + 1))}>Seguinte</button>
              </div>
            </div>

            <section className="clusters" aria-label="Agrupamentos de memorias">
              <header className="clusters-header">
                <h2>Memorias relacionadas</h2>
                <p>Agrupamentos sugeridos a partir das memorias salvas no SQLite.</p>
              </header>
              <div className="cluster-grid">
                {paginatedClusters.length > 0 ? paginatedClusters.map((cluster) => (
                  <article className="cluster-card" key={cluster.id}>
                    <span className="cluster-count">{cluster.items.length} memorias · {cluster.similarityPercent}% de similaridade</span>
                    <div className="cluster-table" role="table" aria-label={`Memorias do agrupamento ${cluster.id}`}>
                      <div className="cluster-table-head" role="row">
                        <span role="columnheader">Memoria</span>
                        <span role="columnheader">Uso</span>
                        <span role="columnheader">Feedback</span>
                        <span role="columnheader" className="cluster-table-actions-label">Acoes</span>
                      </div>
                      <ul>
                        {cluster.items.map((item) => (
                          <li key={item.id} className="cluster-item" role="row">
                            <span className="cluster-item-text" role="cell" title={item.text}>{item.text}</span>
                            <span className="cluster-item-usage" role="cell">{item.usage_count}</span>
                            <span className="cluster-item-feedback" role="cell">{item.feedback_score}</span>
                            <span className="cluster-item-actions" role="cell">
                              <button type="button" aria-label="Editar memoria" onClick={() => openMemoryEditor(item)}>
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                  <path d="M15.4998 5.50067L18.3282 8.3291M13 21H21M3 21.0004L3.04745 20.6683C3.21536 19.4929 3.29932 18.9052 3.49029 18.3565C3.65975 17.8697 3.89124 17.4067 4.17906 16.979C4.50341 16.497 4.92319 16.0772 5.76274 15.2377L17.4107 3.58969C18.1918 2.80865 19.4581 2.80864 20.2392 3.58969C21.0202 4.37074 21.0202 5.63707 20.2392 6.41812L8.37744 18.2798C7.61579 19.0415 7.23497 19.4223 6.8012 19.7252C6.41618 19.994 6.00093 20.2167 5.56398 20.3887C5.07171 20.5824 4.54375 20.6889 3.48793 20.902L3 21.0004Z" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              <button type="button" aria-label="Apagar memoria" onClick={() => deleteMemory(item.id)}>✕</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                )) : (
                  <p className="chat-status">Nenhum agrupamento sugerido.</p>
                )}
               </div>
              <div className="pagination" role="group" aria-label="Paginacao dos agrupamentos">
                <button type="button" disabled={currentClusterPage === 0} onClick={() => setClusterPage((p) => p - 1)}>Anterior</button>
                <span className="page-info">{currentClusterPage + 1} de {totalClusterPages}</span>
                <button type="button" disabled={currentClusterPage >= totalClusterPages - 1} onClick={() => setClusterPage((p) => p + 1)}>Seguinte</button>
              </div>
            </section>
          </div>
        )}
        {isMemoryOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsMemoryOpen(false)}>
            <form className="memory-modal" onSubmit={editingMemoryId === null ? createMemory : editMemory} onMouseDown={(event) => event.stopPropagation()}>
              <h1>{editingMemoryId === null ? 'Criar memoria' : 'Editar memoria'}</h1>
              <input
                autoFocus
                value={memory}
                onChange={(event) => setMemory(event.target.value)}
                placeholder="Ex.: Prefere respostas curtas"
                aria-label="Nova memoria"
                maxLength={APP_CONFIG.maxCaracteresMemory}
              />
              <p>{memory.length}/{APP_CONFIG.maxCaracteresMemory}</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setIsMemoryOpen(false)}>Cancelar</button>
                <button type="submit">{editingMemoryId === null ? 'Adicionar' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        )}

        {memorySimilarityDebug && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setMemorySimilarityDebug(null)}>
            <section
              className="memory-similarity-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="memory-similarity-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="memory-similarity-header">
                <div>
                  <h1 id="memory-similarity-title">Similaridade das memorias</h1>
                  <p title={memorySimilarityDebug.text}>Mensagem: {memorySimilarityDebug.text}</p>
                </div>
                <button type="button" aria-label="Fechar diagnostico de similaridade" onClick={() => setMemorySimilarityDebug(null)}>Fechar</button>
              </header>

              {memorySimilarityDebug.error ? (
                <p className="memory-similarity-error" role="alert">{memorySimilarityDebug.error}</p>
              ) : isLoadingMemorySimilarityDebug && !memorySimilarityDebug.result ? (
                <p className="memory-similarity-status">Calculando similaridades...</p>
              ) : (
                <>
                  <div className="memory-similarity-table-wrap">
                    <table className="memories-table" aria-label="Similaridade de embedding das memorias">
                      <thead>
                        <tr>
                          <th>Memoria</th>
                          <th className="num">Embedding</th>
                          <th className="num">Feedback</th>
                          <th className="num">Uso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memorySimilarityDebug.result?.items.length ? memorySimilarityDebug.result.items.map((memoryItem) => (
                          <tr key={memoryItem.id}>
                            <td>{memoryItem.text}</td>
                            <td className="num">{memoryItem.embeddingSimilarityPercent}%</td>
                            <td className="num">{memoryItem.feedback_score}</td>
                            <td className="num">{memoryItem.usage_count}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td className="empty-state" colSpan={4}>Nenhuma memoria salva.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {memorySimilarityDebug.result && (
                    <div className="pagination" role="group" aria-label="Paginacao da similaridade de embedding">
                      <button
                        type="button"
                        disabled={isLoadingMemorySimilarityDebug || memorySimilarityDebug.result.page === 0}
                        onClick={() => loadMemorySimilarityDebug(memorySimilarityDebug.text, memorySimilarityDebug.result!.page - 1)}
                      >
                        Anterior
                      </button>
                      <span className="page-info">{memorySimilarityDebug.result.page + 1} de {memorySimilarityDebug.result.totalPages}</span>
                      <button
                        type="button"
                        disabled={isLoadingMemorySimilarityDebug || memorySimilarityDebug.result.page >= memorySimilarityDebug.result.totalPages - 1}
                        onClick={() => loadMemorySimilarityDebug(memorySimilarityDebug.text, memorySimilarityDebug.result!.page + 1)}
                      >
                        Seguinte
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {llmPromptDialog && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setLlmPromptDialog(null)}>
            <section
              className="memory-prompt-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="memory-prompt-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="memory-prompt-header">
                <h1 id="memory-prompt-title">{llmPromptDialog.title}</h1>
                <button type="button" aria-label="Fechar prompt" onClick={() => setLlmPromptDialog(null)}>Fechar</button>
              </header>
              <pre>{llmPromptDialog.text}</pre>
            </section>
          </div>
        )}

        {editingChatId !== null && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => { setEditingChatId(null); setChatTitle('') }}>
            <form className="memory-modal rename-modal" onSubmit={(e) => { e.preventDefault(); saveChatRename() }} onMouseDown={(event) => event.stopPropagation()}>
              <h1>Renomear esta conversa</h1>
              <input
                ref={chatTitleInputRef}
                autoFocus
                value={chatTitle}
                onChange={(event) => setChatTitle(event.target.value)}
                onKeyDown={handleChatRenameKeyDown}
                placeholder="Titulo da conversa"
                aria-label="Renomear conversa"
              />
              <div className="modal-actions">
                <button type="button" onClick={() => { setEditingChatId(null); setChatTitle('') }}>Cancelar</button>
                <button type="submit" disabled={!chatTitle.trim()}>Renomear</button>
              </div>
            </form>
          </div>
        )}

        {isResetDialogOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!isResettingApp) setIsResetDialogOpen(false) }}>
            <form className="memory-modal confirm-reset-modal" onSubmit={(event) => { event.preventDefault(); resetAppData() }} onMouseDown={(event) => event.stopPropagation()}>
              <h1>Apagar todo o save?</h1>
              <p className="confirm-reset-copy">Isso vai limpar conversas, memorias e feedbacks do SQLite e recriar um chat vazio.</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setIsResetDialogOpen(false)} disabled={isResettingApp}>Cancelar</button>
                <button className="danger-action" type="submit" disabled={isResettingApp}>{isResettingApp ? 'Apagando...' : 'Apagar tudo'}</button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
