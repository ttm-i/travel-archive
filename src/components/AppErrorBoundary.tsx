import { Component, type ErrorInfo, type ReactNode } from 'react'
import { recordAppLog } from '../db'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void recordAppLog('error', error.message, info.componentStack ?? undefined)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <span>TRAVEL ARCHIVE</span>
          <h1>アプリを開始できませんでした</h1>
          <p>Safariを閉じて、もう一度お試しください。繰り返す場合も端末内データは削除しないでください。</p>
          <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
        </main>
      )
    }
    return this.props.children
  }
}

