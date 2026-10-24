import { db } from './db'

export type DataProtectionStatus = {
  hasUserData: boolean
  hasUnbackedChanges: boolean
  lastBackupAt?: string
  latestChangeAt?: Date
}

export type StorageStatus = {
  photoBytes: number
  usageBytes?: number
  quotaBytes?: number
  remainingBytes?: number
  nearLimit: boolean
}

function newest(values: Array<Date | undefined>) {
  return values.reduce<Date | undefined>((latest, value) => !value || (latest && latest >= value) ? latest : value, undefined)
}

export async function getDataProtectionStatus(): Promise<DataProtectionStatus> {
  const [trips, spots, visits, images, coverAssets, companions, spotCategories, backup, partialRestore] = await Promise.all([
    db.trips.toArray(),
    db.spots.toArray(),
    db.visits.toArray(),
    db.images.toArray(),
    db.coverAssets.toArray(),
    db.companionCategories.toArray(),
    db.spotCategories.toArray(),
    db.metadata.get('lastBackupSavedAt'),
    db.metadata.get('lastPartialRestoreAt'),
  ])
  const partialRestoreAt = typeof partialRestore?.value === 'string' ? new Date(partialRestore.value) : undefined
  const latestChangeAt = newest([
    ...trips.map((item) => item.updatedAt),
    ...spots.map((item) => item.updatedAt),
    ...visits.map((item) => item.updatedAt),
    ...images.map((item) => item.createdAt),
    ...coverAssets.map((item) => item.createdAt),
    ...companions.map((item) => item.updatedAt),
    ...spotCategories.map((item) => item.updatedAt),
    partialRestoreAt,
  ])
  const lastBackupAt = typeof backup?.value === 'string' ? backup.value : undefined
  const backupTime = lastBackupAt ? new Date(lastBackupAt).getTime() : Number.NaN
  const hasUserData = trips.length > 0 || spots.length > 0 || visits.length > 0 || images.length > 0
  return {
    hasUserData,
    lastBackupAt,
    latestChangeAt,
    hasUnbackedChanges: hasUserData && (!Number.isFinite(backupTime) || Boolean(latestChangeAt && latestChangeAt.getTime() > backupTime)),
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const [images, coverAssets] = await Promise.all([db.images.toArray(), db.coverAssets.toArray()])
  const photoBytes = [...images, ...coverAssets].reduce((total, image) => total + Number(image.imageBlob?.size ?? 0) + Number(image.thumbnailBlob?.size ?? 0), 0)
  try {
    const estimate = await navigator.storage?.estimate?.()
    const usageBytes = estimate?.usage
    const quotaBytes = estimate?.quota
    const remainingBytes = usageBytes !== undefined && quotaBytes !== undefined ? Math.max(0, quotaBytes - usageBytes) : undefined
    const nearLimit = Boolean(quotaBytes && usageBytes !== undefined && usageBytes / quotaBytes >= 0.8)
      || Boolean(remainingBytes !== undefined && remainingBytes < 100 * 1024 * 1024)
    return { photoBytes, usageBytes, quotaBytes, remainingBytes, nearLimit }
  } catch {
    return { photoBytes, nearLimit: false }
  }
}

export function storageErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return '端末の保存容量が不足しています。不要なデータを整理してから、もう一度お試しください。'
  }
  return error instanceof Error ? error.message : fallback
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}
