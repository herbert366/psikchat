import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { AppDataSource } from '../src/dataSource'
import { createApiDataSource } from '../src/dataSource'
import { TEST_SEED_DATA } from './testSeedData'

export type SqliteAppHarness = {
  dataSource: AppDataSource
  cleanup: () => Promise<void>
}

function removeIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Nao foi possivel reservar uma porta para o servidor de teste.'))
        return
      }

      server.close(() => resolve(address.port))
    })
    server.on('error', reject)
  })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createSqliteAppHarness(seedData = TEST_SEED_DATA): Promise<SqliteAppHarness> {
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const dbPath = path.join(os.tmpdir(), `psikchat-app-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)
  const serverScriptPath = path.resolve(process.cwd(), 'tests', 'sqliteTestServer.mjs')
  let stderr = ''

  const serverProcess = spawn(process.execPath, [serverScriptPath], {
    env: {
      ...process.env,
      PORT: String(port),
      TEST_DB_PATH: dbPath,
      TEST_SEED_DATA_JSON: JSON.stringify(seedData),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  serverProcess.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(stderr || `Servidor de teste encerrou com codigo ${serverProcess.exitCode}.`)
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        return {
          dataSource: createApiDataSource(baseUrl),
          async cleanup() {
            if (serverProcess.exitCode === null) {
              serverProcess.kill()
              await new Promise<void>((resolve) => {
                serverProcess.once('exit', () => resolve())
              })
            }

            removeIfExists(dbPath)
            removeIfExists(`${dbPath}-shm`)
            removeIfExists(`${dbPath}-wal`)
          },
        }
      }
    }
    catch {
      await delay(50)
    }
  }

  serverProcess.kill()
  throw new Error(stderr || 'Servidor de teste SQLite nao respondeu a tempo.')
}
