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
  dbPath = path.join(os.tmpdir(), `psikchat-runtime-title-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
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

describe('runtimeDatabase chat title', () => {
  it('uses the first user message as the chat title and keeps it on later messages', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Rascunho inicial')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, '  Meu titulo definitivo  ')
    expect(runtimeDb.chats().find((item) => item.id === chat!.id)?.title).toBe('Meu titulo definitivo')

    await runtimeDb.sendUserMessage(chat!.id, 'Segunda mensagem')
    expect(runtimeDb.chats().find((item) => item.id === chat!.id)?.title).toBe('Meu titulo definitivo')
  })
})
