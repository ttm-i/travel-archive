import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, DATABASE_VERSION, db, initializeDatabase, makeId, recordAppLog } from './db'

describe('Travel Archive database', () => {
  beforeEach(async () => {
    db.close()
    await DexieDelete(DATABASE_NAME)
  })

  afterEach(async () => {
    db.close()
    await DexieDelete(DATABASE_NAME)
  })

  it('initializes metadata without adding user records', async () => {
    await initializeDatabase()
    expect((await db.metadata.get('databaseVersion'))?.value).toBe(DATABASE_VERSION)
    expect(await db.trips.count()).toBe(0)
    expect(await db.spots.count()).toBe(0)
  })

  it('stores relationships without duplicating the spot', async () => {
    await initializeDatabase()
    const now = new Date()
    const spotId = makeId()
    await db.spots.add({
      id: spotId,
      name: '南禅寺 水路閣',
      latitude: 35.01127,
      longitude: 135.79315,
      detectedPrefectureCode: 26,
      effectivePrefectureCode: 26,
      prefectureOverridden: false,
      createdAt: now,
      updatedAt: now,
    })
    for (const tripId of ['trip-a', 'trip-b']) {
      await db.trips.add({ id: tripId, name: tripId, startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now })
      await db.visits.add({ id: makeId(), tripId, spotId, createdAt: now, updatedAt: now })
    }
    expect(await db.spots.count()).toBe(1)
    expect(await db.visits.where('spotId').equals(spotId).count()).toBe(2)
  })

  it('provides the cover image store after upgrading the database', async () => {
    await initializeDatabase()
    expect(db.coverAssets).toBeDefined()
    expect(await db.coverAssets.count()).toBe(0)
    expect((await db.metadata.get('databaseVersion'))?.value).toBe(DATABASE_VERSION)
    expect(await db.prefectureCovers.count()).toBe(0)
  })

  it('keeps existing trips when upgrading a version 1 database', async () => {
    const legacy = new Dexie(DATABASE_NAME)
    legacy.version(1).stores({ trips: 'id, startDate, endDate, updatedAt, deletedAt' })
    await legacy.open()
    const now = new Date()
    await legacy.table('trips').add({ id: 'legacy-trip', name: '残す旅行', startDate: '2026-01-01', endDate: '2026-01-02', createdAt: now, updatedAt: now })
    legacy.close()
    await initializeDatabase()
    expect((await db.trips.get('legacy-trip'))?.name).toBe('残す旅行')
    expect(await db.coverAssets.count()).toBe(0)
  })

  it('moves legacy photo order onto the visit without rewriting image blobs', async () => {
    const legacy = new Dexie(DATABASE_NAME)
    legacy.version(3).stores({
      visits: 'id, tripId, spotId, [tripId+spotId], updatedAt, deletedAt',
      images: 'id, visitId, sortOrder, createdAt',
    })
    await legacy.open()
    const now = new Date()
    await legacy.table('visits').add({ id: 'legacy-visit', tripId: 'trip', spotId: 'spot', createdAt: now, updatedAt: now })
    await legacy.table('images').bulkAdd([
      { id: 'legacy-later', visitId: 'legacy-visit', sortOrder: 1, imageBlob: new Blob(['later']), thumbnailBlob: new Blob(['later-thumb']), mimeType: 'image/jpeg', width: 100, height: 100, createdAt: now },
      { id: 'legacy-first', visitId: 'legacy-visit', sortOrder: 0, imageBlob: new Blob(['first']), thumbnailBlob: new Blob(['first-thumb']), mimeType: 'image/jpeg', width: 100, height: 100, createdAt: now },
    ])
    legacy.close()
    await initializeDatabase()
    expect((await db.visits.get('legacy-visit'))?.photoOrder).toEqual(['legacy-first', 'legacy-later'])
    expect((await db.images.get('legacy-first'))?.imageBlob).toBeTruthy()
    expect((await db.images.get('legacy-later'))?.imageBlob).toBeTruthy()
  })

  it('assigns stable trip spot order when upgrading a version 4 database', async () => {
    const legacy = new Dexie(DATABASE_NAME)
    legacy.version(4).stores({ visits: 'id, tripId, spotId, [tripId+spotId], updatedAt, deletedAt' })
    await legacy.open()
    await legacy.table('visits').bulkAdd([
      { id: 'later', tripId: 'trip', spotId: 'spot-b', createdAt: new Date('2026-01-02'), updatedAt: new Date('2026-01-02') },
      { id: 'earlier', tripId: 'trip', spotId: 'spot-a', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    ])
    legacy.close()
    await initializeDatabase()
    expect((await db.visits.get('earlier'))?.spotOrder).toBe(0)
    expect((await db.visits.get('later'))?.spotOrder).toBe(1)
  })

  it('keeps a bounded local app log', async () => {
    await initializeDatabase()
    await recordAppLog('info', 'database ready')
    expect((await db.logs.toArray())[0]?.message).toBe('database ready')
  })
})

function DexieDelete(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

