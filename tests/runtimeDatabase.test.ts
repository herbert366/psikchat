/* @vitest-environment node */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeDatabase } from '../server/runtimeDatabase.mjs'
import { buildEmbedding, createTestLlmClient } from './testLlmClient'

type RuntimeDatabase = ReturnType<typeof createRuntimeDatabase>
type TestLlmClient = ReturnType<typeof createTestLlmClient>

let runtimeDb: RuntimeDatabase | null = null
let dbPath: string | null = null

function removeIfExists(filePath: string | null) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function createEmptyRuntimeDatabase(options: { llmClient?: TestLlmClient } = {}) {
  dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
  runtimeDb = createRuntimeDatabase({
    dbPath,
    llmClient: options.llmClient ?? createTestLlmClient(),
    seedData: { chats: [], memories: [] },
  })

  return runtimeDb
}

function createMemoryCandidateLlmClient(candidate: string): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return JSON.stringify([candidate])
      }

      return 'Resposta generica.'
    },
  }
}

function createOwnershipAwareLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'

      if (
        prompt.includes('qual o nome do cachorro da minha namorada?')
        && prompt.includes("user dog's name: Billy")
      ) {
        return prompt.includes('Nao ofereca ajuda adicional')
          ? 'Nao sei o nome do cachorro da sua namorada. Sei que o seu cachorro se chama Billy.'
          : 'O nome do cachorro da sua namorada nao foi mencionado nas memorias.'
      }

      return 'Resposta generica.'
    },
  }
}

afterEach(() => {
  runtimeDb?.close()
  runtimeDb = null

  removeIfExists(dbPath)
  removeIfExists(dbPath ? `${dbPath}-shm` : null)
  removeIfExists(dbPath ? `${dbPath}-wal` : null)
  dbPath = null
})

describe('runtimeDatabase', () => {
  it('cria memorias a partir da conversa e as reutiliza numa resposta posterior', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de memoria')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Meu cachorro se chama Bob')

    const createdMemory = runtimeDb.memories().find((memory) => memory.text === "user dog's name: Bob")
    expect(createdMemory).toBeDefined()

    const secondTurn = await runtimeDb.sendUserMessage(chat!.id, 'Qual o nome do meu cachorro?')
    expect(secondTurn.assistantMessage?.text).toContain('Bob')
    expect((secondTurn.assistantMessage?.memoryIds ?? []).length).toBeGreaterThan(0)
  })

  it('cria uma memoria util para "o nome do meu cachorro e Billy"', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de cachorro')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'O nome do meu cachorro e Billy')

    const createdMemory = runtimeDb.memories().find((memory) => memory.text === "user dog's name: Billy")
    expect(createdMemory).toBeDefined()

    const secondTurn = await runtimeDb.sendUserMessage(chat!.id, 'Qual o nome do meu cachorro?')
    expect(secondTurn.assistantMessage?.text).toContain('Billy')
  })

  it('nao atribui ao cachorro da namorada o nome guardado para o cachorro do usuario', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createOwnershipAwareLlmClient() })

    await runtimeDb.initialize()
    await runtimeDb.createMemory("user dog's name: Billy")
    const { chat } = await runtimeDb.createChat('Teste de posse da memoria')

    expect(chat).not.toBeNull()

    const turn = await runtimeDb.sendUserMessage(chat!.id, 'qual o nome do cachorro da minha namorada?')

    expect(turn.assistantMessage?.text).toBe('Nao sei o nome do cachorro da sua namorada. Sei que o seu cachorro se chama Billy.')
  })

  it('falha quando a llm devolve uma memoria acima do limite configurado', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('x'.repeat(81)) })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de cachorro')

    expect(chat).not.toBeNull()

    await expect(runtimeDb.sendUserMessage(chat!.id, 'O nome do meu cachorro e Billy'))
      .rejects
      .toThrow(/Memoria gerada pela LLM acima do limite/i)

    expect(runtimeDb.memories()).toEqual([])
  })

  it('falha quando a llm devolve uma memoria rotulada sem valor', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('Nome do cachorro:') })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de cachorro')

    expect(chat).not.toBeNull()

    await expect(runtimeDb.sendUserMessage(chat!.id, 'O nome do meu cachorro e Billy'))
      .rejects
      .toThrow(/Memoria gerada pela LLM sem valor util/i)

    expect(runtimeDb.memories()).toEqual([])
  })

  it('preserva uma memoria quando recebe uma atualizacao vazia', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    await runtimeDb.createMemory('Prefere exemplos')
    const memory = runtimeDb.memories()[0]

    await runtimeDb.updateMemory(memory.id, '   ')

    expect(runtimeDb.memories()[0]?.text).toBe('Prefere exemplos')
  })

  it('remove links de memoria de todos os chats que a referenciavam', async () => {
    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      llmClient: createTestLlmClient(),
      seedData: {
        memories: [
          { id: 1, text: 'Comparar cenarios', feedback_score: 0, usage_count: 0, created_at: '2026-07-01', updated_at: '2026-07-01' },
        ],
        chats: [
          {
            id: 1,
            title: 'Chat 1',
            created_at: '2026-07-01',
            updated_at: '2026-07-01',
            pinned: 0,
            messages: [
              { id: 'message-1', author: 'assistant', text: 'Resposta com memoria', memoryIds: [1], rating: 0 },
            ],
          },
          {
            id: 2,
            title: 'Chat 2',
            created_at: '2026-07-01',
            updated_at: '2026-07-01',
            pinned: 0,
            messages: [
              { id: 'message-2', author: 'assistant', text: 'Outra resposta com memoria', memoryIds: [1], rating: 0 },
            ],
          },
        ],
      },
    })

    await runtimeDb.initialize()
    runtimeDb.deleteMemory(1)

    const firstChat = runtimeDb.chats().find((chat) => chat.id === 1)
    const secondChat = runtimeDb.chats().find((chat) => chat.id === 2)

    expect(firstChat?.messages[0]?.memoryIds).toEqual([])
    expect(secondChat?.messages[0]?.memoryIds).toEqual([])
  })
})
