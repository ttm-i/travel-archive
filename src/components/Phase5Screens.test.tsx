import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { clearNavigationSnapshots } from '../navigationSnapshots'
import { PrefectureDetail, SavedPrefecturesHome } from './Phase5Screens'

describe('phase 5 prefecture browsing', () => {
  beforeEach(async () => {
    cleanup()
    clearNavigationSnapshots()
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const now = new Date()
    await db.spots.bulkAdd([
      { id: 'spot-kyoto-1', name: '南禅寺', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
      { id: 'spot-kyoto-2', name: '喫茶店', latitude: 35.003, longitude: 135.769, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
      { id: 'spot-shiga', name: '琵琶湖', latitude: 35.25, longitude: 136.08, effectivePrefectureCode: 25, prefectureOverridden: false, createdAt: now, updatedAt: now },
    ])
    await db.trips.add({ id: 'trip', name: '京都旅行', startDate: '2026-04-01', endDate: '2026-04-02', createdAt: now, updatedAt: now })
    await db.visits.bulkAdd([
      { id: 'visit-1', tripId: 'trip', spotId: 'spot-kyoto-1', createdAt: now, updatedAt: now },
      { id: 'visit-2', tripId: 'trip', spotId: 'spot-kyoto-2', createdAt: now, updatedAt: now },
    ])
    await db.images.bulkAdd([
      { id: 'image-1', visitId: 'visit-1', imageBlob: new Blob(['one-full']), thumbnailBlob: new Blob(['one-thumb']), mimeType: 'image/jpeg', width: 1200, height: 900, sortOrder: 0, createdAt: now },
      { id: 'image-2', visitId: 'visit-1', imageBlob: new Blob(['two-full']), thumbnailBlob: new Blob(['two-thumb']), mimeType: 'image/jpeg', width: 1200, height: 900, sortOrder: 1, createdAt: now },
      { id: 'image-3', visitId: 'visit-2', imageBlob: new Blob(['three-full']), thumbnailBlob: new Blob(['three-thumb']), mimeType: 'image/jpeg', width: 1200, height: 900, sortOrder: 0, createdAt: now },
    ])
  })

  afterEach(async () => {
    cleanup()
    clearNavigationSnapshots()
    vi.restoreAllMocks()
    db.close()
    await deleteDatabase(DATABASE_NAME)
  })

  it('groups saved spots by prefecture and opens the selected prefecture', async () => {
    const openPrefecture = vi.fn()
    render(<SavedPrefecturesHome openPrefecture={openPrefecture} />)
    await waitFor(() => expect(screen.getByText('2スポット')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /京都府/ }))
    await waitFor(() => expect(openPrefecture).toHaveBeenCalledWith(26))
  })

  it('lists only spots in the selected prefecture', async () => {
    const openSpot = vi.fn()
    render(<PrefectureDetail code={26} back={() => undefined} openSpot={openSpot} />)
    await waitFor(() => expect(screen.getByText('南禅寺')).toBeInTheDocument())
    expect(screen.getByText('喫茶店')).toBeInTheDocument()
    expect(screen.queryByText('琵琶湖')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /南禅寺/ }))
    await waitFor(() => expect(openSpot).toHaveBeenCalledWith('spot-kyoto-1'))
  })

  it('shows every prefecture photo grouped by spot', async () => {
    render(<PrefectureDetail code={26} mode="photos" changeMode={vi.fn()} back={vi.fn()} openSpot={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: '京都府の写真' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /の写真を全画面表示/ })).toHaveLength(3))
    expect(screen.getAllByText('京都旅行')).toHaveLength(3)
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
