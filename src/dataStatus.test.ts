import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { formatBytes, getDataProtectionStatus, getStorageStatus, storageErrorMessage } from './dataStatus'

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('phase 7 data status', () => {
  it('detects changes newer than the last saved backup', async () => {
    const changedAt = new Date('2026-10-23T10:00:00Z')
    await db.trips.add({ id: 't1', name: '旅', startDate: '2026-10-01', endDate: '2026-10-01', createdAt: changedAt, updatedAt: changedAt })
    expect((await getDataProtectionStatus()).hasUnbackedChanges).toBe(true)
    await db.metadata.put({ key: 'lastBackupSavedAt', value: '2026-10-23T11:00:00Z', updatedAt: new Date() })
    expect((await getDataProtectionStatus()).hasUnbackedChanges).toBe(false)
  })

  it('reports photo size and a nearly full browser storage allowance', async () => {
    const now = new Date()
    await db.images.add({ id: 'i1', visitId: 'v1', imageBlob: new Blob(['1234']), thumbnailBlob: new Blob(['12']), mimeType: 'image/jpeg', width: 10, height: 10, sortOrder: 0, createdAt: now })
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 900, quota: 1000 }) } })
    const status = await getStorageStatus()
    expect(status.photoBytes).toBeGreaterThanOrEqual(0)
    expect(status.nearLimit).toBe(true)
    vi.unstubAllGlobals()
  })

  it('uses a clear message for storage quota failures', () => {
    expect(storageErrorMessage(new DOMException('', 'QuotaExceededError'), '失敗')).toContain('保存容量')
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
  })
})
