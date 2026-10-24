import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from './db'
import { detachVisitFromSpot, restoreDetachedVisit } from './trashRepository'

beforeEach(async () => { db.close(); await removeDatabase(DATABASE_NAME); await initializeDatabase() })
afterEach(async () => { db.close(); await removeDatabase(DATABASE_NAME) })

describe('visit-only removal', () => {
  it('detaches and restores one trip without deleting the shared spot', async () => {
    const now = new Date()
    await db.trips.bulkAdd(['t1', 't2'].map((id) => ({ id, name: id, startDate: '2026-01-01', endDate: '2026-01-01', createdAt: now, updatedAt: now })))
    await db.spots.add({ id: 's1', name: '共有スポット', latitude: 35, longitude: 139, effectivePrefectureCode: 13, prefectureOverridden: false, createdAt: now, updatedAt: now })
    await db.visits.bulkAdd(['t1', 't2'].map((tripId, index) => ({ id: `v${index + 1}`, tripId, spotId: 's1', createdAt: now, updatedAt: now })))
    await detachVisitFromSpot('v1')
    expect((await db.visits.get('v1'))?.deletedAt).toBeInstanceOf(Date)
    expect((await db.visits.get('v2'))?.deletedAt).toBeUndefined()
    expect(await db.spots.get('s1')).toBeTruthy()
    await restoreDetachedVisit('v1')
    expect((await db.visits.get('v1'))?.deletedAt).toBeUndefined()
  })

  it('moves the spot to trash when its last trip is detached', async () => {
    const now = new Date()
    await db.trips.add({ id: 't1', name: '旅', startDate: '2026-01-01', endDate: '2026-01-01', createdAt: now, updatedAt: now })
    await db.spots.add({ id: 's1', name: '場所', latitude: 35, longitude: 139, effectivePrefectureCode: 13, prefectureOverridden: false, createdAt: now, updatedAt: now })
    await db.visits.add({ id: 'v1', tripId: 't1', spotId: 's1', createdAt: now, updatedAt: now })
    expect((await detachVisitFromSpot('v1')).spotDeleted).toBe(true)
    expect((await db.spots.get('s1'))?.deletedAt).toBeInstanceOf(Date)
    await restoreDetachedVisit('v1')
    expect((await db.spots.get('s1'))?.deletedAt).toBeUndefined()
  })
})

function removeDatabase(name: string) { return new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve() }) }
