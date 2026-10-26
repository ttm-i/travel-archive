import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

const EDGE_START_WIDTH = 24
const DIRECTION_LOCK_DISTANCE = 9
const COMPLETE_RATIO = 0.3
const FAST_SWIPE_DISTANCE = 56
const FAST_SWIPE_VELOCITY = 0.55
const SETTLE_DURATION = 180

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  claimed: boolean
}

type Phase = 'idle' | 'dragging' | 'cancelling' | 'completing'
type StandaloneNavigator = Navigator & { standalone?: boolean }

export function isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (window.navigator as StandaloneNavigator).standalone === true
}

export function EdgeSwipeBack({ children, previous, previousLabel, previousScrollY = 0, back }: { children: ReactNode; previous?: ReactNode; previousLabel: string; previousScrollY?: number; back: () => void }) {
  const enabled = isStandalonePwa()
  const gesture = useRef<Gesture | undefined>(undefined)
  const preview = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>('idle')
  const [distance, setDistance] = useState(0)
  const [surfaceWidth, setSurfaceWidth] = useState(() => window.innerWidth)
  const settleDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : SETTLE_DURATION

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
  }, [])

  useLayoutEffect(() => {
    if (!enabled || !preview.current) return
    const restore = () => { if (preview.current) preview.current.scrollTop = previousScrollY }
    restore()
    const frame = window.requestAnimationFrame(restore)
    const observer = new MutationObserver(restore)
    observer.observe(preview.current, { childList: true, subtree: true })
    const stop = window.setTimeout(() => observer.disconnect(), 1200)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(stop)
      observer.disconnect()
    }
  }, [enabled, previousScrollY, previous])

  if (!enabled) return children

  const resetAfter = (nextPhase: Phase, action?: () => void) => {
    setPhase(nextPhase)
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      gesture.current = undefined
      setPhase('idle')
      action?.()
    }, settleDuration)
  }

  const cancel = () => {
    if (!gesture.current) return
    setDistance(0)
    resetAfter('cancelling')
  }

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const leftEdgeDistance = event.clientX - event.currentTarget.getBoundingClientRect().left
    if (phase !== 'idle' || event.pointerType !== 'touch' || !event.isPrimary || leftEdgeDistance < 0 || leftEdgeDistance > EDGE_START_WIDTH) return
    const target = event.target instanceof Element ? event.target : undefined
    if (target?.closest('[role="dialog"], .offline-map-shell, input, textarea, select')) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      claimed: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const deltaX = Math.max(0, event.clientX - active.startX)
    const deltaY = Math.abs(event.clientY - active.startY)
    if (!active.claimed) {
      if (deltaY > DIRECTION_LOCK_DISTANCE && deltaY > deltaX) {
        gesture.current = undefined
        return
      }
      if (deltaX < DIRECTION_LOCK_DISTANCE || deltaX <= deltaY * 1.15) return
      active.claimed = true
      setPhase('dragging')
    }
    event.preventDefault()
    const width = event.currentTarget.getBoundingClientRect().width || window.innerWidth
    setSurfaceWidth(width)
    setDistance(Math.min(deltaX, width))
  }

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (!active.claimed) {
      gesture.current = undefined
      return
    }
    event.preventDefault()
    const width = event.currentTarget.getBoundingClientRect().width || window.innerWidth
    const deltaX = Math.max(0, event.clientX - active.startX)
    const elapsed = Math.max(1, event.timeStamp - active.startedAt)
    const completes = deltaX >= width * COMPLETE_RATIO || (deltaX >= FAST_SWIPE_DISTANCE && deltaX / elapsed >= FAST_SWIPE_VELOCITY)
    if (!completes) {
      cancel()
      return
    }
    setDistance(width)
    resetAfter('completing', back)
  }

  const progress = Math.min(1, distance / Math.max(1, surfaceWidth))
  const style = phase === 'idle'
    ? undefined
    : ({
        '--edge-swipe-x': `${distance}px`,
        '--edge-swipe-underlay-x': `${-18 * (1 - progress)}px`,
        '--edge-swipe-shade': 0.09 * (1 - progress),
      } as CSSProperties)

  const suppressGestureClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!gesture.current?.claimed) return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className={`edge-swipe-back ${phase}`}
      data-edge-swipe-back="true"
      style={style}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={cancel}
      onClickCapture={suppressGestureClick}
    >
      <div className="edge-swipe-underlay" aria-hidden="true" inert>
        {previous
          ? <div ref={preview} className="edge-swipe-preview" data-edge-swipe-preview="true">{previous}</div>
          : <div className="edge-swipe-cue"><ArrowLeft /><span>{previousLabel}へ戻る</span></div>}
      </div>
      <div className="edge-swipe-surface">{children}</div>
    </div>
  )
}
