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

function createAntiInferenceLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (!prompt.includes('Retorne apenas um array JSON de strings')) return 'Resposta generica.'

      return prompt.includes('Nao infira metas permanentes, preferencias duradouras ou prioridades a partir de uma pergunta isolada, exercicio, teste, curiosidade ou pedido pontual.')
        ? '[]'
        : '["primary goal: Learn math"]'
    },
  }
}

function createHistorySensitiveLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (!prompt.includes('Retorne apenas um array JSON de strings')) {
        return prompt.includes('gosto de ferrari') ? 'Voce gosta de Ferrari.' : 'Resposta generica.'
      }

      if (prompt.includes('meu cachorro se chama Bob') && prompt.includes('Gosto de Ferrari')) {
        return JSON.stringify(["user dog's name: Bob", 'user likes Ferrari'])
      }

      if (prompt.includes('meu cachorro se chama Bob')) {
        return JSON.stringify(["user dog's name: Bob"])
      }

      if (prompt.includes('Gosto de Ferrari')) {
        return JSON.stringify(['user likes Ferrari'])
      }

      return '[]'
    },
  }
}

function createFixedEmbeddingLlmClient(embeddingByText: Record<string, number[]>, fallbackEmbedding: number[] = Array.from({ length: 12 }, () => 0)): TestLlmClient {
  return {
    async embed(text: string) {
      return embeddingByText[text] ?? fallbackEmbedding
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'
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
    const memoryEventMessage = runtimeDb.chats()[0]?.messages.find((message) => message.author === 'system')
    expect(memoryEventMessage?.text).toContain("Memoria criada: \"user dog's name: Bob\" (0% similar a \"nenhuma memoria existente\").")

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

  it('cria memoria para uma instrucao recorrente sobre sentimentos', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de instrucao recorrente')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Geralmente quando eu falar de sentimentos e voce nao souber opinar, me faca uma pergunta no final da sua mensagem')

    const createdMemory = runtimeDb.memories().find(
      (memory) => memory.text === 'user preference for emotional topics: ask a question at end if unsure',
    )

    expect(createdMemory).toBeDefined()
  })

  it('nao cria memoria especulativa a partir de uma pergunta isolada', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createAntiInferenceLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de inferencia indevida')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Quanto e 2+2?')

    expect(runtimeDb.memories()).toEqual([])
  })

  it('nao rejeita memorias antigas de outra mensagem ao extrair uma memoria nova', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createHistorySensitiveLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de foco na ultima mensagem')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Meu cachorro se chama Bob')
    await runtimeDb.sendUserMessage(chat!.id, 'Gosto de Ferrari')

    const systemMessages = runtimeDb.chats()[0]?.messages.filter((message) => message.author === 'system') ?? []
    const latestSystemMessage = systemMessages.at(-1)

    expect(latestSystemMessage?.text).toContain('Memoria criada: "user likes Ferrari" (0% similar a "nenhuma memoria existente").')
    expect(latestSystemMessage?.text).not.toContain("Memoria rejeitada: ja existe algo equivalente a \"user dog's name: Bob\".")
  })

  it('inclui a similaridade da memoria mais parecida no debug de criacao automatica', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('user likes swimming pools') })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('user likes praia')
    const { chat } = await runtimeDb.createChat('Teste de debug de similaridade')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Eu gosto de piscinas para nadar')

    const latestSystemMessage = runtimeDb.chats()[0]?.messages.filter((message) => message.author === 'system').at(-1)
    expect(latestSystemMessage?.text).toMatch(/Memoria criada: "user likes swimming pools" \(\d+% similar a "user likes praia"\)\./)
  })

  it('registra debug quando a llm devolve uma memoria acima do limite configurado', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('x'.repeat(81)) })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de cachorro')

    expect(chat).not.toBeNull()

    const turn = await runtimeDb.sendUserMessage(chat!.id, 'O nome do meu cachorro e Billy')

    expect(runtimeDb.memories()).toEqual([])
    expect(turn.assistantMessage?.text).toBeDefined()
    const memoryEventMessage = runtimeDb.chats()[0]?.messages.find((message) => message.author === 'system')
    expect(memoryEventMessage?.text).toContain('Memoria rejeitada: 81/80 caracteres.')
  })

  it('registra debug quando a llm devolve uma memoria rotulada sem valor', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('Nome do cachorro:') })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de cachorro')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'O nome do meu cachorro e Billy')

    expect(runtimeDb.memories()).toEqual([])
    const memoryEventMessage = runtimeDb.chats()[0]?.messages.find((message) => message.author === 'system')
    expect(memoryEventMessage?.text).toContain('rotulo sem valor util')
  })

  it('preserva uma memoria quando recebe uma atualizacao vazia', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    await runtimeDb.createMemory('Prefere exemplos')
    const memory = runtimeDb.memories()[0]

    await runtimeDb.updateMemory(memory.id, '   ')

    expect(runtimeDb.memories()[0]?.text).toBe('Prefere exemplos')
  })

  it('retorna rejeicao estruturada quando a memoria manual passa do limite', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de limite manual')

    const result = await runtimeDb.createMemory('x'.repeat(81), { chatId: chat!.id })

    expect(result.memoryEvent.status).toBe('rejected')
    expect(result.memoryEvent.reason).toBe('too_long')
    expect(result.eventMessage?.author).toBe('system')
    expect(runtimeDb.memories()).toEqual([])
  })

  it('mostra as duas memorias no detalhe de duplicata manual', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    await runtimeDb.createMemory('User likes ships')
    const { chat } = await runtimeDb.createChat('Teste de duplicata manual')

    const result = await runtimeDb.createMemory('User likes ships', { chatId: chat!.id })

    expect(result.memoryEvent.status).toBe('rejected')
    expect(result.memoryEvent.reason).toBe('already_exists')
    expect(result.memoryEvent.storedText).toBe('User likes ships')
    expect(result.memoryEvent.conflictingMemoryText).toBe('User likes ships')
    expect(result.memoryEvent.embeddingSimilarityPercent).toBe(100)
    expect(result.memoryEvent.lexicalSimilarityPercent).toBe(100)
    expect(result.memoryEvent.similarityPercent).toBe(100)
    expect(result.memoryEvent.truthSimilaritySource).toBe('embedding')
    expect(result.memoryEvent.similarityThresholdPercent).toBe(86)
    expect(result.eventMessage?.text).toBe('Memoria rejeitada: tentou criar "User likes ships", mas ela duplica "User likes ships".')
  })

  it('mostra a memoria mais parecida no debug manual mesmo quando a similaridade arredonda para 0%', async () => {
    runtimeDb = createEmptyRuntimeDatabase()

    await runtimeDb.initialize()
    await runtimeDb.createMemory('user likes praia')
    const { chat } = await runtimeDb.createChat('Teste de debug manual')

    const result = await runtimeDb.createMemory('user likes clouds', { chatId: chat!.id })

    expect(result.memoryEvent.status).toBe('created')
    expect(result.memoryEvent.conflictingMemoryText).toBe('user likes praia')
    expect(result.eventMessage?.text).toMatch(/Memoria criada: "user likes clouds" \(\d+% similar a "user likes praia"\)\./)
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

  it('ordena memorias usadas por similaridade mesmo quando outra memoria tem mais uso e feedback', async () => {
    const queryText = 'consulta de teste'
    const highSimilarityEmbedding = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const lowerSimilarityEmbedding = [0.5, 0.866, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

    dbPath = path.join(os.tmpdir(), `psikchat-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
    runtimeDb = createRuntimeDatabase({
      dbPath,
      llmClient: createFixedEmbeddingLlmClient({}, highSimilarityEmbedding),
      seedData: {
        memories: [
          {
            id: 1,
            text: 'Memoria mais parecida',
            feedback_score: 0,
            usage_count: 0,
            created_at: '2026-07-20',
            updated_at: '2026-07-20',
            embedding: highSimilarityEmbedding,
          },
          {
            id: 2,
            text: 'Memoria menos parecida mas popular',
            feedback_score: 5,
            usage_count: 20,
            created_at: '2026-07-20',
            updated_at: '2026-07-20',
            embedding: lowerSimilarityEmbedding,
          },
        ],
        chats: [],
      },
    })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de ordenacao por similaridade')
    const turn = await runtimeDb.sendUserMessage(chat!.id, queryText)

    expect(turn.assistantMessage?.memoryIds).toEqual([1, 2])
    expect(turn.assistantMessage?.memoryMatches?.map((match) => match.similarityPercent)).toEqual([100, 50])
  })
})
