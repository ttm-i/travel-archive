import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { SavedTripDetail } from './Phase2Screens'

describe('trip spot reordering', () => {
  beforeEach(async () => {
    cleanup()
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const now = new Date()
    await db.trips.add({ id: 'trip', name: '並び替える旅行', startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now })
    await db.spots.bulkAdd([
      { id: 'first-spot', name: '最初', latitude: 35, longitude: 135, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
      { id: 'second-spot', name: '二番目', latitude: 35.1, longitude: 135.1, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
    ])
    await db.visits.bulkAdd([
      { id: 'first-visit', tripId: 'trip', spotId: 'first-spot', spotOrder: 0, createdAt: now, updatedAt: now },
      { id: 'second-visit', tripId: 'trip', spotId: 'second-spot', spotOrder: 1, createdAt: now, updatedAt: now },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    db.close()
    await deleteDatabase(DATABASE_NAME)
  })

  it('shows controls only in reorder mode and saves the confirmed order', async () => {
    render(<SavedTripDetail id="trip" back={vi.fn()} edit={vi.fn()} remove={vi.fn()} addSpot={vi.fn()} openSpot={vi.fn()} />)
    const reorder = await screen.findByRole('button', { name: '並び替え' })
    expect(screen.queryByRole('button', { name: '二番目を上へ' })).not.toBeInTheDocument()

    fireEvent.click(reorder)
    fireEvent.click(screen.getByRole('button', { name: '二番目を上へ' }))
    fireEvent.click(screen.getByRole('button', { name: '完了' }))

    await waitFor(async () => {
      expect((await db.visits.get('second-visit'))?.spotOrder).toBe(0)
      expect((await db.visits.get('first-visit'))?.spotOrder).toBe(1)
    })
    expect(await screen.findByRole('button', { name: '並び替え' })).toBeInTheDocument()
  })
})

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
