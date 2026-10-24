import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlobImage } from './BlobImage'

describe('BlobImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps a stable object URL for the same saved photo and recreates it after a load failure', () => {
    let count = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++count}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const firstBlob = new Blob(['same-photo'], { type: 'image/jpeg' })
    const refreshedBlob = new Blob(['same-photo'], { type: 'image/jpeg' })
    const view = render(<BlobImage blob={firstBlob} imageKey="photo-1:full" alt="写真" />)
    expect(view.getByRole('img').getAttribute('src')).toBe('blob:test-1')
    view.rerender(<BlobImage blob={refreshedBlob} imageKey="photo-1:full" alt="写真" />)
    expect(view.getByRole('img').getAttribute('src')).toBe('blob:test-1')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    fireEvent.error(view.getByRole('img'))
    expect(view.getByRole('img').getAttribute('src')).toBe('blob:test-2')
  })
})
