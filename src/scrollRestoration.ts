const RESTORE_TIMEOUT_MS = 2500

export function canRestoreScroll(targetTop: number, scrollHeight: number, viewportHeight: number) {
  return Math.max(0, scrollHeight - viewportHeight) >= targetTop - 1
}

export function restoreScrollAfterRender(targetTop: number) {
  const top = Math.max(0, targetTop)
  if (top === 0) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    return () => undefined
  }

  let finished = false
  let frame = 0
  let timeout = 0
  const documentHeight = () => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
  const stop = () => {
    if (finished) return
    finished = true
    if (frame) window.cancelAnimationFrame(frame)
    if (timeout) window.clearTimeout(timeout)
    resizeObserver?.disconnect()
    mutationObserver.disconnect()
    window.removeEventListener('touchstart', cancelForInteraction)
    window.removeEventListener('pointerdown', cancelForInteraction)
    window.removeEventListener('keydown', cancelForInteraction)
  }
  const cancelForInteraction = () => stop()
  const restore = (force = false) => {
    if (finished) return
    const height = documentHeight()
    const maximumTop = Math.max(0, height - window.innerHeight)
    if (!force && !canRestoreScroll(top, height, window.innerHeight)) return
    window.scrollTo({ top: Math.min(top, maximumTop), left: 0, behavior: 'auto' })
    stop()
  }

  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => restore())
  resizeObserver?.observe(document.documentElement)
  if (document.body) resizeObserver?.observe(document.body)
  const mutationObserver = new MutationObserver(() => restore())
  mutationObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  window.addEventListener('touchstart', cancelForInteraction, { passive: true })
  window.addEventListener('pointerdown', cancelForInteraction, { passive: true })
  window.addEventListener('keydown', cancelForInteraction)
  frame = window.requestAnimationFrame(() => restore())
  timeout = window.setTimeout(() => restore(true), RESTORE_TIMEOUT_MS)
  return stop
}
