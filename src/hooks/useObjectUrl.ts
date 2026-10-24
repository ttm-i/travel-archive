import { useLayoutEffect, useState } from 'react'

type CachedUrl = { url: string; references: number; releaseTimer?: ReturnType<typeof setTimeout> }

const cachedUrls = new Map<string, CachedUrl>()
const RELEASE_DELAY_MS = 5_000

function acquireCachedUrl(key: string, blob: Blob) {
  const cached = cachedUrls.get(key)
  if (cached) {
    if (cached.releaseTimer) clearTimeout(cached.releaseTimer)
    cached.releaseTimer = undefined
    cached.references += 1
    return cached.url
  }
  const url = URL.createObjectURL(blob)
  cachedUrls.set(key, { url, references: 1 })
  return url
}

function releaseCachedUrl(key: string) {
  const cached = cachedUrls.get(key)
  if (!cached) return
  cached.references = Math.max(0, cached.references - 1)
  if (cached.references) return
  cached.releaseTimer = setTimeout(() => {
    const latest = cachedUrls.get(key)
    if (!latest || latest.references) return
    URL.revokeObjectURL(latest.url)
    cachedUrls.delete(key)
  }, RELEASE_DELAY_MS)
}

export function useObjectUrl(blob: Blob | undefined, cacheKey?: string) {
  const [url, setUrl] = useState('')
  const identity = cacheKey ?? blob
  useLayoutEffect(() => {
    if (!blob) { setUrl(''); return }
    if (cacheKey) {
      setUrl(acquireCachedUrl(cacheKey, blob))
      return () => releaseCachedUrl(cacheKey)
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [identity])
  return blob ? url : ''
}
