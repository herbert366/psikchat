/* @vitest-environment node */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeDatabase } from '../server/runtimeDatabase.mjs'
import { buildEmbedding } from './testLlmClient'

let runtimeDb: ReturnType<typeof createRuntimeDatabase> | null = null
let dbPath: string | null = null

function removeIfExists(filePath: string | null) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function createHighSimilarityMemoryLlmClient() {
  return {
    async embed(text: string) {
      if (text === 'prefere respostas objetivas') return [1, 0, 0]
      if (text === 'prefere respostas curtas') return [0.9, 0.1, 0]
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return JSON.stringify(['prefere respostas curtas'])
      }

      return 'Resposta generica.'
    },
  }
}

function createBelowThresholdDuplicateLlmClient() {
  return {
    async embed(text: string) {
      if (text === 'gosto de avioes') return [1, 0, 0]
      if (text === 'gosto muito de avioes') return [0.8, 0.6, 0]
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return JSON.stringify(['gosto muito de avioes'])
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

describe('runtimeDatabase memory similarity guard', () => {
  it('nao cria memoria nova quando ela for similar demais a uma ja existente', async () => {
    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      llmClient: createHighSimilarityMemoryLlmClient(),
      seedData: { chats: [], memories: [] },
    })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('prefere respostas objetivas')
    const { chat } = await runtimeDb.createChat('Teste de similaridade alta')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Prefiro respostas curtas')

    expect(runtimeDb.memories().map((memory) => memory.text)).toEqual(['prefere respostas objetivas'])
  })

  it('nao trata como memoria duplicada uma candidata abaixo do limiar de 86%', async () => {
    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      llmClient: createBelowThresholdDuplicateLlmClient(),
      seedData: {
        chats: [],
        memories: [
          {
            id: 1,
            text: 'gosto de avioes',
            feedback_score: 0,
            usage_count: 0,
            created_at: '2026-07-20',
            updated_at: '2026-07-20',
            embedding: [1, 0, 0],
          },
        ],
      },
    })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de duplicata abaixo do limiar')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Quero te contar uma preferencia minha.')

    expect(runtimeDb.memories().map((memory) => memory.text).sort()).toEqual([
      'gosto de avioes',
      'gosto muito de avioes',
    ].sort())

    const updatedChat = runtimeDb.chats().find((entry) => entry.id === chat!.id)
    const systemMessage = updatedChat?.messages.find((message) => message.author === 'system')

    expect(systemMessage?.memoryEvent?.status).toBe('created')
    expect(systemMessage?.text).toContain('Memoria criada')
    expect(systemMessage?.text).not.toContain('Memoria rejeitada')
  })
})
