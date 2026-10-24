import { PREFECTURES } from './prefectures'

export type Position = [number, number]

type PolygonGeometry = {
  type: 'Polygon'
  coordinates: Position[][]
}

type MultiPolygonGeometry = {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type PrefectureFeature = {
  type: 'Feature'
  properties: { P: string; code?: number }
  geometry: PolygonGeometry | MultiPolygonGeometry
}

export type PrefectureCollection = {
  type: 'FeatureCollection'
  features: PrefectureFeature[]
}

let collectionPromise: Promise<PrefectureCollection> | undefined

export function loadPrefectureBoundaries() {
  collectionPromise ??= fetch(`${import.meta.env.BASE_URL}data/prefectures.geojson`)
    .then((response) => {
      if (!response.ok) throw new Error('都道府県境界を読み込めませんでした')
      return response.json() as Promise<PrefectureCollection>
    })
    .then((collection) => ({
      ...collection,
      features: collection.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          code: PREFECTURES.indexOf(feature.properties.P as (typeof PREFECTURES)[number]) + 1,
        },
      })),
    }))
  return collectionPromise
}

function pointInRing([x, y]: Position, ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function pointInPolygon(point: Position, rings: Position[][]) {
  if (!rings.length || !pointInRing(point, rings[0])) return false
  return !rings.slice(1).some((hole) => pointInRing(point, hole))
}

export function pointInPrefecture(point: Position, feature: PrefectureFeature) {
  if (feature.geometry.type === 'Polygon') return pointInPolygon(point, feature.geometry.coordinates)
  return feature.geometry.coordinates.some((polygon) => pointInPolygon(point, polygon))
}

export async function detectPrefectureCode(latitude: number, longitude: number) {
  const collection = await loadPrefectureBoundaries()
  return collection.features.find((feature) => pointInPrefecture([longitude, latitude], feature))?.properties.code
}

export function featureBounds(feature: PrefectureFeature): [Position, Position] {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        west = Math.min(west, longitude)
        south = Math.min(south, latitude)
        east = Math.max(east, longitude)
        north = Math.max(north, latitude)
      }
    }
  }
  return [[west, south], [east, north]]
}
