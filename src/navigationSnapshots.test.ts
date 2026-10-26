import { afterEach, describe, expect, it } from 'vitest'
import { clearNavigationSnapshots, getNavigationSnapshot, mergeNavigationSnapshot, setNavigationSnapshot } from './navigationSnapshots'

afterEach(clearNavigationSnapshots)

describe('navigation snapshots', () => {
  it('keeps the fully rendered route available across a remount', () => {
    setNavigationSnapshot('trip', 'trip-1', { name: '京都', spotCount: 4 })

    expect(getNavigationSnapshot<{ name: string; spotCount: number }>('trip', 'trip-1')).toEqual({ name: '京都', spotCount: 4 })
  })

  it('adds a source-screen preview without discarding existing detail data', () => {
    setNavigationSnapshot('spot', 'spot-1', { details: { visits: 2 } })
    mergeNavigationSnapshot('spot', 'spot-1', { spot: { name: '水路閣' } })

    expect(getNavigationSnapshot<{ details: { visits: number }; spot: { name: string } }>('spot', 'spot-1')).toEqual({
      details: { visits: 2 },
      spot: { name: '水路閣' },
    })
  })
})
