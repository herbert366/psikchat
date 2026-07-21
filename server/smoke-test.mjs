import fs from 'node:fs'
import path from 'node:path'
import { createRuntimeDatabase } from './runtimeDatabase.mjs'

const dbPath = path.resolve(process.cwd(), 'data', 'psikchat-smoke.sqlite')
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
}

const runtimeDb = createRuntimeDatabase({ dbPath })

try {
  await runtimeDb.initialize()
  const { chat } = await runtimeDb.createChat('Smoke test')
  if (!chat) {
    throw new Error('Nao foi possivel criar o chat de smoke test.')
  }

  await runtimeDb.sendUserMessage(chat.id, 'O nome do meu cachorro é billy.')
  const afterFirstTurn = runtimeDb.listState()
  const createdMemory = afterFirstTurn.memories.find((memory) => memory.text.toLowerCase() === 'nome do meu cachorro: billy')
  if (!createdMemory) {
    throw new Error(`A memoria canonica nao foi criada. Memorias recebidas: ${afterFirstTurn.memories.map((memory) => memory.text).join(' | ')}`)
  }

  if (/:\s*$/.test(createdMemory.text)) {
    throw new Error(`A memoria foi salva sem valor: ${createdMemory.text}`)
  }

  const secondTurn = await runtimeDb.sendUserMessage(chat.id, 'Qual o nome do meu cachorro?')
  const answer = secondTurn.assistantMessage?.text ?? ''
  if (!/billy/i.test(answer)) {
    throw new Error(`A resposta nao lembrou do cachorro. Resposta recebida: ${answer}`)
  }

  console.log('Smoke test OK')
  console.log(`Memoria criada: ${createdMemory.text}`)
  console.log(`Resposta final: ${answer}`)
}
finally {
  runtimeDb.close()
}
