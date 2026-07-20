import { db } from './mockDatabase'
import type { Chat, Memory, Message } from './mockDatabase'

export type AppSnapshot = {
  chats: Chat[]
  memories: Memory[]
}

type StateResult = { state: AppSnapshot }
type SendMessageResult = StateResult & { userMessage: Message | null; assistantMessage: Message | null }
type CreateChatResult = StateResult & { chat: Chat | null }

type MaybePromise<T> = T | Promise<T>

export type AppDataSource = {
  supportsSyncSnapshot: boolean
  getInitialSnapshot: () => AppSnapshot
  loadState: () => MaybePromise<AppSnapshot>
  sendUserMessage: (chatId: number, text: string) => MaybePromise<SendMessageResult>
  createMemory: (text: string) => MaybePromise<StateResult>
  updateMemory: (memoryId: number, text: string) => MaybePromise<StateResult>
  deleteMemory: (memoryId: number) => MaybePromise<StateResult>
  rateAssistantMessage: (chatId: number, messageId: string, rating: -1 | 1) => MaybePromise<StateResult>
  createChat: (title?: string) => MaybePromise<CreateChatResult>
  renameChat: (chatId: number, title: string) => MaybePromise<StateResult>
  toggleChatPinned: (chatId: number) => MaybePromise<StateResult>
  deleteChat: (chatId: number) => MaybePromise<StateResult>
}

const EMPTY_SNAPSHOT: AppSnapshot = { chats: [], memories: [] }
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const SHOULD_USE_MOCK = import.meta.env.MODE === 'test' || import.meta.env.VITE_DATA_SOURCE === 'mock'

function cloneSnapshot(snapshot: AppSnapshot) {
  return structuredClone(snapshot)
}

function readMockSnapshot() {
  return cloneSnapshot({ chats: db.chats(), memories: db.memories() })
}

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Falha ao chamar ${pathname}`
    throw new Error(message)
  }

  return payload as T
}

const mockDataSource: AppDataSource = {
  supportsSyncSnapshot: true,
  getInitialSnapshot: () => readMockSnapshot(),
  loadState: () => readMockSnapshot(),
  sendUserMessage: (chatId, text) => {
    const result = db.sendUserMessage(chatId, text)
    return {
      ...result,
      state: readMockSnapshot(),
    }
  },
  createMemory: (text) => {
    db.createMemory(text)
    return { state: readMockSnapshot() }
  },
  updateMemory: (memoryId, text) => {
    db.updateMemory(memoryId, text)
    return { state: readMockSnapshot() }
  },
  deleteMemory: (memoryId) => {
    db.deleteMemory(memoryId)
    return { state: readMockSnapshot() }
  },
  rateAssistantMessage: (chatId, messageId, rating) => {
    db.rateAssistantMessage(chatId, messageId, rating)
    return { state: readMockSnapshot() }
  },
  createChat: (title) => {
    const chat = db.createChat(title)
    return { chat: structuredClone(chat), state: readMockSnapshot() }
  },
  renameChat: (chatId, title) => {
    db.renameChat(chatId, title)
    return { state: readMockSnapshot() }
  },
  toggleChatPinned: (chatId) => {
    db.toggleChatPinned(chatId)
    return { state: readMockSnapshot() }
  },
  deleteChat: (chatId) => {
    db.deleteChat(chatId)
    return { state: readMockSnapshot() }
  },
}

export const apiDataSource: AppDataSource = {
  supportsSyncSnapshot: false,
  getInitialSnapshot: () => EMPTY_SNAPSHOT,
  loadState: () => request<AppSnapshot>('/api/state'),
  sendUserMessage: (chatId, text) => request<SendMessageResult>(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  createMemory: (text) => request<StateResult>('/api/memories', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  updateMemory: (memoryId, text) => request<StateResult>(`/api/memories/${memoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  }),
  deleteMemory: (memoryId) => request<StateResult>(`/api/memories/${memoryId}`, {
    method: 'DELETE',
  }),
  rateAssistantMessage: (chatId, messageId, rating) => request<StateResult>(`/api/chats/${chatId}/messages/${messageId}/rating`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  }),
  createChat: (title) => request<CreateChatResult>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ title }),
  }),
  renameChat: (chatId, title) => request<StateResult>(`/api/chats/${chatId}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  }),
  toggleChatPinned: (chatId) => request<StateResult>(`/api/chats/${chatId}/toggle-pin`, {
    method: 'POST',
  }),
  deleteChat: (chatId) => request<StateResult>(`/api/chats/${chatId}`, {
    method: 'DELETE',
  }),
}

function isConnectionError(error: unknown) {
  return error instanceof TypeError
}

export function createResilientApiDataSource(
  remoteSource: AppDataSource = apiDataSource,
  localSource: AppDataSource = mockDataSource,
): AppDataSource {
  let useLocalSource = false

  async function runRemoteOrLocal<T>(remoteOperation: () => MaybePromise<T>, localOperation: () => MaybePromise<T>) {
    if (useLocalSource) return localOperation()

    try {
      return await remoteOperation()
    } catch (error) {
      if (!isConnectionError(error)) throw error

      useLocalSource = true
      return localOperation()
    }
  }

  return {
    supportsSyncSnapshot: false,
    // Render useful local data while the optional local API is being contacted.
    getInitialSnapshot: () => localSource.getInitialSnapshot(),
    loadState: () => runRemoteOrLocal(remoteSource.loadState, localSource.loadState),
    sendUserMessage: (chatId, text) => runRemoteOrLocal(
      () => remoteSource.sendUserMessage(chatId, text),
      () => localSource.sendUserMessage(chatId, text),
    ),
    createMemory: (text) => runRemoteOrLocal(
      () => remoteSource.createMemory(text),
      () => localSource.createMemory(text),
    ),
    updateMemory: (memoryId, text) => runRemoteOrLocal(
      () => remoteSource.updateMemory(memoryId, text),
      () => localSource.updateMemory(memoryId, text),
    ),
    deleteMemory: (memoryId) => runRemoteOrLocal(
      () => remoteSource.deleteMemory(memoryId),
      () => localSource.deleteMemory(memoryId),
    ),
    rateAssistantMessage: (chatId, messageId, rating) => runRemoteOrLocal(
      () => remoteSource.rateAssistantMessage(chatId, messageId, rating),
      () => localSource.rateAssistantMessage(chatId, messageId, rating),
    ),
    createChat: (title) => runRemoteOrLocal(
      () => remoteSource.createChat(title),
      () => localSource.createChat(title),
    ),
    renameChat: (chatId, title) => runRemoteOrLocal(
      () => remoteSource.renameChat(chatId, title),
      () => localSource.renameChat(chatId, title),
    ),
    toggleChatPinned: (chatId) => runRemoteOrLocal(
      () => remoteSource.toggleChatPinned(chatId),
      () => localSource.toggleChatPinned(chatId),
    ),
    deleteChat: (chatId) => runRemoteOrLocal(
      () => remoteSource.deleteChat(chatId),
      () => localSource.deleteChat(chatId),
    ),
  }
}

export const appDataSource = SHOULD_USE_MOCK ? mockDataSource : createResilientApiDataSource()

export function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value
}
