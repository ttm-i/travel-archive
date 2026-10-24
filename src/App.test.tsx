import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { db } from './db'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'startViewTransition')
  delete document.documentElement.dataset.routeMotion
})

describe('trip navigation', () => {
  it('opens the trip editor with one date-range picker', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '旅行' }))
    expect(screen.getByRole('heading', { name: '旅行' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'メインメニュー' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '旅行を追加' }))
    expect(screen.getByText('どんな旅でしたか？')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'メインメニュー' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '旅行期間を選択' }))
    expect(screen.getByRole('dialog', { name: '旅行期間を選択' })).toBeInTheDocument()
    const today = new Date()
    const todayLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`
    const todayButton = screen.getByRole('button', { name: todayLabel })
    fireEvent.click(todayButton)
    fireEvent.click(todayButton)
    fireEvent.click(screen.getByRole('button', { name: /この期間に決定/ }))
    expect(screen.queryByRole('dialog', { name: '旅行期間を選択' })).not.toBeInTheDocument()
    expect(screen.queryByText('AFTER SAVING')).not.toBeInTheDocument()
    expect(screen.queryByText('2つの座標をまとめて貼り付ける')).not.toBeInTheDocument()
  })

  it('keeps the tabs on detail screens and uses the active tab as a shortcut to its root', async () => {
    const now = new Date()
    await db.trips.put({ id: 'navigation-test-trip', name: 'ナビゲーション確認旅行', startDate: '2026-10-01', endDate: '2026-10-02', createdAt: now, updatedAt: now })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '旅行' }))
    fireEvent.click(await screen.findByRole('button', { name: /ナビゲーション確認旅行/ }))

    expect(screen.getByText('旅行の記録')).toBeInTheDocument()
    expect(document.querySelector('[data-route-motion="forward"]')).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'メインメニュー' })
    expect(navigation).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '旅行', current: 'page' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('heading', { name: '旅行' })).toBeInTheDocument()
    expect(document.querySelector('[data-route-motion="back"]')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /ナビゲーション確認旅行/ }))
    fireEvent.click(screen.getByRole('button', { name: '旅行', current: 'page' }))
    expect(await screen.findByRole('heading', { name: '旅行' })).toBeInTheDocument()
    expect(document.querySelector('[data-route-motion="tab"]')).toBeInTheDocument()
    expect(screen.queryByText('旅行の記録')).not.toBeInTheDocument()
    await db.trips.delete('navigation-test-trip')
  })

  it('uses an in-page tab animation instead of a full-page view-transition snapshot', async () => {
    const startViewTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '旅行' }))

    expect(await screen.findByRole('heading', { name: '旅行' })).toBeInTheDocument()
    expect(document.querySelector('[data-route-motion="tab"]')).toBeInTheDocument()
    expect(startViewTransition).not.toHaveBeenCalled()
  })
})

describe('地図表示設定', () => {
  it('スライダーでピンを表示する倍率を端末内へ保存する', async () => {
    await db.metadata.delete('mapPinMinZoom')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    const slider = await screen.findByRole('slider', { name: 'ピンを表示する倍率' })
    fireEvent.change(slider, { target: { value: '8.4' } })

    await waitFor(() => expect(slider).toHaveValue('8.4'))
    await waitFor(async () => expect((await db.metadata.get('mapPinMinZoom'))?.value).toBe(8.4))
    await db.metadata.delete('mapPinMinZoom')
  })
})

