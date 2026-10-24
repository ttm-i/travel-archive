import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { photoMotionDirection, SpotEditScreen } from './Phase3Screens'

describe('photo viewer motion', () => {
  it('matches the animation direction to the photo navigation direction', () => {
    expect(photoMotionDirection(1, 2)).toBe('next')
    expect(photoMotionDirection(2, 1)).toBe('previous')
    expect(photoMotionDirection(1, 1)).toBe('none')
  })
})

describe('spot editing', () => {
  beforeEach(async () => {
    cleanup()
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }))
    const now = new Date()
    await db.trips.bulkAdd([
      { id: 'older-trip', name: '以前の旅行', startDate: '2025-01-01', endDate: '2025-01-02', createdAt: now, updatedAt: now },
      { id: 'newer-trip', name: '最近の旅行', startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now },
    ])
    await db.spots.add({ id: 'spot', name: '共有スポット', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, prefectureOverridden: false, representativeImageId: 'older-image', createdAt: now, updatedAt: now })
    await db.visits.bulkAdd([
      { id: 'older-visit', tripId: 'older-trip', spotId: 'spot', coverImageId: 'older-image', createdAt: now, updatedAt: now },
      { id: 'newer-visit', tripId: 'newer-trip', spotId: 'spot', coverImageId: 'newer-image', createdAt: now, updatedAt: now },
    ])
    await db.images.bulkAdd([
      { id: 'older-image', visitId: 'older-visit', imageBlob: new Blob(['older']), thumbnailBlob: new Blob(['older-thumb']), mimeType: 'image/jpeg', width: 100, height: 80, sortOrder: 0, createdAt: now },
      { id: 'newer-image', visitId: 'newer-visit', imageBlob: new Blob(['newer']), thumbnailBlob: new Blob(['newer-thumb']), mimeType: 'image/jpeg', width: 100, height: 80, sortOrder: 0, createdAt: now },
    ])
  })

  afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); db.close(); await deleteDatabase(DATABASE_NAME) })

  it('preselects the trip used to open the spot detail', async () => {
    render(<SpotEditScreen spotId="spot" contextTripId="older-trip" back={() => undefined} saved={() => undefined} />)
    const select = await screen.findByLabelText('写真を表示・追加する旅行') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('older-visit'))
    expect(screen.getByText('スポット詳細を開いた旅行を選択しています')).toBeInTheDocument()
  })

  it('uses the newest related trip when there is no trip context', async () => {
    render(<SpotEditScreen spotId="spot" back={() => undefined} saved={() => undefined} />)
    const select = await screen.findByLabelText('写真を表示・追加する旅行') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('newer-visit'))
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
