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

      if (prompt.includes('qual o nome do cachorro da minha namorada?')) {
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

function createQuestionAwareLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (!prompt.includes('Retorne apenas um array JSON de strings')) return 'Resposta generica.'

      return prompt.includes('Uma pergunta nao declara um fato: nunca crie memoria a partir de perguntas')
        ? '[]'
        : '["gosto de aviao: nao"]'
    },
  }
}

function createStubbornQuestionExtractionLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '["gosto de sorvete"]'
      return 'Resposta generica.'
    },
  }
}

function createFallbackExtractionLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Modo fallback:')) return '["gosto de praia"]'
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'
      if (prompt.includes('Mensagem final do usuario: Eu gosto de praia')) return 'Voce mencionou que gosta de praia.'
      return 'Resposta generica.'
    },
  }
}

function createFirstPersonMemoryLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (!prompt.includes('Retorne apenas um array JSON de strings')) return 'Resposta generica.'

      return prompt.includes('Nunca escreva memorias sobre o proprio usuario com "user", "the user" ou "usuario".')
        ? '["tenho dificuldade de escolher as melhores ideias para executar"]'
        : '["user has difficulty choosing the best ideas to execute"]'
    },
  }
}

function createFallbackFirstPersonMemoryLlmClient(): TestLlmClient {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Modo fallback:')) {
        return prompt.includes('Nunca escreva memorias sobre o proprio usuario com "user", "the user" ou "usuario".')
          ? '["gosto de praia"]'
          : '["user likes praia"]'
      }
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'
      return 'Resposta generica.'
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
        return JSON.stringify(['nome do meu cachorro: Bob', 'gosto de Ferrari'])
      }

      if (prompt.includes('meu cachorro se chama Bob')) {
        return JSON.stringify(['nome do meu cachorro: Bob'])
      }

      if (prompt.includes('Gosto de Ferrari')) {
        return JSON.stringify(['gosto de Ferrari'])
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

function createFeedbackAwareLlmClient() {
  const assistantPrompts: string[] = []
  return {
    assistantPrompts,
    async embed() {
      return [1, 0, 0]
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Para cada memoria, valide a relacao dela com a mensagem do usuario.')) {
        return '[{"memory_id": 1, "score": 1}]'
      }
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'
      if (prompt.includes('Mensagem final do usuario:')) {
        assistantPrompts.push(prompt)
        return 'Resposta aprovada.'
      }
      return 'Resposta generica.'
    },
  }
}

function createPromptCaptureLlmClient() {
  const assistantPrompts: string[] = []
  return {
    assistantPrompts,
    async embed() {
      return [1, 0, 0]
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Retorne apenas um array JSON de strings')) return '[]'
      if (prompt.includes('Mensagem final do usuario:')) {
        assistantPrompts.push(prompt)
        return 'Preciso entender melhor seu contexto antes de opinar.'
      }
      return 'Resposta generica.'
    },
  }
}

function createQuestionFeedbackLlmClient() {
  return {
    async embed() {
      return [1, 0, 0]
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')
      if (prompt.includes('Para cada memoria, valide a relacao dela com a mensagem do usuario.')) {
        return '[{"memory_id": 1, "score": 1}, {"memory_id": 2, "score": 0}]'
      }
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

    const createdMemory = runtimeDb.memories().find((memory) => memory.text === 'nome do meu cachorro: Bob')
    expect(createdMemory).toBeDefined()
    const memoryEventMessage = runtimeDb.chats()[0]?.messages.find((message) => message.author === 'system')
    expect(memoryEventMessage?.text).toContain('Memoria criada: "nome do meu cachorro: Bob" (0% similar a "nenhuma memoria existente").')

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

    const createdMemory = runtimeDb.memories().find((memory) => memory.text === 'nome do meu cachorro: Billy')
    expect(createdMemory).toBeDefined()

    const secondTurn = await runtimeDb.sendUserMessage(chat!.id, 'Qual o nome do meu cachorro?')
    expect(secondTurn.assistantMessage?.text).toContain('Billy')
  })

  it('escreve memorias pessoais em portugues na extracao principal', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createFirstPersonMemoryLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de primeira pessoa')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Tenho dificuldade de escolher as melhores ideias para executar')

    expect(runtimeDb.memories().map((memory) => memory.text)).toContain('tenho dificuldade de escolher as melhores ideias para executar')
    expect(runtimeDb.memories().map((memory) => memory.text)).not.toContain('user has difficulty choosing the best ideas to execute')
  })

  it('nao atribui ao cachorro da namorada o nome guardado para o cachorro do usuario', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createOwnershipAwareLlmClient() })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('nome do meu cachorro: Billy')
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
      (memory) => memory.text === 'em temas emocionais, se nao souber opinar, faca uma pergunta no final',
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

  it('nao cria preferencia a partir de uma pergunta sobre o proprio usuario', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createQuestionAwareLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de pergunta sobre preferencia')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Eu gosto de aviao ou nao?')

    expect(runtimeDb.memories()).toEqual([])
  })

  it('ignora pergunta mesmo quando a llm tenta extrair uma memoria dela', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createStubbornQuestionExtractionLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de pergunta sem memoria')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'O que eu gosto?')

    expect(runtimeDb.memories()).toEqual([])
    const systemMessages = runtimeDb.chats()[0]?.messages.filter((message) => message.author === 'system') ?? []
    expect(systemMessages).toHaveLength(0)
  })

  it('usa um fallback de extracao quando a primeira tentativa nao gera memoria para uma declaracao explicita', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createFallbackExtractionLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de fallback de extracao')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Eu gosto de praia')

    expect(runtimeDb.memories().map((memory) => memory.text)).toContain('gosto de praia')
    const systemMessages = runtimeDb.chats()[0]?.messages.filter((message) => message.author === 'system') ?? []
    expect(systemMessages.at(-1)?.text).toContain('Memoria criada: "gosto de praia"')
  })

  it('escreve memorias pessoais em portugues tambem no fallback', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createFallbackFirstPersonMemoryLlmClient() })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de fallback em primeira pessoa')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Eu gosto de praia')

    expect(runtimeDb.memories().map((memory) => memory.text)).toContain('gosto de praia')
    expect(runtimeDb.memories().map((memory) => memory.text)).not.toContain('user likes praia')
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

    expect(latestSystemMessage?.text).toContain('Memoria criada: "gosto de Ferrari" (0% similar a "nenhuma memoria existente").')
    expect(latestSystemMessage?.text).not.toContain('Memoria rejeitada: ja existe algo equivalente a "nome do meu cachorro: Bob".')
  })

  it('inclui a similaridade da memoria mais parecida no debug de criacao automatica', async () => {
    runtimeDb = createEmptyRuntimeDatabase({ llmClient: createMemoryCandidateLlmClient('gosto de piscinas para nadar') })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('gosto de praia')
    const { chat } = await runtimeDb.createChat('Teste de debug de similaridade')

    expect(chat).not.toBeNull()

    await runtimeDb.sendUserMessage(chat!.id, 'Eu gosto de piscinas para nadar')

    const latestSystemMessage = runtimeDb.chats()[0]?.messages.filter((message) => message.author === 'system').at(-1)
    expect(latestSystemMessage?.text).toMatch(/Memoria criada: "gosto de piscinas para nadar" \(\d+% similar a "gosto de praia"\)\./)
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
    await runtimeDb.createMemory('gosto de praia')
    const { chat } = await runtimeDb.createChat('Teste de debug manual')

    const result = await runtimeDb.createMemory('gosto de nuvens', { chatId: chat!.id })

    expect(result.memoryEvent.status).toBe('created')
    expect(result.memoryEvent.conflictingMemoryText).toBe('gosto de praia')
    expect(result.eventMessage?.text).toMatch(/Memoria criada: "gosto de nuvens" \(\d+% similar a "gosto de praia"\)\./)
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

  it('ordena memorias por uso e similaridade conforme o novo score', async () => {
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

    expect(turn.assistantMessage?.memoryIds).toEqual([2, 1])
    expect(turn.assistantMessage?.memoryMatches?.map((match) => match.similarityPercent)).toEqual([50, 100])
  })

  it('registra status automatico e reutiliza respostas avaliadas como exemplos', async () => {
    const llmClient = createFeedbackAwareLlmClient()
    runtimeDb = createEmptyRuntimeDatabase({ llmClient })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('prefers concise answers')
    const { chat } = await runtimeDb.createChat('Teste de feedbacks')

    const firstTurn = await runtimeDb.sendUserMessage(chat!.id, 'prefers concise answers')
    expect(runtimeDb.memories()[0]?.statusHistory).toHaveLength(1)
    expect(runtimeDb.memories()[0]?.statusHistory[0]?.status).toBe('positive')

    await runtimeDb.rateAssistantMessage(chat!.id, firstTurn.assistantMessage!.id, 1)
    await runtimeDb.sendUserMessage(chat!.id, 'prefers concise answers again')

    expect(llmClient.assistantPrompts.at(-1)).toContain('Mensagens boas:\nResposta aprovada.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Historico de status: [{"status":"positive"')
    expect(llmClient.assistantPrompts.at(-1)).toContain('As memorias sao contexto interno: use esse contexto em silencio e responda como uma pessoa normal.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Se a pergunta for sobre gostos, preferencias ou afinidades, fale apenas desses itens; nao misture dificuldades, metas, instrucoes ou outros fatos pessoais fora do tema.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Se houver contexto suficiente nas memorias e no chat, responda direto sem fazer perguntas de acompanhamento.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Se o usuario pedir opiniao, conselho, ajuda para decidir, interpretar ou resolver algo da propria vida')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Se nenhuma memoria relevante tiver sido recuperada e o pedido envolver estilo de vida, rotina, trabalho, sentimentos, organizacao, metas, habitos, relacionamentos ou decisoes pessoais, nao responda com conselho generico.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Prefira perguntas especificas sobre rotina, prioridades, restricoes, energia, prazo, contexto atual, pessoas envolvidas e o que ja foi tentado.')
  })

  it('instrui a llm a fazer perguntas especificas quando nao houver memoria relevante para opinar sobre a vida do usuario', async () => {
    const llmClient = createPromptCaptureLlmClient()
    runtimeDb = createEmptyRuntimeDatabase({ llmClient })

    await runtimeDb.initialize()
    const { chat } = await runtimeDb.createChat('Teste de pergunta sem memoria relevante')

    await runtimeDb.sendUserMessage(chat!.id, 'Como eu consigo tomar melhores decisoes?')

    expect(llmClient.assistantPrompts.at(-1)).toContain('Memorias relevantes recuperadas para esta resposta:\nConsidere a lista abaixo como o conjunto de fatos candidatos a responder o pedido do usuario. Se varios itens forem relevantes, cite todos.\nNao trate a ordem da lista como permissao para ignorar os itens seguintes.\nSe aparecerem memorias complementares sobre gostos, preferencias, idioma, contexto ou fatos pessoais, combine os itens compativeis numa resposta so.\n(nenhuma memoria relevante)')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Se nenhuma memoria relevante tiver sido recuperada e o pedido envolver estilo de vida, rotina, trabalho, sentimentos, organizacao, metas, habitos, relacionamentos ou decisoes pessoais, nao responda com conselho generico.')
    expect(llmClient.assistantPrompts.at(-1)).toContain('Evite perguntas vagas como "quer que eu aprofunde?" ou "me conte mais sobre voce".')
  })

  it('anexa info estruturada dos feedbacks automaticos ao chat', async () => {
    const llmClient = createFeedbackAwareLlmClient()
    runtimeDb = createEmptyRuntimeDatabase({ llmClient })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('prefers concise answers')
    const { chat } = await runtimeDb.createChat('Teste de info de feedbacks')

    await runtimeDb.sendUserMessage(chat!.id, 'prefers concise answers')

    const feedbackMessage = runtimeDb.chats()[0]?.messages.find((message) => message.memoryFeedbacks?.length)
    expect(feedbackMessage?.author).toBe('system')
    expect(feedbackMessage?.memoryFeedbacks).toEqual([
      {
        memoryId: 1,
        memoryText: 'prefers concise answers',
        score: 1,
        status: 'positive',
        detail: 'Feedback positivo: memoria 1 confirmada por "prefers concise answers".',
      },
    ])
  })

  it('nao anexa feedbacks neutros quando a mensagem do usuario e so uma pergunta', async () => {
    const llmClient = createQuestionFeedbackLlmClient()
    runtimeDb = createEmptyRuntimeDatabase({ llmClient })

    await runtimeDb.initialize()
    await runtimeDb.createMemory('User likes airplanes')
    await runtimeDb.createMemory('User likes ships')
    const { chat } = await runtimeDb.createChat('Teste de pergunta sem feedback visual')

    const feedbacks = await runtimeDb.sendUserMessage(chat!.id, 'O que eu gosto?')

    expect(feedbacks.assistantMessage).toBeDefined()
    expect(runtimeDb.chats()[0]?.messages.some((message) => message.memoryFeedbacks?.length)).toBe(false)
    expect(runtimeDb.memories().every((memory) => memory.statusHistory.length === 0)).toBe(true)
  })
})
