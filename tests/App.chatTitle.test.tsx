import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import type { AppDataSource, AppSnapshot, CreateChatResult, SendMessageResult, SendMessageStreamEvent, StateResult } from '../src/dataSource'
import type { Chat, Message } from '../src/appTypes'

function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return {
    chats: snapshot.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => ({ ...message })),
    })),
    memories: snapshot.memories.map((memory) => ({
      ...memory,
      embedding: [...memory.embedding],
      statusHistory: [...memory.statusHistory],
    })),
  }
}

function createAppDataSourceDouble(): AppDataSource {
  let nextChatId = 2
  let nextMessageId = 2
  let state: AppSnapshot = {
    chats: [
      {
        id: 1,
        title: 'Chat inicial',
        created_at: '2026-07-21',
        updated_at: '2026-07-21',
        history_chat_json: '[]',
        pinned: false,
        messages: [
          { id: 'message-1', author: 'assistant', text: 'Como posso ajudar voce hoje?' },
        ],
      },
    ],
    memories: [],
  }

  const getState = () => cloneSnapshot(state)

  const updateChat = (chatId: number, updater: (chat: Chat) => Chat) => {
    state = {
      ...state,
      chats: state.chats.map((chat) => chat.id === chatId ? updater(chat) : chat),
    }
  }

  const emptyStateResult = (): StateResult => ({ state: getState() })

  const sendUserMessageStream: AppDataSource['sendUserMessageStream'] = async (chatId, text, onEvent) => {
    const chat = state.chats.find((item) => item.id === chatId)
    if (!chat) throw new Error('Chat nao encontrado')

    const trimmedText = text.trim().replace(/\s+/g, ' ')
    const userMessage: Message = {
      id: `message-${nextMessageId++}`,
      author: 'user',
      text,
      memoryIds: [],
      rating: 0,
    }

    updateChat(chatId, (current) => ({
      ...current,
      title: current.messages.some((message) => message.author === 'user') ? current.title : trimmedText,
      updated_at: '2026-07-21',
      messages: [...current.messages, userMessage],
    }))

    onEvent({
      done: false,
      state: getState(),
      userMessage,
      assistantMessage: null,
    } satisfies SendMessageStreamEvent)

    const assistantMessage: Message = {
      id: `message-${nextMessageId++}`,
      author: 'assistant',
      text: 'Resposta de teste.',
      memoryIds: [],
      rating: 0,
    }

    updateChat(chatId, (current) => ({
      ...current,
      updated_at: '2026-07-21',
      messages: [...current.messages, assistantMessage],
    }))

    return {
      state: getState(),
      userMessage,
      assistantMessage,
    } satisfies SendMessageResult
  }

  return {
    loadState: async () => getState(),
    sendUserMessage: async (chatId, text) => sendUserMessageStream(chatId, text, () => {}),
    sendUserMessageStream,
    createMemory: async () => {
      throw new Error('Nao usado neste teste')
    },
    inspectMemoryEmbeddingSimilarity: async () => ({ items: [], page: 0, pageSize: 10, total: 0, totalPages: 1 }),
    updateMemory: async () => emptyStateResult(),
    deleteMemory: async () => emptyStateResult(),
    rateAssistantMessage: async () => emptyStateResult(),
    async createChat() {
      const chat: Chat = {
        id: nextChatId++,
        title: 'Novo chat',
        created_at: '2026-07-21',
        updated_at: '2026-07-21',
        history_chat_json: '[]',
        pinned: false,
        messages: [],
      }

      state = {
        ...state,
        chats: [chat, ...state.chats],
      }

      return {
        chat,
        state: getState(),
      } satisfies CreateChatResult
    },
    renameChat: async () => emptyStateResult(),
    toggleChatPinned: async () => emptyStateResult(),
    deleteChat: async () => emptyStateResult(),
    resetApp: async () => ({ chat: state.chats[0] ?? null, state: getState() }),
  }
}

describe('App chat title', () => {
  it('uses the first sent message as the new chat title', async () => {
    const user = userEvent.setup()
    render(<App dataSource={createAppDataSourceDouble()} />)

    await screen.findByText('Como posso ajudar voce hoje?')

    await user.click(screen.getAllByRole('button', { name: 'Novo chat' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Mensagem' }), 'Titulo vindo da primeira mensagem')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Titulo vindo da primeira mensagem' })).toBeInTheDocument())
  })
})
