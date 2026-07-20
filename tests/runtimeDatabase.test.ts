/* @vitest-environment node */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeDatabase } from '../server/runtimeDatabase.mjs'

type RuntimeDatabase = ReturnType<typeof createRuntimeDatabase>

let runtimeDb: RuntimeDatabase | null = null
let dbPath: string | null = null

function buildEmbedding(text: string) {
  const vector = Array.from({ length: 8 }, () => 0)
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  for (let index = 0; index < normalized.length; index += 1) {
    vector[index % vector.length] += normalized.charCodeAt(index)
  }
  return vector
}

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}

function createFetchStub() {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const pathname = typeof url === 'string'
      ? new URL(url).pathname
      : url instanceof URL
        ? url.pathname
        : new URL(url.url).pathname

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      input?: string
      messages?: Array<{ content: string }>
    }

    if (pathname.endsWith('/embeddings')) {
      return createJsonResponse({ data: [{ embedding: buildEmbedding(body.input ?? '') }] })
    }

    if (pathname.endsWith('/chat/completions')) {
      const prompt = (body.messages ?? []).map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        if (/bob/i.test(prompt) && /cachorro/i.test(prompt)) {
          return createJsonResponse({ choices: [{ message: { content: '["Cachorro: Bob"]' } }] })
        }

        return createJsonResponse({ choices: [{ message: { content: '[]' } }] })
      }

      if (/qual o nome do meu cachorro\?/i.test(prompt) && /cachorro: bob/i.test(prompt)) {
        return createJsonResponse({ choices: [{ message: { content: 'O nome do seu cachorro e Bob.' } }] })
      }

      if (/meu cachorro se chama bob/i.test(prompt)) {
        return createJsonResponse({ choices: [{ message: { content: 'Vou guardar que o nome do seu cachorro e Bob.' } }] })
      }

      return createJsonResponse({ choices: [{ message: { content: 'Resposta generica.' } }] })
    }

    throw new Error(`Rota nao tratada no fetch stub: ${pathname}`)
  }
}

afterEach(() => {
  runtimeDb?.close()
  runtimeDb = null

  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }
  dbPath = null
})

describe('runtimeDatabase', () => {
  it('cria memorias a partir da conversa e as reutiliza numa resposta posterior', async () => {
    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      fetchImpl: createFetchStub(),
      seedData: { chats: [], memories: [] },
    })

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
    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      fetchImpl: createFetchStub(),
      seedData: { chats: [], memories: [] },
    })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('Prefere exemplos')
    const memory = runtimeDb.memories()[0]

    await runtimeDb.updateMemory(memory.id, '   ')

    expect(runtimeDb.memories()[0]?.text).toBe('Prefere exemplos')
  })
})
