import { describe, expect, it } from 'vitest'
import { FOCUSED_SPOT_ZOOM, focusCameraForSpot, type MapSpot } from './OfflineJapanMap'

const spots: MapSpot[] = [
  { id: 'spot-a', name: '横浜', latitude: 35.4437, longitude: 139.638, prefectureCode: 14 },
  { id: 'spot-b', name: '鎌倉', latitude: 35.3192, longitude: 139.5467, prefectureCode: 14 },
]

describe('focusCameraForSpot', () => {
  it('選択したスポットを中心とする適度な拡大率を返す', () => {
    expect(focusCameraForSpot(spots, 'spot-b')).toEqual({
      center: [139.5467, 35.3192],
      zoom: FOCUSED_SPOT_ZOOM,
    })
  })

  it('対象スポットがない場合はカメラを変更しない', () => {
    expect(focusCameraForSpot(spots, 'missing')).toBeUndefined()
  })
})
