import { db } from './db'

export const DEFAULT_MAP_PIN_MIN_ZOOM = 5.2
export const MAP_PIN_MIN_ZOOM = 4
export const MAP_PIN_MAX_ZOOM = 10
export const MAP_PIN_ZOOM_STEP = 0.2

export function describeMapPinZoom(value: number) {
  if (value < 5) return '広域から表示'
  if (value < 6.5) return '都道府県が見える範囲から'
  if (value < 8) return '近づいてから表示'
  return 'かなり近づいてから表示'
}

export async function getMapPinMinZoom() {
  const value = (await db.metadata.get('mapPinMinZoom'))?.value
  return typeof value === 'number' && Number.isFinite(value) && value >= MAP_PIN_MIN_ZOOM && value <= MAP_PIN_MAX_ZOOM ? value : DEFAULT_MAP_PIN_MIN_ZOOM
}

export async function saveMapPinMinZoom(value: number) {
  if (!Number.isFinite(value) || value < MAP_PIN_MIN_ZOOM || value > MAP_PIN_MAX_ZOOM) throw new Error('選択できない地図倍率です')
  await db.metadata.put({ key: 'mapPinMinZoom', value: Math.round(value * 10) / 10, updatedAt: new Date() })
}
