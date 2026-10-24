import { useEffect, useState } from 'react'
import { Check, Download, WifiOff, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineDismissed, setOfflineDismissed] = useState(false)
  const [showReady, setShowReady] = useState(false)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW() {
      // Registration is intentionally silent; the banner reports actionable states.
    },
  })

  useEffect(() => {
    const update = () => {
      const nextOnline = navigator.onLine
      setOnline(nextOnline)
      if (nextOnline) setOfflineDismissed(false)
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!offlineReady) return
    setShowReady(true)
    const timer = window.setTimeout(() => {
      setShowReady(false)
      setOfflineReady(false)
    }, 7000)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <aside className="pwa-banner update" role="status">
        <Download />
        <div><strong>新しいバージョンがあります</strong><span>端末内データを残したまま更新します。</span></div>
        <button type="button" onClick={() => updateServiceWorker(true)}>更新</button>
        <button className="dismiss" type="button" aria-label="閉じる" onClick={() => setNeedRefresh(false)}><X /></button>
      </aside>
    )
  }

  if (!online && !offlineDismissed) {
    return (
      <aside className="pwa-banner offline" role="status">
        <WifiOff />
        <div><strong>オフラインで使用中</strong><span>記録はこのiPhoneに保存されます。</span></div>
        <button className="dismiss" type="button" aria-label="オフライン通知を閉じる" onClick={() => setOfflineDismissed(true)}><X /></button>
      </aside>
    )
  }

  if (showReady) {
    return <aside className="pwa-banner ready" role="status"><Check /><div><strong>オフライン利用の準備ができました</strong><span>次回から通信なしでも起動できます。</span></div></aside>
  }

  return null
}

