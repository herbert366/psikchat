import http from 'node:http'
import path from 'node:path'
import { createRuntimeDatabase } from './runtimeDatabase.mjs'

const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.APP_DB_PATH
  ? path.resolve(process.cwd(), process.env.APP_DB_PATH)
  : path.resolve(process.cwd(), 'data', 'psikchat.sqlite')

const runtimeDb = createRuntimeDatabase({ dbPath })
await runtimeDb.initialize()

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })
  response.end(JSON.stringify(body))
}

function sendNdjson(response, body) {
  response.write(`${JSON.stringify(body)}\n`)
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  catch {
    return {}
  }
}

const server = http.createServer(async (request, response) => {
  const method = request.method ?? 'GET'
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  try {
    if (method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    if (method === 'GET' && url.pathname === '/api/state') {
      sendJson(response, 200, runtimeDb.listState())
      return
    }

    if (method === 'POST' && url.pathname === '/api/chats') {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.createChat(body.title))
      return
    }

    if (method === 'POST' && url.pathname === '/api/reset') {
      sendJson(response, 200, runtimeDb.resetApp())
      return
    }

    const chatTitleMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/title$/)
    if (method === 'PATCH' && chatTitleMatch) {
      const body = await readBody(request)
      sendJson(response, 200, runtimeDb.renameChat(Number(chatTitleMatch[1]), body.title ?? 'Novo chat'))
      return
    }

    const chatPinMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/toggle-pin$/)
    if (method === 'POST' && chatPinMatch) {
      sendJson(response, 200, runtimeDb.toggleChatPinned(Number(chatPinMatch[1])))
      return
    }

    const chatDeleteMatch = url.pathname.match(/^\/api\/chats\/(\d+)$/)
    if (method === 'DELETE' && chatDeleteMatch) {
      sendJson(response, 200, runtimeDb.deleteChat(Number(chatDeleteMatch[1])))
      return
    }

    const chatMessageMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/messages$/)
    if (method === 'POST' && chatMessageMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.sendUserMessage(Number(chatMessageMatch[1]), body.text ?? ''))
      return
    }

    const chatMessageStreamMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/messages\/stream$/)
    if (method === 'POST' && chatMessageStreamMatch) {
      const body = await readBody(request)
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      })

      const result = await runtimeDb.sendUserMessageStream(Number(chatMessageStreamMatch[1]), body.text ?? '', (event) => {
        sendNdjson(response, { ...event, done: false })
      })

      sendNdjson(response, { ...result, done: true })
      response.end()
      return
    }

    const chatRatingMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/messages\/([^/]+)\/rating$/)
    if (method === 'POST' && chatRatingMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.rateAssistantMessage(Number(chatRatingMatch[1]), chatRatingMatch[2], body.rating ?? 0))
      return
    }

    if (method === 'POST' && url.pathname === '/api/memories') {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.createMemory(body.text ?? '', { chatId: body.chatId ?? null }))
      return
    }

    if (method === 'POST' && url.pathname === '/api/memories/embedding-similarity') {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.inspectMemoryEmbeddingSimilarity(body.text ?? '', {
        page: body.page,
        pageSize: body.pageSize,
      }))
      return
    }

    const memoryUpdateMatch = url.pathname.match(/^\/api\/memories\/(\d+)$/)
    if (method === 'PATCH' && memoryUpdateMatch) {
      const body = await readBody(request)
      sendJson(response, 200, await runtimeDb.updateMemory(Number(memoryUpdateMatch[1]), body.text ?? ''))
      return
    }

    if (method === 'DELETE' && memoryUpdateMatch) {
      sendJson(response, 200, runtimeDb.deleteMemory(Number(memoryUpdateMatch[1])))
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  }
  catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

server.listen(port, () => {
  console.log(`API pronta em http://localhost:${port}`)
})

function shutdown() {
  server.close(() => {
    runtimeDb.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
