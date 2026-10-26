import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from '../db'
import { PrefectureCoverEditor } from './PrefectureCoverEditor'

describe('PrefectureCoverEditor', () => {
  beforeEach(async () => {
    cleanup()
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const now = new Date()
    await db.coverAssets.add({ id: 'cover', ownerType: 'prefecture', ownerId: '8', imageBlob: new Blob(['full']), thumbnailBlob: new Blob(['thumb']), mimeType: 'image/jpeg', width: 1200, height: 800, createdAt: now })
    await db.prefectureCovers.add({ prefectureCode: 8, assetId: 'cover', listCrop: { x: 20, y: 15, zoom: 1.2 }, heroCrop: { x: 70, y: 82, zoom: 1.6 }, updatedAt: now })
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    db.close()
    await deleteDatabase(DATABASE_NAME)
  })

  it('shows the saved detail crop in the summary and opens detail adjustment first', async () => {
    render(<PrefectureCoverEditor code={8} close={vi.fn()} />)

    const preview = await screen.findByAltText('都道府県詳細の表紙プレビュー')
    expect(preview.parentElement).toHaveStyle({ '--crop-x': '70%', '--crop-y': '82%', '--crop-zoom': '1.6' })

    fireEvent.click(screen.getByRole('button', { name: '表示位置を調整' }))
    expect(screen.getByRole('button', { name: '都道府県詳細' })).toHaveClass('active')
    expect(screen.getByAltText('都道府県詳細の切り取りプレビュー').parentElement).toHaveStyle({ '--crop-y': '82%' })
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
