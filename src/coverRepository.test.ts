import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CROP, loadTripCoverDraft, resolveTripCover, saveTripCover } from './coverRepository'
import { DATABASE_NAME, db, initializeDatabase } from './db'
import type { ProcessedImage } from './imageProcessing'

const processed = (name: string): ProcessedImage => ({ imageBlob: new Blob([`full-${name}`], { type: 'image/jpeg' }), thumbnailBlob: new Blob([`thumb-${name}`], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 1200, height: 800, sourceName: `${name}.jpg` })

beforeEach(async () => { db.close(); await removeDatabase(DATABASE_NAME); await initializeDatabase() })
afterEach(async () => { db.close(); await removeDatabase(DATABASE_NAME) })

describe('trip cover storage', () => {
  it('stores a custom cover once with separate list and hero crops', async () => {
    const now = new Date()
    await db.trips.add({ id: 't1', name: '旅', startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now })
    await saveTripCover('t1', { kind: 'new', processed: processed('cover'), listCrop: { x: 20, y: 30, zoom: 1.4 }, heroCrop: { x: 70, y: 60, zoom: 1.2 } })
    const trip = await db.trips.get('t1')
    expect(trip?.coverAssetId).toBeTruthy()
    expect(trip?.coverListCrop).toEqual({ x: 20, y: 30, zoom: 1.4 })
    expect(trip?.coverHeroCrop).toEqual({ x: 70, y: 60, zoom: 1.2 })
    expect(await db.coverAssets.count()).toBe(1)
    expect((await resolveTripCover(trip!))?.explicit).toBe(true)
  })

  it('removes a custom asset when returning to the default cover', async () => {
    const now = new Date()
    await db.trips.add({ id: 't1', name: '旅', startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now })
    await saveTripCover('t1', { kind: 'new', processed: processed('cover'), listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
    await saveTripCover('t1', { kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
    expect(await db.coverAssets.count()).toBe(0)
    expect((await loadTripCoverDraft('t1')).kind).toBe('default')
  })
})

function removeDatabase(name: string) { return new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve() }) }
