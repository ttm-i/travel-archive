import { afterEach, describe, expect, it, vi } from 'vitest'
import { canRestoreScroll, restoreScrollAfterRender } from './scrollRestoration'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('deferred scroll restoration', () => {
  it('waits until the restored screen is tall enough', async () => {
    let height = 900
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => height)
    vi.spyOn(document.body, 'scrollHeight', 'get').mockImplementation(() => height)
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    const stop = restoreScrollAfterRender(1200)
    await new Promise((resolve) => window.setTimeout(resolve, 5))
    expect(scrollTo).not.toHaveBeenCalled()

    height = 2400
    document.body.append(document.createElement('section'))
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1200, left: 0, behavior: 'auto' }))
    stop()
  })

  it('recognizes whether the target position is available', () => {
    expect(canRestoreScroll(1200, 2400, 800)).toBe(true)
    expect(canRestoreScroll(1200, 900, 800)).toBe(false)
  })
})
