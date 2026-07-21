const config = {
  maxCaracteresMemory: 20,
  maxCaracteresMemoryToCreateMemory: 500,
  maxCaracteresMemoryContext: 500,
  similarityThresholdToCreate: 0.85,
  embeddingSimilarityThreshold: 0.4
}

function toPercent(score) {
  return Math.round(score * 100)
}


memoriesDb.embeddingsSearch = function ({ chat_text, max_memories = 20 }) {
  let memories = memoriesDb.map(memory => ({ ...memory, similarity: memory.embeddingSimilarity(chat_text) }))
  memories = memories.filter(memory => memory.similarity > config.embeddingSimilarityThreshold)

  const memoriesDataScores = memories.map(memory => {
    const lastHistory = memory.statusHistory[memory.statusHistory.length - 1]

    return {
      memoryDataToLLm: {
        ...memory,
        statusHistory: memory.statusHistory.slice(-10).map(item => ({ status: item.status, atDays: timeDays(item.at) }))
      },
      score: -(lastHistory ? timeDays(lastHistory.at) : 0) * 1 //qnt mais recente melhor
        + memory.usage_count * 0.4
        + memory.similarity * 0.7
    }
  })

  return memoriesDataScores.sort((a, b) => b.score - a.score).slice(0, max_memories).map(item => item.memoryDataToLLm)
}


const historyChat = {
  id: 1,
  title: "Conversa sobre RAG",
  entries: [
    { id: 1, role: "user", content: "Oi" },
    { id: 2, role: "assistant", content: "Olá!" },
    { id: 3, role: "user", content: "Como funciona RAG?" }
  ]
}

historyChat.chat_text_without_last = historyChat.entries.slice(0, -1).map(entry => entry.content).join("\n")
historyChat.chat_text = historyChat.entries.map(entry => entry.content).join("\n")
historyChat.lastUserMessage = historyChat.entries.filter(entry => entry.role === "user").at(-1)


function findMemories(chat_text) {
  const memories = memoriesDb.embeddingsSearch({ chat_text })

  memories.forEach(memory => {
    memoriesDb.update(memory.id, {
      usage_count: memory.usage_count + 1,
      updated_at: now()
    })
  })

  return memories
}


function feedbackMemories(lastUserMessage) {
  const memories = memoriesDb.embeddingsSearch({
    chat_text: lastUserMessage.content,
    max_memories: 20
  })

  if (memories.length === 0) return []

  const feedbacksStr = llm({
    prompt: `
    Mensagem do user:
    ${lastUserMessage.content}

    Para cada memoria, valide a relacao dela com a mensagem do user.
    Retorne somente JSON no formato [{"memory_id": 1, "score": 1}].
    score: 1 se a mensagem confirma ou se relaciona diretamente com a memoria;
    score: -1 se a mensagem contradiz a memoria;
    score: 0 se nao ha evidencia suficiente.
    `
  })

  try {
    const feedbacks = JSON.parse(feedbacksStr)
    const memoryIds = new Set(memories.map(memory => memory.id))

    feedbacks.forEach(({ memory_id, score }) => {
      if (!memoryIds.has(memory_id) || ![-1, 0, 1].includes(score)) return
      if (score === 0) return

      const memory = memoriesDb.get(memory_id)
      memoriesDb.update(memory_id, {
        updated_at: now(),
        statusHistory: [
          ...memory.statusHistory,
          { status: score > 0 ? "positive" : "negative", score, at: now() }
        ]
      })
    })


    app.createdInfos({
      title: "Feedbacks",
      content: JSON.stringify(feedbacks, null, 2)
    })

    return feedbacks
  }
  catch (error) {
    app.toast.persistentLog(error)
    return []
  }
}


function createNewMemories(historyChat) {
  const lastSnniptMessages = historyChat.chat_text.slice(-config.maxCaracteresMemoryToCreateMemory)

  const newMemoryNamesStr = llm({
    prompt: `
    Chat:
    ${lastSnniptMessages}

    MemoriesAlreadyCreated:
    ${memoriesDb.embeddingsSearch({ chat_text: lastSnniptMessages, max_memories: 20 }).map(memory => memory.text).join('\n')}

    Crie novas memorias com base no chat acima e ignore as que já foram criadas

    retorne no formato ["..."]
    as memorias devem ter no máximo ${config.maxCaracteresMemory} caracteres
    `
  })

  try {
    const newMemoryNames = JSON.parse(newMemoryNamesStr)

    const newMemoryCandidates = newMemoryNames.map(memory => {
      const mostSimilar = memoriesDb.getMostSimilar(memory, 1)[0]

      return {
        text: memory,
        similarity: mostSimilar?.similarity ?? 0,
        conflictingMemoryText: mostSimilar?.text ?? "nenhuma memoria existente"
      }
    })

    const newMemoriesFilted = newMemoryCandidates.filter(memory =>
      memory.text.length <= config.maxCaracteresMemory &&
      memoriesDb.getMostSimilar(memory.text, config.similarityThresholdToCreate).length === 0
    )

    const memoriesRejeitadas = {
      maxCaracteresMemory: newMemoryCandidates.filter(memory => memory.text.length > config.maxCaracteresMemory),
      tooSimilar: newMemoryCandidates.filter(memory =>
        memory.text.length <= config.maxCaracteresMemory &&
        !newMemoriesFilted.includes(memory)
      )
    }

    app.memoriesCreatedInfos({
      rejeitadas: memoriesRejeitadas,
      titulo: newMemoriesFilted.length === 1 ? "Memoria atualizada" : "Memorias atualizadas",
      criadas: newMemoriesFilted.map(memory => ({
        text: memory.text,
        similarityPercent: toPercent(memory.similarity),
        conflictingMemoryText: memory.conflictingMemoryText,
        detail: `criou: "${memory.text}" (${toPercent(memory.similarity)}% similar a "${memory.conflictingMemoryText}")`
      }))
    })

    memoriesDb.create(newMemoriesFilted.map(memory => ({
      text: memory.text,
      created_at: now(),
      updated_at: now(),
      usage_count: 0,
      statusHistory: [],
      embedding: createEmbedding(memory.text)
    })))
  }
  catch (error) {
    app.toast.persistentLog(error)
  }
}


function setMemoryStatus(memory_id, status) {
  const memory = memoriesDb.get(memory_id)

  memoriesDb.update(memory_id, {
    updated_at: now(),
    statusHistory: [
      ...memory.statusHistory,
      { status, at: now() }
    ]
  })
}


function saveMessageFeedback({ chat_id, message_id, status }) {
  if (messageIsNotFromAI(message_id)) throw new Error("Message is not from AI, não tem como dá feedback em sua propria mensagem de user")

  const chat = chatsDb.get(chat_id)
  const message = chat.history_chat_json.entries.find(entry => entry.id === message_id)

  mensagensMemoryDb.create({
    chat_id,
    message_id,
    type: status === "positive" ? "good" : "bad",
    content: message.content,
    created_at: now(),
    embedding: createEmbedding(message.content)
  })
}


function onMessageThumbUp({ chat_id, message_id }) {
  saveMessageFeedback({ chat_id, message_id, status: "positive" })
}


function onMessageThumbDown({ chat_id, message_id }) {
  saveMessageFeedback({ chat_id, message_id, status: "negative" })
}


function agentRespond(historyChat) {
  feedbackMemories(historyChat.lastUserMessage)
  createNewMemories(historyChat)

  const allChat = historyChat.chat_text_without_last
  const lastUserMessage = historyChat.lastUserMessage
  const memories = findMemories(allChat)

  const goodMessages = mensagensMemoryDb.findFromEmbeddings({
    type: "good",
    query: lastUserMessage.content
  })

  const badMessages = mensagensMemoryDb.findFromEmbeddings({
    type: "bad",
    query: lastUserMessage.content
  })

  const message = llm({
    prompt: `
    Mensagens boas:
    ${goodMessages.join('\n')}

    Mensagens ruins:
    ${badMessages.join('\n')}

    | Memory | Status History |
    |--------|----------------|
    ${memories.map(memory =>
      `| ${memory.text} | ${JSON.stringify(memory.statusHistory)} |`
    ).join('\n')}

    Chat:
    ${historyChat.chat_text.slice(-config.maxCaracteresMemoryContext)}

    Com base nas memorias, nas mensagens boas e ruins e no chat,
    responda a mensagem do user: ${lastUserMessage.content}
    `
  })

  historyChat.entries.push({
    id: generateId(),
    role: "assistant",
    content: message
  })

  chatsDb.update(historyChat.id, {
    updated_at: now(),
    history_chat_json: historyChat
  })

  return message
}
