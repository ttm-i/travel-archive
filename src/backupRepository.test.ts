import 'fake-indexeddb/auto'
// @ts-expect-error Node types are intentionally not part of the browser application build.
import { Blob as NodeBlob } from 'node:buffer'
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, inspectBackup, markBackupSaved, restoreBackup } from './backupRepository'
import { DATABASE_NAME, db, initializeDatabase } from './db'

beforeEach(async () => { vi.stubGlobal('Blob', NodeBlob); db.close(); await removeDatabase(DATABASE_NAME); await initializeDatabase() })
afterEach(async () => { vi.unstubAllGlobals(); db.close(); await removeDatabase(DATABASE_NAME) })

describe('complete backup and restore', () => {
  it('restores records and photo blobs from a validated zip', async () => {
    const now = new Date('2026-10-23T00:00:00Z')
    await db.trips.add({ id: 't1', name: '旅', startDate: '2026-10-01', endDate: '2026-10-02', createdAt: now, updatedAt: now })
    await db.spots.add({ id: 's1', name: '場所', latitude: 35, longitude: 139, effectivePrefectureCode: 13, prefectureOverridden: false, representativeImageId: 'i1', createdAt: now, updatedAt: now })
    await db.visits.add({ id: 'v1', tripId: 't1', spotId: 's1', coverImageId: 'i1', createdAt: now, updatedAt: now })
    await db.images.add({ id: 'i1', visitId: 'v1', imageBlob: new Blob(['photo'], { type: 'image/jpeg' }), thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 100, height: 80, sortOrder: 0, createdAt: now })
    await db.coverAssets.add({ id: 'c1', ownerType: 'trip', ownerId: 't1', imageBlob: new Blob(['cover'], { type: 'image/jpeg' }), thumbnailBlob: new Blob(['cover-thumb'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 200, height: 100, createdAt: now })
    await db.trips.update('t1', { coverAssetId: 'c1' })
    await db.prefectureCovers.put({ prefectureCode: 13, imageId: 'i1', listCrop: { x: 40, y: 50, zoom: 1.2 }, heroCrop: { x: 60, y: 45, zoom: 1.5 }, updatedAt: now })
    await db.metadata.put({ key: 'mapPinMinZoom', value: 4.6, updatedAt: now })
    const backup = await createBackup()
    expect(await db.metadata.get('lastBackupSavedAt')).toBeUndefined()
    await markBackupSaved(backup.manifest.createdAt)
    expect((await db.metadata.get('lastBackupSavedAt'))?.value).toBe(backup.manifest.createdAt)
    await db.trips.clear(); await db.spots.clear(); await db.visits.clear(); await db.images.clear(); await db.coverAssets.clear(); await db.prefectureCovers.clear()
    await restoreBackup(await inspectBackup(backup.blob))
    expect((await db.trips.get('t1'))?.name).toBe('旅')
    expect(await (await db.images.get('i1'))?.imageBlob.text()).toBe('photo')
    expect(await (await db.coverAssets.get('c1'))?.imageBlob.text()).toBe('cover')
    expect((await db.prefectureCovers.get(13))?.heroCrop.zoom).toBe(1.5)
    expect((await db.metadata.get('mapPinMinZoom'))?.value).toBe(4.6)
  })

  it('rejects a non-backup without changing current data', async () => {
    await db.trips.add({ id: 'keep', name: '残す', startDate: '2026-01-01', endDate: '2026-01-01', createdAt: new Date(), updatedAt: new Date() })
    await expect(inspectBackup(new Blob(['not a zip']))).rejects.toBeTruthy()
    expect((await db.trips.get('keep'))?.name).toBe('残す')
  })

  it('accepts and restores the previous format without cover assets', async () => {
    const createdAt = '2026-10-22T00:00:00.000Z'
    const trip = { id: 'legacy', name: '以前の旅', startDate: '2026-01-01', endDate: '2026-01-01', createdAt, updatedAt: createdAt }
    const writer = new ZipWriter(new Uint8ArrayWriter())
    await writer.add('manifest.json', new TextReader(JSON.stringify({ app: 'Travel Archive', formatVersion: 1, databaseVersion: 1, createdAt, counts: { trips: 1, spots: 0, visits: 0, images: 0 } })))
    await writer.add('data.json', new TextReader(JSON.stringify({ trips: [trip], companionCategories: [], tripCompanionCategories: [], tripPrefectures: [], spots: [], visits: [], images: [], spotCategories: [], metadata: [] })))
    const legacy = new Blob([await writer.close()], { type: 'application/zip' })
    await restoreBackup(await inspectBackup(legacy))
    expect((await db.trips.get('legacy'))?.name).toBe('以前の旅')
    expect(await db.coverAssets.count()).toBe(0)
  })

  it('accepts a version 2 backup without prefecture cover settings', async () => {
    const createdAt = '2026-10-23T00:00:00.000Z'
    const writer = new ZipWriter(new Uint8ArrayWriter())
    await writer.add('manifest.json', new TextReader(JSON.stringify({ app: 'Travel Archive', formatVersion: 2, databaseVersion: 2, createdAt, counts: { trips: 0, spots: 0, visits: 0, images: 0, coverAssets: 0 } })))
    await writer.add('data.json', new TextReader(JSON.stringify({ trips: [], companionCategories: [], tripCompanionCategories: [], tripPrefectures: [], spots: [], visits: [], images: [], coverAssets: [], spotCategories: [], metadata: [] })))
    const previous = new Blob([await writer.close()], { type: 'application/zip' })
    await restoreBackup(await inspectBackup(previous))
    expect(await db.prefectureCovers.count()).toBe(0)
  })

  it('creates a filtered backup and restores it without deleting unrelated trips', async () => {
    const now = new Date('2026-10-23T00:00:00Z')
    await db.companionCategories.put({ id: 'family', name: '家族', sortOrder: 20, createdAt: now, updatedAt: now })
    await db.companionCategories.put({ id: 'friends', name: '友人', sortOrder: 21, createdAt: now, updatedAt: now })
    await db.trips.bulkAdd([
      { id: 'family-trip', name: '家族旅行', startDate: '2025-05-01', endDate: '2025-05-03', createdAt: now, updatedAt: now },
      { id: 'friend-trip', name: '友人旅行', startDate: '2026-06-01', endDate: '2026-06-02', createdAt: now, updatedAt: now },
    ])
    await db.tripCompanionCategories.bulkAdd([
      { id: 'family-link', tripId: 'family-trip', categoryId: 'family' },
      { id: 'friend-link', tripId: 'friend-trip', categoryId: 'friends' },
    ])
    await db.spots.add({ id: 'shared-spot', name: '共通スポット', latitude: 35, longitude: 139, effectivePrefectureCode: 13, prefectureOverridden: false, representativeImageId: 'family-image', createdAt: now, updatedAt: now })
    await db.visits.bulkAdd([
      { id: 'family-visit', tripId: 'family-trip', spotId: 'shared-spot', coverImageId: 'family-image', photoOrder: ['family-image'], createdAt: now, updatedAt: now },
      { id: 'friend-visit', tripId: 'friend-trip', spotId: 'shared-spot', coverImageId: 'friend-image', photoOrder: ['friend-image'], createdAt: now, updatedAt: now },
    ])
    await db.images.bulkAdd([
      { id: 'family-image', visitId: 'family-visit', imageBlob: new Blob(['family'], { type: 'image/jpeg' }), thumbnailBlob: new Blob(['family-thumb'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 100, height: 80, sortOrder: 0, createdAt: now },
      { id: 'friend-image', visitId: 'friend-visit', imageBlob: new Blob(['friend'], { type: 'image/jpeg' }), thumbnailBlob: new Blob(['friend-thumb'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', width: 100, height: 80, sortOrder: 0, createdAt: now },
    ])

    const backup = await createBackup(undefined, { type: 'filtered', filter: { period: 'custom', startDate: '2025-01-01', endDate: '2025-12-31', companionCategoryIds: ['family'] } })
    expect(backup.manifest.scope?.type).toBe('filtered')
    expect(backup.manifest.counts).toMatchObject({ trips: 1, spots: 1, visits: 1, images: 1 })
    const prepared = await inspectBackup(backup.blob)
    expect(prepared.data.trips).toHaveLength(1)
    expect(prepared.data.images[0].id).toBe('family-image')

    await db.trips.delete('family-trip'); await db.visits.delete('family-visit'); await db.images.delete('family-image')
    await db.metadata.put({ key: 'keep-setting', value: 'unchanged', updatedAt: now })
    await restoreBackup(prepared)

    expect(await db.trips.count()).toBe(2)
    expect(await db.spots.count()).toBe(1)
    expect(await db.visits.count()).toBe(2)
    expect(await db.images.count()).toBe(2)
    expect((await db.trips.get('family-trip'))?.name).toBe('家族旅行')
    expect((await db.trips.get('friend-trip'))?.name).toBe('友人旅行')
    expect((await db.metadata.get('keep-setting'))?.value).toBe('unchanged')
  })
})

function removeDatabase(name: string) { return new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve() }) }
