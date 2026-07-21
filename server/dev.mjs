import { spawn } from 'node:child_process'
import path from 'node:path'

const apiProcess = spawn(process.execPath, ['--env-file=.env', 'server/index.mjs'], { stdio: 'inherit' })
const viteProcess = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' })

let isStopping = false

function stopChildren() {
  if (isStopping) return
  isStopping = true
  apiProcess.kill()
  viteProcess.kill()
}

process.on('SIGINT', stopChildren)
process.on('SIGTERM', stopChildren)

apiProcess.on('error', (error) => {
  console.error(`Nao foi possivel iniciar a API local: ${error.message}`)
})

viteProcess.on('exit', (code) => {
  stopChildren()
  process.exit(code ?? 0)
})
