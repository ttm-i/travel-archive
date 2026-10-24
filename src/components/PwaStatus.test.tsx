import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PwaStatus } from './PwaStatus'

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('PwaStatus', () => {
  beforeEach(() => setOnline(false))
  afterEach(cleanup)

  it('allows the offline notification to be dismissed', () => {
    render(<PwaStatus />)

    expect(screen.getByText('オフラインで使用中')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'オフライン通知を閉じる' }))

    expect(screen.queryByText('オフラインで使用中')).not.toBeInTheDocument()
  })

  it('shows the notification again after the connection has recovered', () => {
    render(<PwaStatus />)
    fireEvent.click(screen.getByRole('button', { name: 'オフライン通知を閉じる' }))

    setOnline(true)
    fireEvent(window, new Event('online'))
    setOnline(false)
    fireEvent(window, new Event('offline'))

    expect(screen.getByText('オフラインで使用中')).toBeInTheDocument()
  })
})
