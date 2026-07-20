import { beforeEach, describe, expect, it } from 'vitest'
import { APP_CONFIG } from '../src/config'
import { db } from '../src/mockDatabase'

function cloneState() {
  return JSON.parse(JSON.stringify({ chats: db.chats(), memories: db.memories() }))
}

beforeEach(() => {
  db.reset()
})

describe('mock database schema', () => {
  it('hydrates memories with the expected table fields', () => {
    const memory = db.memories()[0]

    expect(memory).toEqual(expect.objectContaining({
      id: expect.any(Number),
      text: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      feedback_score: expect.any(Number),
      usage_count: expect.any(Number),
      embedding: expect.any(Array),
    }))
    expect(memory.embedding.length).toBeGreaterThan(0)
  })

  it('hydrates chats with timestamps and serializable history', () => {
    const chat = db.chats()[0]

    expect(chat).toEqual(expect.objectContaining({
      id: expect.any(Number),
      title: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      history_chat_json: expect.any(String),
    }))
    expect(JSON.parse(chat.history_chat_json)).toEqual(chat.messages)
  })
})

describe('mock database behavior', () => {
  it('returns ranked memories for relevant context', () => {
    const results = db.embeddingsSearch({ chat_text: 'Quero comparar cenarios antes de decidir', max_memories: 2 })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.text).toBe('Prefere comparar cenarios antes de decidir')
  })

  it('supports camelCase search input and returns no matches for empty search text', () => {
    const results = db.embeddingsSearch({ chatText: 'Quero comparar cenarios antes de decidir', maxMemories: 1 })

    expect(results).toHaveLength(1)
    expect(results[0]?.text).toBe('Prefere comparar cenarios antes de decidir')
    expect(db.embeddingsSearch({ chatText: '', maxMemories: 3 })).toEqual([])
  })

  it('creates assistant replies, links memories, updates usage, and syncs chat history', () => {
    const chatId = APP_CONFIG.seedChats[0].id
    const usageBefore = new Map(db.memories().map((memory) => [memory.id, memory.usage_count]))

    const result = db.sendUserMessage(chatId, 'Explique RAG e quero comparar cenarios com exemplos')
    const assistantMessage = result.assistantMessage

    expect(result.userMessage).not.toBeNull()
    expect(assistantMessage).not.toBeNull()
    expect(assistantMessage?.author).toBe('assistant')
    expect(assistantMessage?.text).toContain('RAG mistura busca com geracao.')
    expect((assistantMessage?.memoryIds ?? []).length).toBeGreaterThan(0)

    const linkedIds = assistantMessage?.memoryIds ?? []
    for (const memoryId of linkedIds) {
      const memory = db.memories().find((entry) => entry.id === memoryId)
      expect(memory?.usage_count).toBe((usageBefore.get(memoryId) ?? 0) + 1)
    }

    const chat = db.chats().find((entry) => entry.id === chatId)
    expect(chat?.messages.at(-1)?.id).toBe(assistantMessage?.id)
    expect(JSON.parse(chat?.history_chat_json ?? '[]')).toEqual(chat?.messages)
  })

  it('auto-creates new memories from user preferences with the configured max length', () => {
    const beforeCount = db.memories().length

    db.sendUserMessage(APP_CONFIG.seedChats[0].id, 'Prefiro mapas')

    const afterMemories = db.memories()
    const created = afterMemories.find((memory) => memory.text === 'Prefere mapas')

    expect(afterMemories).toHaveLength(beforeCount + 1)
    expect(created).toBeDefined()
    expect(created?.text.length).toBeLessThanOrEqual(APP_CONFIG.maxCaracteresMemory)
    expect(created?.embedding.length).toBeGreaterThan(0)
  })

  it('does not create duplicate memories for preferences that already exist', () => {
    const beforeCount = db.memories().length

    db.sendUserMessage(APP_CONFIG.seedChats[0].id, 'Prefiro listas objetivas')

    const repeatedMemories = db.memories().filter((memory) => memory.text === 'Prefere listas objetivas')
    expect(db.memories()).toHaveLength(beforeCount)
    expect(repeatedMemories).toHaveLength(1)
  })

  it('updates memory feedback when assistant rating changes', () => {
    const chatId = APP_CONFIG.seedChats[0].id
    const { assistantMessage } = db.sendUserMessage(chatId, 'Quero comparar cenarios de RAG')
    const linkedIds = assistantMessage?.memoryIds ?? []
    const feedbackBefore = new Map(db.memories().map((memory) => [memory.id, memory.feedback_score]))

    expect(linkedIds.length).toBeGreaterThan(0)

    db.rateAssistantMessage(chatId, assistantMessage!.id, 1)
    for (const memoryId of linkedIds) {
      const memory = db.memories().find((entry) => entry.id === memoryId)
      expect(memory?.feedback_score).toBe((feedbackBefore.get(memoryId) ?? 0) + 1)
    }

    db.rateAssistantMessage(chatId, assistantMessage!.id, -1)
    for (const memoryId of linkedIds) {
      const memory = db.memories().find((entry) => entry.id === memoryId)
      expect(memory?.feedback_score).toBe((feedbackBefore.get(memoryId) ?? 0) - 1)
    }

    const updatedChat = db.chats().find((entry) => entry.id === chatId)
    const updatedMessage = updatedChat?.messages.find((entry) => entry.id === assistantMessage!.id)
    expect(updatedMessage?.rating).toBe(-1)
    expect(JSON.parse(updatedChat?.history_chat_json ?? '[]')).toEqual(updatedChat?.messages)
  })

  it('does not change feedback when the same assistant rating is applied twice', () => {
    const chatId = APP_CONFIG.seedChats[0].id
    const { assistantMessage } = db.sendUserMessage(chatId, 'Quero comparar cenarios de RAG')
    const linkedIds = assistantMessage?.memoryIds ?? []

    expect(linkedIds.length).toBeGreaterThan(0)

    db.rateAssistantMessage(chatId, assistantMessage!.id, 1)
    const feedbackAfterFirstRating = new Map(db.memories().map((memory) => [memory.id, memory.feedback_score]))

    db.rateAssistantMessage(chatId, assistantMessage!.id, 1)

    for (const memoryId of linkedIds) {
      const memory = db.memories().find((entry) => entry.id === memoryId)
      expect(memory?.feedback_score).toBe(feedbackAfterFirstRating.get(memoryId))
    }
  })

  it('removes deleted memories from assistant links', () => {
    const chatId = APP_CONFIG.seedChats[0].id
    const { assistantMessage } = db.sendUserMessage(chatId, 'Quero comparar cenarios de RAG')
    const memoryIdToDelete = assistantMessage?.memoryIds?.[0]

    expect(memoryIdToDelete).toBeDefined()

    db.deleteMemory(memoryIdToDelete!)

    const updatedChat = db.chats().find((entry) => entry.id === chatId)
    const updatedMessage = updatedChat?.messages.find((entry) => entry.id === assistantMessage!.id)
    expect(updatedMessage?.memoryIds).not.toContain(memoryIdToDelete)
    expect(JSON.parse(updatedChat?.history_chat_json ?? '[]')).toEqual(updatedChat?.messages)
  })

  it('removes deleted memory links from every chat that referenced them', () => {
    const firstChatId = APP_CONFIG.seedChats[0].id
    const secondChatId = APP_CONFIG.seedChats[1].id
    const memoryIdToDelete = 1

    db.addMessage(firstChatId, {
      id: 'message-chat-1',
      author: 'assistant',
      text: 'Resposta com memoria compartilhada',
      memoryIds: [memoryIdToDelete],
      rating: 0,
    })
    db.addMessage(secondChatId, {
      id: 'message-chat-2',
      author: 'assistant',
      text: 'Outra resposta com a mesma memoria',
      memoryIds: [memoryIdToDelete],
      rating: 0,
    })

    expect(memoryIdToDelete).toBeDefined()

    db.deleteMemory(memoryIdToDelete)

    const firstUpdatedChat = db.chats().find((entry) => entry.id === firstChatId)
    const secondUpdatedChat = db.chats().find((entry) => entry.id === secondChatId)
    const firstUpdatedMessage = firstUpdatedChat?.messages.find((entry) => entry.id === 'message-chat-1')
    const secondUpdatedMessage = secondUpdatedChat?.messages.find((entry) => entry.id === 'message-chat-2')

    expect(firstUpdatedMessage?.memoryIds).not.toContain(memoryIdToDelete)
    expect(secondUpdatedMessage?.memoryIds).not.toContain(memoryIdToDelete)
  })

  it('keeps chat metadata in sync when creating, renaming, pinning, and appending messages', () => {
    const created = db.createChat('Planejamento')

    expect(created.id).toBeGreaterThan(APP_CONFIG.seedChats.length)
    expect(created.history_chat_json).toBe('[]')
    expect(created.created_at).toBe(created.updated_at)

    db.renameChat(created.id, 'Planejamento semanal')
    db.toggleChatPinned(created.id)
    db.addMessage(created.id, { id: 'message-999', author: 'user', text: 'Primeira nota' })

    const updated = db.chats().find((chat) => chat.id === created.id)
    expect(updated?.title).toBe('Planejamento semanal')
    expect(updated?.pinned).toBe(true)
    expect(updated?.messages).toHaveLength(1)
    expect(JSON.parse(updated?.history_chat_json ?? '[]')).toEqual(updated?.messages)
  })

  it('truncates and re-embeds manual memory updates', () => {
    const created = db.createMemory('Prefere respostas muito muito longas com contexto detalhado')

    expect(created.text.length).toBeLessThanOrEqual(APP_CONFIG.maxCaracteresMemory)

    db.updateMemory(created.id, 'Prefere esquemas visuais e resumos curtos')
    const updated = db.memories().find((memory) => memory.id === created.id)

    expect(updated?.text.length).toBeLessThanOrEqual(APP_CONFIG.maxCaracteresMemory)
    expect(updated?.updated_at).toBeDefined()
    expect(updated?.embedding.length).toBeGreaterThan(0)
  })

  it('preserves a memory when an empty update is requested', () => {
    const memory = db.memories()[0]

    db.updateMemory(memory.id, '   ')

    expect(db.memories().find((item) => item.id === memory.id)?.text).toBe(memory.text)
  })

  it('truncates oversized single-word memories with the character fallback path', () => {
    const created = db.createMemory('supercalifragilisticoespialidoso')

    expect(created.text).toHaveLength(APP_CONFIG.maxCaracteresMemory)
    expect(created.text).toBe('supercalifragilistic')
  })

  it('ignores unknown chat, message, and memory ids without mutating state', () => {
    const before = cloneState()

    expect(db.sendUserMessage(999, 'Mensagem perdida')).toEqual({ userMessage: null, assistantMessage: null })
    db.addMessage(999, { id: 'message-999', author: 'user', text: 'fora do chat' })
    db.rateAssistantMessage(999, 'message-999', 1)
    db.rateAssistantMessage(APP_CONFIG.seedChats[0].id, 'message-999', 1)
    db.updateMemory(999, 'Nao existe')

    expect(cloneState()).toEqual(before)
  })
})
