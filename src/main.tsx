import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { PwaStatus } from './components/PwaStatus'
import { initializeDatabase, recordAppLog } from './db'
import './styles.css'

window.addEventListener('error', (event) => {
  void recordAppLog('error', event.message, event.error instanceof Error ? event.error.stack : undefined)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  void recordAppLog('error', reason.message, reason.stack)
})

async function start() {
  await initializeDatabase()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
        <PwaStatus />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  document.getElementById('root')!.innerHTML = `
    <main class="fatal-error">
      <span>TRAVEL ARCHIVE</span>
      <h1>端末内保存を準備できませんでした</h1>
      <p>Safariを閉じて、もう一度お試しください。端末内データは削除しないでください。</p>
      <button type="button" onclick="window.location.reload()">再読み込み</button>
      <small>${message.replace(/[<>&"']/g, '')}</small>
    </main>`
})

