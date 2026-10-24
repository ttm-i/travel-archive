import { BlobWriter, TextReader, TextWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import { DATABASE_VERSION, db } from './db'
import type { CoverAsset, TravelImage, Visit } from './types'

export const BACKUP_FORMAT_VERSION = 3
export type BackupManifest = { app: 'Travel Archive'; formatVersion: number; databaseVersion: number; createdAt: string; counts: { trips: number; spots: number; visits: number; images: number; coverAssets?: number; prefectureCovers?: number } }
type ImageRecord = Omit<TravelImage, 'imageBlob' | 'thumbnailBlob'>
type CoverAssetRecord = Omit<CoverAsset, 'imageBlob' | 'thumbnailBlob'>
type BackupData = { trips: unknown[]; companionCategories: unknown[]; tripCompanionCategories: unknown[]; tripPrefectures: unknown[]; spots: unknown[]; visits: unknown[]; images: ImageRecord[]; coverAssets: CoverAssetRecord[]; prefectureCovers: unknown[]; spotCategories: unknown[]; metadata: unknown[] }
export type PreparedRestore = { manifest: BackupManifest; data: BackupData; imageBlobs: Map<string, { imageBlob: Blob; thumbnailBlob: Blob }>; coverAssetBlobs: Map<string, { imageBlob: Blob; thumbnailBlob: Blob }> }

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value
const serialize = <T extends object>(rows: T[]) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, iso(value)])))
const dateKeys = new Set(['createdAt', 'updatedAt', 'deletedAt'])
const revive = (rows: unknown[]) => rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, dateKeys.has(key) && typeof value === 'string' ? new Date(value) : value])))

export async function estimateBackupBytes() {
  const [images, coverAssets] = await Promise.all([db.images.toArray(), db.coverAssets.toArray()])
  return [...images, ...coverAssets].reduce((sum, image) => sum + image.imageBlob.size + image.thumbnailBlob.size, 0)
}

export async function createBackup(onProgress?: (message: string) => void) {
  onProgress?.('端末内データを確認しています…')
  const [trips, companionCategories, tripCompanionCategories, tripPrefectures, spots, visits, images, coverAssets, prefectureCovers, spotCategories, metadata] = await Promise.all([
    db.trips.toArray(), db.companionCategories.toArray(), db.tripCompanionCategories.toArray(), db.tripPrefectures.toArray(), db.spots.toArray(), db.visits.toArray(), db.images.toArray(), db.coverAssets.toArray(), db.prefectureCovers.toArray(), db.spotCategories.toArray(), db.metadata.toArray(),
  ])
  const manifest: BackupManifest = { app: 'Travel Archive', formatVersion: BACKUP_FORMAT_VERSION, databaseVersion: DATABASE_VERSION, createdAt: new Date().toISOString(), counts: { trips: trips.length, spots: spots.length, visits: visits.length, images: images.length, coverAssets: coverAssets.length, prefectureCovers: prefectureCovers.length } }
  const imageRecords = images.map(({ imageBlob: _image, thumbnailBlob: _thumb, ...record }) => record)
  const coverAssetRecords = coverAssets.map(({ imageBlob: _image, thumbnailBlob: _thumb, ...record }) => record)
  const data: BackupData = { trips: serialize(trips), companionCategories: serialize(companionCategories), tripCompanionCategories, tripPrefectures, spots: serialize(spots), visits: serialize(visits), images: serialize(imageRecords) as ImageRecord[], coverAssets: serialize(coverAssetRecords) as CoverAssetRecord[], prefectureCovers: serialize(prefectureCovers), spotCategories: serialize(spotCategories), metadata: serialize(metadata.filter((item) => !['lastBackupAt', 'lastBackupSavedAt'].includes(item.key))) }
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
  return { blob, manifest, filename: `TravelArchive_Backup_${formatFilenameDate(new Date())}.zip` }
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
    if (![1, 2, BACKUP_FORMAT_VERSION].includes(manifest.formatVersion)) throw new Error('このバックアップ形式には対応していません。アプリを更新してください')
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
  const restoredVisits = (revive(data.visits) as unknown as Visit[]).map((visit) => ({
    ...visit,
    photoOrder: Array.isArray(visit.photoOrder) ? visit.photoOrder : imageIdsByVisit.get(visit.id) ?? [],
  }))
  const tables = [db.trips, db.companionCategories, db.tripCompanionCategories, db.tripPrefectures, db.spots, db.visits, db.images, db.coverAssets, db.prefectureCovers, db.spotCategories, db.metadata]
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

export function downloadBackup(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const formatFilenameDate = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`

function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise<Uint8Array>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob) })
}
