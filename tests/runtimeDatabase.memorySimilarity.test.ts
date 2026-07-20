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
      if (text === 'prefers concise answers') return [1, 0, 0]
      if (text === 'likes short replies') return [0.9, 0.1, 0]
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return JSON.stringify(['likes short replies'])
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
    await runtimeDb.createMemory('prefers concise answers')
    const { chat } = await runtimeDb.createChat('Teste de similaridade alta')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Prefiro respostas curtas')

    expect(runtimeDb.memories().map((memory) => memory.text)).toEqual(['prefers concise answers'])
  })
})
