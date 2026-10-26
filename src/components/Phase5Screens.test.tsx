import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { PrefectureDetail, SavedPrefecturesHome } from './Phase5Screens'

describe('phase 5 prefecture browsing', () => {
  beforeEach(async () => {
    cleanup()
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
    const now = new Date()
    await db.spots.bulkAdd([
      { id: 'spot-kyoto-1', name: '南禅寺', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
      { id: 'spot-kyoto-2', name: '喫茶店', latitude: 35.003, longitude: 135.769, effectivePrefectureCode: 26, prefectureOverridden: false, createdAt: now, updatedAt: now },
      { id: 'spot-shiga', name: '琵琶湖', latitude: 35.25, longitude: 136.08, effectivePrefectureCode: 25, prefectureOverridden: false, createdAt: now, updatedAt: now },
    ])
  })

  afterEach(async () => {
    cleanup()
    db.close()
    await deleteDatabase(DATABASE_NAME)
  })

  it('groups saved spots by prefecture and opens the selected prefecture', async () => {
    const openPrefecture = vi.fn()
    render(<SavedPrefecturesHome openPrefecture={openPrefecture} />)
    await waitFor(() => expect(screen.getByText('2スポット')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /京都府/ }))
    await waitFor(() => expect(openPrefecture).toHaveBeenCalledWith(26))
  })

  it('lists only spots in the selected prefecture', async () => {
    const openSpot = vi.fn()
    render(<PrefectureDetail code={26} back={() => undefined} openSpot={openSpot} />)
    await waitFor(() => expect(screen.getByText('南禅寺')).toBeInTheDocument())
    expect(screen.getByText('喫茶店')).toBeInTheDocument()
    expect(screen.queryByText('琵琶湖')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /南禅寺/ }))
    await waitFor(() => expect(openSpot).toHaveBeenCalledWith('spot-kyoto-1'))
  })
})

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
