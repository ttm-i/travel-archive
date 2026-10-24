import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { DEFAULT_MAP_PIN_MIN_ZOOM, getMapPinMinZoom, saveMapPinMinZoom } from './mapPreferences'

describe('地図のピン表示倍率設定', () => {
  beforeEach(async () => {
    await db.metadata.clear()
  })

  it('未設定時は標準値を返す', async () => {
    expect(await getMapPinMinZoom()).toBe(DEFAULT_MAP_PIN_MIN_ZOOM)
  })

  it('スライダーで選択した倍率を端末内へ保存する', async () => {
    await saveMapPinMinZoom(8.4)
    expect(await getMapPinMinZoom()).toBe(8.4)
  })

  it('スライダーの範囲外は保存しない', async () => {
    await expect(saveMapPinMinZoom(3)).rejects.toThrow('選択できない地図倍率です')
    await expect(saveMapPinMinZoom(10.2)).rejects.toThrow('選択できない地図倍率です')
    expect(await getMapPinMinZoom()).toBe(DEFAULT_MAP_PIN_MIN_ZOOM)
  })
})
