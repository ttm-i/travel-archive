import { BlobWriter, TextReader, TextWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import { filterTripsForMap, type MapFilter } from './browsingFilters'
import { DATABASE_VERSION, db } from './db'
import type { CoverAsset, TravelImage, Visit } from './types'

export const BACKUP_FORMAT_VERSION = 4
export type BackupScope = { type: 'complete' } | { type: 'filtered'; filter: MapFilter }
export type BackupManifest = { app: 'Travel Archive'; formatVersion: number; databaseVersion: number; createdAt: string; scope?: BackupScope; counts: { trips: number; spots: number; visits: number; images: number; coverAssets?: number; prefectureCovers?: number } }
type ImageRecord = Omit<TravelImage, 'imageBlob' | 'thumbnailBlob'>
type CoverAssetRecord = Omit<CoverAsset, 'imageBlob' | 'thumbnailBlob'>
type BackupData = { trips: unknown[]; companionCategories: unknown[]; tripCompanionCategories: unknown[]; tripPrefectures: unknown[]; spots: unknown[]; visits: unknown[]; images: ImageRecord[]; coverAssets: CoverAssetRecord[]; prefectureCovers: unknown[]; spotCategories: unknown[]; metadata: unknown[] }
export type PreparedRestore = { manifest: BackupManifest; data: BackupData; imageBlobs: Map<string, { imageBlob: Blob; thumbnailBlob: Blob }>; coverAssetBlobs: Map<string, { imageBlob: Blob; thumbnailBlob: Blob }> }

export const COMPLETE_BACKUP_SCOPE: BackupScope = { type: 'complete' }
export const isFilteredBackup = (manifest: BackupManifest) => manifest.scope?.type === 'filtered'

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value
const serialize = <T extends object>(rows: T[]) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, iso(value)])))
const dateKeys = new Set(['createdAt', 'updatedAt', 'deletedAt'])
const revive = (rows: unknown[]) => rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, dateKeys.has(key) && typeof value === 'string' ? new Date(value) : value])))

async function collectBackupRows(scope: BackupScope) {
  const [trips, companionCategories, tripCompanionCategories, tripPrefectures, spots, visits, images, coverAssets, prefectureCovers, spotCategories, metadata] = await Promise.all([
    db.trips.toArray(), db.companionCategories.toArray(), db.tripCompanionCategories.toArray(), db.tripPrefectures.toArray(), db.spots.toArray(), db.visits.toArray(), db.images.toArray(), db.coverAssets.toArray(), db.prefectureCovers.toArray(), db.spotCategories.toArray(), db.metadata.toArray(),
  ])
  if (scope.type === 'complete') return { trips, companionCategories, tripCompanionCategories, tripPrefectures, spots, visits, images, coverAssets, prefectureCovers, spotCategories, metadata }

  const selectedTrips = filterTripsForMap(trips, tripCompanionCategories, scope.filter)
  const tripIds = new Set(selectedTrips.map((trip) => trip.id))
  const selectedCompanionLinks = tripCompanionCategories.filter((link) => tripIds.has(link.tripId))
  const selectedPrefectureLinks = tripPrefectures.filter((link) => tripIds.has(link.tripId))
  const selectedVisits = visits.filter((visit) => tripIds.has(visit.tripId) && !visit.deletedAt)
  const visitIds = new Set(selectedVisits.map((visit) => visit.id))
  const spotIds = new Set(selectedVisits.map((visit) => visit.spotId))
  const selectedImages = images.filter((image) => visitIds.has(image.visitId))
  const imageIds = new Set(selectedImages.map((image) => image.id))
  const imagesByVisit = new Map<string, TravelImage[]>()
  for (const image of [...selectedImages].sort((a, b) => a.sortOrder - b.sortOrder)) imagesByVisit.set(image.visitId, [...(imagesByVisit.get(image.visitId) ?? []), image])
  const normalizedVisits = selectedVisits.map((visit) => {
    const visitImages = imagesByVisit.get(visit.id) ?? []
    const ordered = [...new Set([...(visit.photoOrder ?? []).filter((id) => imageIds.has(id)), ...visitImages.map((image) => image.id)])]
    return { ...visit, photoOrder: ordered, coverImageId: visit.coverImageId && imageIds.has(visit.coverImageId) ? visit.coverImageId : ordered[0] }
  })
  const firstImageBySpot = new Map<string, string>()
  for (const visit of normalizedVisits) if (!firstImageBySpot.has(visit.spotId) && visit.photoOrder?.[0]) firstImageBySpot.set(visit.spotId, visit.photoOrder[0])
  const selectedSpots = spots.filter((spot) => spotIds.has(spot.id) && !spot.deletedAt).map((spot) => ({ ...spot, representativeImageId: spot.representativeImageId && imageIds.has(spot.representativeImageId) ? spot.representativeImageId : firstImageBySpot.get(spot.id) }))
  const selectedTripRows = selectedTrips.map((trip) => ({ ...trip, coverImageId: trip.coverImageId && imageIds.has(trip.coverImageId) ? trip.coverImageId : undefined }))
  const prefectureCodes = new Set([...selectedPrefectureLinks.map((link) => link.prefectureCode), ...selectedSpots.map((spot) => spot.effectivePrefectureCode)])
  const selectedPrefectureCovers = prefectureCovers.flatMap((cover) => {
    if (!prefectureCodes.has(cover.prefectureCode)) return []
    const imageId = cover.imageId && imageIds.has(cover.imageId) ? cover.imageId : undefined
    if (!imageId && !cover.assetId) return []
    return [{ ...cover, imageId }]
  })
  const coverAssetIds = new Set([...selectedTripRows.flatMap((trip) => trip.coverAssetId ? [trip.coverAssetId] : []), ...selectedPrefectureCovers.flatMap((cover) => cover.assetId ? [cover.assetId] : [])])
  const companionCategoryIds = new Set(selectedCompanionLinks.map((link) => link.categoryId))
  const spotCategoryIds = new Set(selectedSpots.flatMap((spot) => spot.spotCategoryId ? [spot.spotCategoryId] : []))
  return {
    trips: selectedTripRows,
    companionCategories: companionCategories.filter((category) => companionCategoryIds.has(category.id)),
    tripCompanionCategories: selectedCompanionLinks,
    tripPrefectures: selectedPrefectureLinks,
    spots: selectedSpots,
    visits: normalizedVisits,
    images: selectedImages,
    coverAssets: coverAssets.filter((asset) => coverAssetIds.has(asset.id)),
    prefectureCovers: selectedPrefectureCovers,
    spotCategories: spotCategories.filter((category) => spotCategoryIds.has(category.id)),
    metadata: [],
  }
}

export async function estimateBackupBytes(scope: BackupScope = COMPLETE_BACKUP_SCOPE) {
  const { images, coverAssets } = await collectBackupRows(scope)
  return [...images, ...coverAssets].reduce((sum, image) => sum + image.imageBlob.size + image.thumbnailBlob.size, 0)
}

export async function createBackup(onProgress?: (message: string) => void, scope: BackupScope = COMPLETE_BACKUP_SCOPE) {
  onProgress?.('端末内データを確認しています…')
  const { trips, companionCategories, tripCompanionCategories, tripPrefectures, spots, visits, images, coverAssets, prefectureCovers, spotCategories, metadata } = await collectBackupRows(scope)
  if (scope.type === 'filtered' && !trips.length) throw new Error('条件に合う旅行がありません')
  const manifest: BackupManifest = { app: 'Travel Archive', formatVersion: BACKUP_FORMAT_VERSION, databaseVersion: DATABASE_VERSION, createdAt: new Date().toISOString(), scope, counts: { trips: trips.length, spots: spots.length, visits: visits.length, images: images.length, coverAssets: coverAssets.length, prefectureCovers: prefectureCovers.length } }
  const imageRecords = images.map(({ imageBlob: _image, thumbnailBlob: _thumb, ...record }) => record)
  const coverAssetRecords = coverAssets.map(({ imageBlob: _image, thumbnailBlob: _thumb, ...record }) => record)
  const data: BackupData = { trips: serialize(trips), companionCategories: serialize(companionCategories), tripCompanionCategories, tripPrefectures, spots: serialize(spots), visits: serialize(visits), images: serialize(imageRecords) as ImageRecord[], coverAssets: serialize(coverAssetRecords) as CoverAssetRecord[], prefectureCovers: serialize(prefectureCovers), spotCategories: serialize(spotCategories), metadata: serialize(metadata.filter((item) => !['lastBackupAt', 'lastBackupSavedAt', 'lastRestoreAt', 'lastPartialRestoreAt'].includes(item.key))) }
  const writer = new ZipWriter(new Uint8ArrayWriter())
  await writer.add('manifest.json', new TextReader(JSON.stringify(manifest, null, 2)))
  await writer.add('data.json', new TextReader(JSON.stringify(data)))
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]
    onProgress?.(`写真をまとめています… ${index + 1} / ${images.length}`)
    await writer.add(`images/${image.id}`, new Uint8ArrayReader(await blobBytes(image.imageBlob)))
    await writer.add(`thumbnails/${image.id}`, new Uint8ArrayReader(await blobBytes(image.thumbnailBlob)))
  }
  for (let index = 0; index < coverAssets.length; index += 1) {
    const image = coverAssets[index]
    onProgress?.(`表紙画像をまとめています… ${index + 1} / ${coverAssets.length}`)
    await writer.add(`cover-images/${image.id}`, new Uint8ArrayReader(await blobBytes(image.imageBlob)))
    await writer.add(`cover-thumbnails/${image.id}`, new Uint8ArrayReader(await blobBytes(image.thumbnailBlob)))
  }
  const blob = new Blob([await writer.close()], { type: 'application/zip' })
  return { blob, manifest, filename: `TravelArchive_${scope.type === 'filtered' ? 'Selected' : 'Backup'}_${formatFilenameDate(new Date())}.zip` }
}

export async function markBackupSaved(createdAt: string) { await db.metadata.put({ key: 'lastBackupSavedAt', value: createdAt, updatedAt: new Date() }) }

export async function inspectBackup(blob: Blob, onProgress?: (message: string) => void): Promise<PreparedRestore> {
  onProgress?.('バックアップを検証しています…')
  const reader = new ZipReader(new Uint8ArrayReader(await blobBytes(blob)))
  try {
    const entries = await reader.getEntries()
    const byName = new Map(entries.map((entry) => [entry.filename, entry]))
    const manifestEntry = byName.get('manifest.json') as FileEntry | undefined; const dataEntry = byName.get('data.json') as FileEntry | undefined
    if (!manifestEntry?.getData || !dataEntry?.getData) throw new Error('Travel Archiveのバックアップではありません')
    const manifest = JSON.parse(await manifestEntry.getData(new TextWriter())) as BackupManifest
    if (manifest.app !== 'Travel Archive') throw new Error('Travel Archiveのバックアップではありません')
    if (![1, 2, 3, BACKUP_FORMAT_VERSION].includes(manifest.formatVersion)) throw new Error('このバックアップ形式には対応していません。アプリを更新してください')
    manifest.scope ??= COMPLETE_BACKUP_SCOPE
    if (manifest.scope.type !== 'complete' && manifest.scope.type !== 'filtered') throw new Error('バックアップの範囲指定が正しくありません')
    if (manifest.scope.type === 'filtered' && !manifest.scope.filter) throw new Error('条件付きバックアップの条件が不足しています')
    const data = JSON.parse(await dataEntry.getData(new TextWriter())) as BackupData
    data.coverAssets ??= []
    data.prefectureCovers ??= []
    for (const key of ['trips', 'spots', 'visits', 'images'] as const) if (!Array.isArray(data[key])) throw new Error('バックアップの内容が壊れています')
    if (manifest.counts.trips !== data.trips.length || manifest.counts.spots !== data.spots.length || manifest.counts.visits !== data.visits.length || manifest.counts.images !== data.images.length) throw new Error('バックアップの件数が一致しません')
    if (manifest.formatVersion >= 2 && (manifest.counts.coverAssets ?? 0) !== data.coverAssets.length) throw new Error('バックアップの表紙画像件数が一致しません')
    if (manifest.formatVersion >= 3 && (manifest.counts.prefectureCovers ?? 0) !== data.prefectureCovers.length) throw new Error('バックアップの都道府県表紙件数が一致しません')
    const imageBlobs = new Map<string, { imageBlob: Blob; thumbnailBlob: Blob }>()
    for (let index = 0; index < data.images.length; index += 1) {
      const image = data.images[index]; const full = byName.get(`images/${image.id}`) as FileEntry | undefined; const thumb = byName.get(`thumbnails/${image.id}`) as FileEntry | undefined
      if (!full?.getData || !thumb?.getData) throw new Error('バックアップ内の写真が不足しています')
      onProgress?.(`写真を検証しています… ${index + 1} / ${data.images.length}`)
      imageBlobs.set(image.id, { imageBlob: await full.getData(new BlobWriter(image.mimeType)), thumbnailBlob: await thumb.getData(new BlobWriter(image.mimeType)) })
    }
    const coverAssetBlobs = new Map<string, { imageBlob: Blob; thumbnailBlob: Blob }>()
    for (let index = 0; index < data.coverAssets.length; index += 1) {
      const image = data.coverAssets[index]; const full = byName.get(`cover-images/${image.id}`) as FileEntry | undefined; const thumb = byName.get(`cover-thumbnails/${image.id}`) as FileEntry | undefined
      if (!full?.getData || !thumb?.getData) throw new Error('バックアップ内の表紙画像が不足しています')
      onProgress?.(`表紙画像を検証しています… ${index + 1} / ${data.coverAssets.length}`)
      coverAssetBlobs.set(image.id, { imageBlob: await full.getData(new BlobWriter(image.mimeType)), thumbnailBlob: await thumb.getData(new BlobWriter(image.mimeType)) })
    }
    return { manifest, data, imageBlobs, coverAssetBlobs }
  } finally { await reader.close() }
}

export async function restoreBackup(prepared: PreparedRestore) {
  const { data, imageBlobs, coverAssetBlobs } = prepared
  const restoredImages = revive(data.images).map((record) => ({ ...record, ...imageBlobs.get(String(record.id)) })) as TravelImage[]
  const imageIdsByVisit = new Map<string, string[]>()
  for (const image of [...restoredImages].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const current = imageIdsByVisit.get(image.visitId) ?? []
    current.push(image.id)
    imageIdsByVisit.set(image.visitId, current)
  }
  const restoredVisits = normalizeRestoredSpotOrder((revive(data.visits) as unknown as Visit[]).map((visit) => ({
    ...visit,
    photoOrder: Array.isArray(visit.photoOrder) ? visit.photoOrder : imageIdsByVisit.get(visit.id) ?? [],
  })))
  const tables = [db.trips, db.companionCategories, db.tripCompanionCategories, db.tripPrefectures, db.spots, db.visits, db.images, db.coverAssets, db.prefectureCovers, db.spotCategories, db.metadata]
  if (isFilteredBackup(prepared.manifest)) {
    const mergedVisits: Visit[] = []
    for (const visit of restoredVisits) {
      const [existingVisit, existingImages] = await Promise.all([db.visits.get(visit.id), db.images.where('visitId').equals(visit.id).sortBy('sortOrder')])
      const importedOrder = visit.photoOrder ?? []
      const existingOrder = existingVisit?.photoOrder ?? existingImages.map((image) => image.id)
      mergedVisits.push({ ...visit, photoOrder: [...importedOrder, ...existingOrder.filter((id) => !importedOrder.includes(id))] })
    }
    await db.transaction('rw', tables, async () => {
      await db.trips.bulkPut(revive(data.trips) as never[]); await db.companionCategories.bulkPut(revive(data.companionCategories) as never[])
      await db.tripCompanionCategories.bulkPut(data.tripCompanionCategories as never[]); await db.tripPrefectures.bulkPut(data.tripPrefectures as never[])
      await db.spots.bulkPut(revive(data.spots) as never[]); await db.visits.bulkPut(mergedVisits)
      await db.images.bulkPut(restoredImages)
      await db.coverAssets.bulkPut(revive(data.coverAssets).map((record) => ({ ...record, ...coverAssetBlobs.get(String(record.id)) })) as never[])
      await db.prefectureCovers.bulkPut(revive(data.prefectureCovers) as never[])
      await db.spotCategories.bulkPut(revive(data.spotCategories) as never[])
      await db.metadata.put({ key: 'lastPartialRestoreAt', value: new Date().toISOString(), updatedAt: new Date() })
    })
    return
  }
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()))
    await db.trips.bulkAdd(revive(data.trips) as never[]); await db.companionCategories.bulkAdd(revive(data.companionCategories) as never[])
    await db.tripCompanionCategories.bulkAdd(data.tripCompanionCategories as never[]); await db.tripPrefectures.bulkAdd(data.tripPrefectures as never[])
    await db.spots.bulkAdd(revive(data.spots) as never[]); await db.visits.bulkAdd(restoredVisits)
    await db.images.bulkAdd(restoredImages)
    await db.coverAssets.bulkAdd(revive(data.coverAssets).map((record) => ({ ...record, ...coverAssetBlobs.get(String(record.id)) })) as never[])
    await db.prefectureCovers.bulkAdd(revive(data.prefectureCovers) as never[])
    await db.spotCategories.bulkAdd(revive(data.spotCategories) as never[]); await db.metadata.bulkAdd(revive(data.metadata) as never[])
    await db.metadata.put({ key: 'lastRestoreAt', value: new Date().toISOString(), updatedAt: new Date() })
  })
}

function normalizeRestoredSpotOrder(visits: Visit[]) {
  const byTrip = new Map<string, Visit[]>()
  for (const visit of visits) byTrip.set(visit.tripId, [...(byTrip.get(visit.tripId) ?? []), visit])
  for (const tripVisits of byTrip.values()) {
    let nextOrder = tripVisits.reduce((maximum, visit) => Math.max(maximum, visit.spotOrder ?? -1), -1) + 1
    const missing = tripVisits.filter((visit) => visit.spotOrder === undefined).sort((left, right) => {
      const created = left.createdAt.getTime() - right.createdAt.getTime()
      return created || left.id.localeCompare(right.id)
    })
    for (const visit of missing) visit.spotOrder = nextOrder++
  }
  return visits
}

export function downloadBackup(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const formatFilenameDate = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`

function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise<Uint8Array>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob) })
}
