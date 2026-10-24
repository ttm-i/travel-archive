import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CROP } from './coverRepository'
import { DATABASE_NAME, db, initializeDatabase } from './db'
import { loadPrefectureCoverDraft, resolvePrefectureCover, savePrefectureCover } from './prefectureCoverRepository'

const now = new Date('2026-10-23T00:00:00Z')

beforeEach(async () => {
  db.close()
  await Dexie.delete(DATABASE_NAME)
  await initializeDatabase()
  await db.trips.add({ id: 'trip', name: '神奈川の旅', startDate: '2026-10-01', endDate: '2026-10-01', createdAt: now, updatedAt: now })
  await db.spots.add({ id: 'spot', name: '海辺', latitude: 35.3, longitude: 139.5, effectivePrefectureCode: 14, prefectureOverridden: false, representativeImageId: 'image', createdAt: now, updatedAt: now })
  await db.visits.add({ id: 'visit', tripId: 'trip', spotId: 'spot', createdAt: now, updatedAt: now })
  await db.images.add({ id: 'image', visitId: 'visit', imageBlob: new Blob(['image'], { type: 'image/jpeg' }), thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 200, height: 100, sortOrder: 0, createdAt: now })
})

afterEach(async () => { db.close(); await Dexie.delete(DATABASE_NAME) })

describe('prefecture covers', () => {
  it('uses one registered image with independent list and detail crops', async () => {
    const listCrop = { x: 30, y: 45, zoom: 1.2 }
    const heroCrop = { x: 70, y: 55, zoom: 1.8 }
    await savePrefectureCover(14, { kind: 'registered', imageId: 'image', listCrop, heroCrop })
    const resolved = await resolvePrefectureCover(14)
    expect(resolved?.listCrop).toEqual(listCrop)
    expect(resolved?.heroCrop).toEqual(heroCrop)
    expect(resolved?.imageBlob).toBeDefined()
  })

  it('stores a camera-roll image once and resets to the default', async () => {
    await savePrefectureCover(14, { kind: 'new', processed: { imageBlob: new Blob(['cover']), thumbnailBlob: new Blob(['cover-thumb']), mimeType: 'image/jpeg', width: 300, height: 200, sourceName: 'cover.jpg' }, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
    expect(await db.coverAssets.where('[ownerType+ownerId]').equals(['prefecture', '14']).count()).toBe(1)
    expect((await loadPrefectureCoverDraft(14)).kind).toBe('asset')
    await savePrefectureCover(14, { kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
    expect(await db.prefectureCovers.get(14)).toBeUndefined()
    expect(await db.coverAssets.where('[ownerType+ownerId]').equals(['prefecture', '14']).count()).toBe(0)
  })
})
