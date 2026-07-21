import type { Chat, Memory, MemoryEvent, Message } from './appTypes'

export type AppSnapshot = {
  chats: Chat[]
  memories: Memory[]
}

export type StateResult = { state: AppSnapshot }
export type SendMessageResult = StateResult & { userMessage: Message | null; assistantMessage: Message | null }
export type CreateChatResult = StateResult & { chat: Chat | null }
export type CreateMemoryResult = StateResult & { memoryEvent: MemoryEvent; eventMessage: Message | null }
export type SendMessageStreamEvent = SendMessageResult & { done: boolean }

export type AppDataSource = {
  loadState: () => Promise<AppSnapshot>
  sendUserMessage: (chatId: number, text: string) => Promise<SendMessageResult>
  sendUserMessageStream: (chatId: number, text: string, onEvent: (event: SendMessageStreamEvent) => void) => Promise<SendMessageResult>
  createMemory: (text: string, chatId?: number | null) => Promise<CreateMemoryResult>
  updateMemory: (memoryId: number, text: string) => Promise<StateResult>
  deleteMemory: (memoryId: number) => Promise<StateResult>
  rateAssistantMessage: (chatId: number, messageId: string, rating: -1 | 1) => Promise<StateResult>
  createChat: (title?: string) => Promise<CreateChatResult>
  renameChat: (chatId: number, title: string) => Promise<StateResult>
  toggleChatPinned: (chatId: number) => Promise<StateResult>
  deleteChat: (chatId: number) => Promise<StateResult>
  resetApp: () => Promise<CreateChatResult>
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '')

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Falha ao chamar ${url}`
    throw new Error(message)
  }

  return payload as T
}

async function requestStream<T>(url: string, init: RequestInit, onEvent: (event: T) => void): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload?.error === 'string' ? payload.error : `Falha ao chamar ${url}`
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Streaming indisponivel nesta resposta.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEvent: T | null = null

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const event = JSON.parse(trimmed) as T
      lastEvent = event
      onEvent(event)
    }

    if (done) break
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer.trim()) as T
    lastEvent = event
    onEvent(event)
  }

  if (!lastEvent) {
    throw new Error('Nenhum evento foi recebido do servidor.')
  }

  return lastEvent
}

export function createApiDataSource(apiBaseUrl = API_BASE_URL): AppDataSource {
  const requestFromApi = <T>(pathname: string, init?: RequestInit) => request<T>(`${apiBaseUrl}${pathname}`, init)

  return {
    loadState: () => requestFromApi<AppSnapshot>('/api/state'),
    sendUserMessage: (chatId, text) => requestFromApi<SendMessageResult>(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
    sendUserMessageStream: (chatId, text, onEvent) => requestStream<SendMessageStreamEvent>(`${apiBaseUrl}/api/chats/${chatId}/messages/stream`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }, onEvent).then(({ done: _done, ...result }) => result),
    createMemory: (text, chatId) => requestFromApi<CreateMemoryResult>('/api/memories', {
      method: 'POST',
      body: JSON.stringify({ text, chatId }),
    }),
    updateMemory: (memoryId, text) => requestFromApi<StateResult>(`/api/memories/${memoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
    deleteMemory: (memoryId) => requestFromApi<StateResult>(`/api/memories/${memoryId}`, {
      method: 'DELETE',
    }),
    rateAssistantMessage: (chatId, messageId, rating) => requestFromApi<StateResult>(`/api/chats/${chatId}/messages/${messageId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
    createChat: (title) => requestFromApi<CreateChatResult>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
    renameChat: (chatId, title) => requestFromApi<StateResult>(`/api/chats/${chatId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
    toggleChatPinned: (chatId) => requestFromApi<StateResult>(`/api/chats/${chatId}/toggle-pin`, {
      method: 'POST',
    }),
    deleteChat: (chatId) => requestFromApi<StateResult>(`/api/chats/${chatId}`, {
      method: 'DELETE',
    }),
    resetApp: () => requestFromApi<CreateChatResult>('/api/reset', {
      method: 'POST',
    }),
  }
}

export const appDataSource = createApiDataSource()
