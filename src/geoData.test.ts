import { describe, expect, it } from 'vitest'
import { featureBounds, pointInPrefecture, type PrefectureFeature } from './geoData'

const feature: PrefectureFeature = {
  type: 'Feature',
  properties: { P: 'テスト県', code: 1 },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [130, 30], [140, 30], [140, 40], [130, 40], [130, 30],
    ]],
  },
}

describe('offline prefecture geometry', () => {
  it('determines whether a longitude/latitude point is in a prefecture', () => {
    expect(pointInPrefecture([135, 35], feature)).toBe(true)
    expect(pointInPrefecture([145, 35], feature)).toBe(false)
  })

  it('calculates bounds for prefecture zooming', () => {
    expect(featureBounds(feature)).toEqual([[130, 30], [140, 40]])
  })
})
