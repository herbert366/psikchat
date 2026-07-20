function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

export function buildEmbedding(text: string) {
  const vector = Array.from({ length: 12 }, () => 0)

  for (const token of tokenize(text)) {
    const bucket = token.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % vector.length
    vector[bucket] += 1 + token.length / 10
  }

  return vector
}

function buildMemoryCandidates(prompt: string) {
  const normalizedPrompt = normalizeText(prompt)
  const candidates: string[] = []

  if (normalizedPrompt.includes('meu cachorro se chama bob')) {
    candidates.push("user dog's name: Bob")
  }

  if (normalizedPrompt.includes('o nome do meu cachorro e billy')) {
    candidates.push(
      prompt.includes('Formato obrigatorio: escreva cada memoria em ingles como "titulo semantico: valor concreto".')
        ? "user dog's name: Billy"
        : "user dog's name:",
    )
  }

  if (normalizedPrompt.includes('prefiro mapas')) {
    candidates.push('Prefere mapas')
  }

  if (normalizedPrompt.includes('prefiro respostas curtas')) {
    candidates.push('Resposta curta')
  }

  if (normalizedPrompt.includes('prefiro listas')) {
    candidates.push('Prefere listas')
  }

  if (
    normalizedPrompt.includes('quando eu falar de sentimentos')
    && normalizedPrompt.includes('me faca uma pergunta no final')
  ) {
    candidates.push('user preference for emotional topics: ask a question at end if unsure')
  }

  return JSON.stringify(candidates)
}

function buildAssistantReply(prompt: string) {
  const normalizedPrompt = normalizeText(prompt)

  if (normalizedPrompt.includes('qual o nome do meu cachorro?') && normalizedPrompt.includes("user dog's name: bob")) {
    return 'O nome do seu cachorro e Bob.'
  }

  if (
    normalizedPrompt.includes('qual o nome do meu cachorro?')
    && normalizedPrompt.includes("user dog's name: billy")
  ) {
    return 'O nome do seu cachorro e Billy.'
  }

  if (normalizedPrompt.includes('meu cachorro se chama bob')) {
    return 'Vou guardar que o nome do seu cachorro e Bob.'
  }

  if (normalizedPrompt.includes('o nome do meu cachorro e billy')) {
    return 'Vou guardar que o nome do seu cachorro e Billy.'
  }

  if (normalizedPrompt.includes('rag')) {
    return [
      'RAG mistura busca com geracao.',
      '1. O sistema busca trechos relevantes em uma base.',
      '2. Esses trechos entram no contexto do modelo.',
      '3. O modelo responde usando esse material como apoio.',
    ].join('\n')
  }

  if (normalizedPrompt.includes('compare') || normalizedPrompt.includes('comparar')) {
    return [
      'Vale comparar por criterio.',
      '1. Objetivo.',
      '2. Custo.',
      '3. Risco.',
    ].join('\n')
  }

  return 'Resposta generica.'
}

export function createTestLlmClient() {
  return {
    async embed(text: string) {
      return buildEmbedding(text)
    },
    async generateText(messages: Array<{ content: string }>) {
      const prompt = messages.map((message) => message.content).join('\n')

      if (prompt.includes('Retorne apenas um array JSON de strings')) {
        return buildMemoryCandidates(prompt)
      }

      return buildAssistantReply(prompt)
    },
  }
}
