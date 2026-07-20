import { APP_CONFIG } from './config'

export type Message = { id: string; author: 'assistant' | 'user'; text: string }
export type Memory = { id: number; text: string; feedback_score: number; usage_count: number; created_at: string; updated_at: string }
export type Chat = { id: string; title: string; messages: Message[]; pinned: boolean }

let chats: Chat[] = APP_CONFIG.seedChats.map((chat) => ({ ...chat, messages: [...chat.messages], pinned: false }))
let memories: Memory[] = APP_CONFIG.seedMemories.map((memory) => ({ ...memory }))

export const db = {
  chats: () => chats,
  messages: (chatId: string) => chats.find((chat) => chat.id === chatId)?.messages ?? [],
  memories: () => memories,
  addMessage: (chatId: string, message: Message) => {
    chats = chats.map((chat) => chat.id === chatId ? { ...chat, messages: [...chat.messages, message] } : chat)
  },
  createChat: (title = 'Novo chat') => {
    const chat = { id: `chat-${Date.now()}`, title, messages: [], pinned: false }
    chats = [...chats, chat]
    return chat
  },
  renameChat: (id: string, title: string) => {
    chats = chats.map((chat) => chat.id === id ? { ...chat, title } : chat)
  },
  toggleChatPinned: (id: string) => {
    chats = chats.map((chat) => chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)
  },
  deleteChat: (id: string) => {
    chats = chats.filter((chat) => chat.id !== id)
  },
  createMemory: (text: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const memory = { id: Date.now(), text, feedback_score: 0, usage_count: 0, created_at: today, updated_at: today }
    memories = [...memories, memory]
    return memory
  },
  updateMemory: (id: number, text: string) => {
    const today = new Date().toISOString().slice(0, 10)
    memories = memories.map((memory) => memory.id === id ? {
      ...memory,
      text,
      feedback_score: 0,
      usage_count: 0,
      created_at: today,
      updated_at: today,
    } : memory)
  },
  deleteMemory: (id: number) => { memories = memories.filter((memory) => memory.id !== id) },
}
