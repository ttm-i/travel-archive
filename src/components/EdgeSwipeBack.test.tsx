import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EdgeSwipeBack } from './EdgeSwipeBack'

function standalone(value: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: value,
      media: '(display-mode: standalone)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function setWidth(element: Element, width = 390) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width, height: 844, top: 0, right: width, bottom: 844, left: 0, toJSON: () => ({}) })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EdgeSwipeBack', () => {
  it('is enabled only in the installed PWA', () => {
    standalone(false)
    render(<EdgeSwipeBack previousLabel="旅行" back={vi.fn()}><main>詳細</main></EdgeSwipeBack>)

    expect(screen.getByText('詳細')).toBeInTheDocument()
    expect(document.querySelector('[data-edge-swipe-back]')).not.toBeInTheDocument()
  })

  it('returns after a sufficient swipe from the left edge', async () => {
    standalone(true)
    const back = vi.fn()
    render(<EdgeSwipeBack previousLabel="旅行" back={back}><main>旅行の記録</main></EdgeSwipeBack>)
    const frame = document.querySelector('[data-edge-swipe-back]')!
    setWidth(frame)

    fireEvent.pointerDown(frame, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 100 })
    fireEvent.pointerMove(frame, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 180, clientY: 103 })
    expect(frame).toHaveClass('dragging')
    fireEvent.pointerUp(frame, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 180, clientY: 103 })

    expect(frame).toHaveClass('completing')
    await waitFor(() => expect(back).toHaveBeenCalledOnce())
  })

  it('returns to the detail when the swipe is too short', async () => {
    standalone(true)
    const back = vi.fn()
    render(<EdgeSwipeBack previousLabel="都道府県" back={back}><main>スポット</main></EdgeSwipeBack>)
    const frame = document.querySelector('[data-edge-swipe-back]')!
    setWidth(frame)

    fireEvent.pointerDown(frame, { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 100 })
    fireEvent.pointerMove(frame, { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: 46, clientY: 102 })
    fireEvent.pointerUp(frame, { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: 46, clientY: 102 })

    expect(frame).toHaveClass('cancelling')
    await waitFor(() => expect(frame).toHaveClass('idle'))
    expect(back).not.toHaveBeenCalled()
  })
})
