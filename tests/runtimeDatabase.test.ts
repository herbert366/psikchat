/* @vitest-environment node */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeDatabase } from '../server/runtimeDatabase.mjs'
import { createTestLlmClient } from './testLlmClient'

type RuntimeDatabase = ReturnType<typeof createRuntimeDatabase>

let runtimeDb: RuntimeDatabase | null = null
let dbPath: string | null = null

function removeIfExists(filePath: string | null) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function createEmptyRuntimeDatabase() {
  dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
  runtimeDb = createRuntimeDatabase({
    dbPath,
    llmClient: createTestLlmClient(),
    seedData: { chats: [], memories: [] },
  })

  return runtimeDb
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

    const createdMemory = runtimeDb.memories().find((memory) => memory.text === 'Cachorro: Bob')
    expect(createdMemory).toBeDefined()

    const secondTurn = await runtimeDb.sendUserMessage(chat!.id, 'Qual o nome do meu cachorro?')
    expect(secondTurn.assistantMessage?.text).toContain('Bob')
    expect((secondTurn.assistantMessage?.memoryIds ?? []).length).toBeGreaterThan(0)
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
