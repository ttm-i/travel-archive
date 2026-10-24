import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { BackupScreen } from './Phase6Screens'

beforeEach(async () => {
  db.close()
  await removeDatabase(DATABASE_NAME)
  await initializeDatabase()
})

afterEach(async () => {
  cleanup()
  db.close()
  await removeDatabase(DATABASE_NAME)
})

describe('BackupScreen', () => {
  it('offers the same period and companion filters for a filtered backup', async () => {
    const now = new Date('2026-10-25T00:00:00Z')
    await db.trips.add({ id: 'backup-ui-trip', name: '書き出す旅行', startDate: '2026-10-01', endDate: '2026-10-02', createdAt: now, updatedAt: now })
    render(<BackupScreen back={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: /条件を指定/ }))

    expect(await screen.findByText('条件に合う旅行')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '期間または同行者を指定' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '今年' }))
    expect(await screen.findByRole('button', { name: '条件付きバックアップを作成（1件）' })).toBeEnabled()
    expect(screen.getByText('誰と行ったか')).toBeInTheDocument()
  })
})

function removeDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
