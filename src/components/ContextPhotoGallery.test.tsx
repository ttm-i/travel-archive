import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TravelImage } from '../types'
import { ContextPhotoGallery } from './ContextPhotoGallery'

const now = new Date()
const image = (id: string): TravelImage => ({ id, visitId: 'visit', imageBlob: new Blob([`${id}-full`]), thumbnailBlob: new Blob([`${id}-thumb`]), mimeType: 'image/jpeg', width: 1200, height: 900, sortOrder: Number(id.at(-1)) || 0, createdAt: now })

describe('ContextPhotoGallery', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('opens every context photo in the read-only full-screen viewer', () => {
    const openSpot = vi.fn()
    render(<ContextPhotoGallery loading={false} openSpot={openSpot} groups={[{ spotId: 'spot', spotName: '庭園', photos: [image('image-1'), image('image-2')].map((item) => ({ image: item, spotId: 'spot', spotName: '庭園' })) }]} />)

    expect(screen.getAllByRole('button', { name: '庭園の写真を全画面表示' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: '庭園の写真を全画面表示' })[0])
    expect(screen.getByRole('dialog', { name: '写真を全画面表示' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次の写真' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '写真を閉じる' }))
    expect(screen.queryByRole('dialog', { name: '写真を全画面表示' })).not.toBeInTheDocument()
  })
})
