import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MAP_FILTER } from '../browsingFilters'
import { db } from '../db'
import { Phase4MapHome } from './Phase4MapHome'

vi.mock('./OfflineJapanMap', () => ({
  OfflineJapanMap: ({ spots, selectedSpotId }: { spots: unknown[]; selectedSpotId?: string }) => <div data-testid="offline-map" data-spot-count={spots.length} data-selected-spot={selectedSpotId ?? ''} />,
}))

afterEach(async () => {
  cleanup()
  await Promise.all([db.trips.clear(), db.tripPrefectures.clear(), db.spots.clear(), db.visits.clear()])
})

describe('スポットを指定して日本地図を開く', () => {
  it('地図データの読み込み中も対象スポットの選択を失わない', async () => {
    const now = new Date()
    await db.trips.put({ id: 'focus-trip', name: '地図確認旅行', startDate: '2026-10-01', endDate: '2026-10-02', createdAt: now, updatedAt: now })
    await db.tripPrefectures.put({ id: 'focus-prefecture', tripId: 'focus-trip', prefectureCode: 14 })
    await db.spots.put({ id: 'focus-spot', name: '地図確認スポット', latitude: 35.45, longitude: 139.64, effectivePrefectureCode: 14, prefectureOverridden: false, createdAt: now, updatedAt: now })
    await db.visits.put({ id: 'focus-visit', tripId: 'focus-trip', spotId: 'focus-spot', createdAt: now, updatedAt: now })

    render(<Phase4MapHome initialSpotId="focus-spot" startFirstTrip={vi.fn()} openSpot={vi.fn()} openPrefecture={vi.fn()} openTrip={vi.fn()} filter={DEFAULT_MAP_FILTER} changeFilter={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('offline-map')).toHaveAttribute('data-spot-count', '1'))
    expect(screen.getByTestId('offline-map')).toHaveAttribute('data-selected-spot', 'focus-spot')
  })
})
