import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { featureBounds, loadPrefectureBoundaries } from '../geoData'
import { DEFAULT_MAP_PIN_MIN_ZOOM, getMapPinMinZoom } from '../mapPreferences'
import { clusterExpansionZoom, clusterMapSpots, MAP_SPOT_MAX_ZOOM } from '../mapSpotDisplay'

export type MapSpot = {
  id: string
  name: string
  latitude: number
  longitude: number
  prefectureCode: number
}

const blankStyle = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'paper', type: 'background' as const, paint: { 'background-color': '#dce8e2' } }],
}

export const FOCUSED_SPOT_ZOOM = 8

export function focusCameraForSpot(spots: MapSpot[], selectedSpotId?: string) {
  const spot = spots.find((item) => item.id === selectedSpotId)
  if (!spot) return undefined
  return { center: [spot.longitude, spot.latitude] as [number, number], zoom: FOCUSED_SPOT_ZOOM }
}

if (typeof document !== 'undefined') setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href)

export function OfflineJapanMap({ visitedCodes, spots, selectedSpotId, focusSpotId, initialCenter, initialZoom, onPrefecture, onSpot, onCluster }: {
  visitedCodes: number[]
  spots: MapSpot[]
  selectedSpotId?: string
  focusSpotId?: string
  initialCenter?: [number, number]
  initialZoom?: number
  onPrefecture?: (code: number) => void
  onSpot?: (id: string) => void
  onCluster?: (ids: string[]) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const refreshMarkersRef = useRef<() => void>(() => undefined)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoomLevel, setZoomLevel] = useState(initialZoom ?? 3.2)
  const pinMinZoom = useLiveQuery(getMapPinMinZoom, [], DEFAULT_MAP_PIN_MIN_ZOOM)
  const latestPinMinZoom = useRef(pinMinZoom)
  const latestHandlers = useRef({ onPrefecture, onSpot, onCluster })
  const latestData = useRef({ visitedCodes, spots, selectedSpotId })
  latestHandlers.current = { onPrefecture, onSpot, onCluster }
  latestData.current = { visitedCodes, spots, selectedSpotId }
  latestPinMinZoom.current = pinMinZoom

  useEffect(() => {
    if (!containerRef.current || typeof WebGLRenderingContext === 'undefined') return
    let active = true
    const map = new MapLibreMap({
      container: containerRef.current,
      style: blankStyle,
      center: initialCenter ?? [137.2, 37.1],
      zoom: initialZoom ?? 3.2,
      minZoom: 2.4,
      maxZoom: MAP_SPOT_MAX_ZOOM,
      maxBounds: [[119, 17], [157, 49]],
      attributionControl: false,
    })
    mapRef.current = map
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    const clearMarkers = () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
    const addMarker = (element: HTMLElement, longitude: number, latitude: number) => {
      markersRef.current.push(new Marker({ element, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(map))
    }
    const addSpotMarker = (spot: MapSpot, selected: boolean) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `map-spot-marker${selected ? ' selected' : ''}`
      element.setAttribute('aria-label', `${spot.name}${selected ? '、選択中' : ''}`)
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        latestHandlers.current.onSpot?.(spot.id)
      })
      addMarker(element, spot.longitude, spot.latitude)
    }
    const renderMarkers = () => {
      clearMarkers()
      const current = latestData.current
      const selectedSpot = current.spots.find((spot) => spot.id === current.selectedSpotId)
      if (map.getZoom() >= latestPinMinZoom.current) {
        const clusterCandidates = current.spots.filter((spot) => spot.id !== selectedSpot?.id)
        const projected = clusterCandidates.map((spot) => {
          const point = map.project([spot.longitude, spot.latitude])
          return { id: spot.id, x: point.x, y: point.y }
        })
        const spotsById = new Map(clusterCandidates.map((spot) => [spot.id, spot]))
        for (const cluster of clusterMapSpots(projected)) {
          if (cluster.members.length === 1) {
            const spot = spotsById.get(cluster.members[0].id)
            if (spot) addSpotMarker(spot, false)
            continue
          }
          const anchor = spotsById.get(cluster.anchorId)
          if (!anchor) continue
          const ids = cluster.members.map((member) => member.id)
          const element = document.createElement('button')
          element.type = 'button'
          element.className = `map-cluster-marker count-${ids.length >= 100 ? 'large' : ids.length >= 10 ? 'medium' : 'small'}`
          element.textContent = String(ids.length)
          element.setAttribute('aria-label', `${ids.length}件のスポットを拡大`)
          element.addEventListener('click', (event) => {
            event.stopPropagation()
            const targetZoom = clusterExpansionZoom(map.getZoom(), cluster.diameter, map.getMaxZoom())
            if (targetZoom === undefined) {
              latestHandlers.current.onCluster?.(ids)
              return
            }
            const memberSpots = ids.map((id) => spotsById.get(id)).filter((spot): spot is MapSpot => Boolean(spot))
            const center = memberSpots.reduce<[number, number]>((result, spot) => [result[0] + spot.longitude / memberSpots.length, result[1] + spot.latitude / memberSpots.length], [0, 0])
            map.easeTo({ center, zoom: targetZoom, duration: 550 })
          })
          addMarker(element, anchor.longitude, anchor.latitude)
        }
      }
      if (selectedSpot) addSpotMarker(selectedSpot, true)
    }
    refreshMarkersRef.current = renderMarkers
    const finishMove = () => {
      setZoomLevel(map.getZoom())
      renderMarkers()
    }
    map.on('moveend', finishMove)
    map.on('resize', renderMarkers)

    map.once('load', async () => {
      try {
        const boundaries = await loadPrefectureBoundaries()
        const current = latestData.current
        if (!map.getSource('prefectures')) {
          map.addSource('prefectures', { type: 'geojson', data: boundaries as never })
          map.addLayer({
            id: 'prefecture-fill', type: 'fill', source: 'prefectures',
            paint: {
              'fill-color': ['case', ['in', ['get', 'code'], ['literal', current.visitedCodes]], '#b56f52', '#b8c8c0'],
              'fill-opacity': ['case', ['in', ['get', 'code'], ['literal', current.visitedCodes]], 0.9, 0.58],
            },
          })
          map.addLayer({ id: 'prefecture-lines', type: 'line', source: 'prefectures', paint: { 'line-color': '#f8f5ed', 'line-width': 1 } })
        }
      map.on('click', 'prefecture-fill', (event: MapLayerMouseEvent) => {
        const code = Number(event.features?.[0]?.properties?.code)
        const feature = boundaries.features.find((item) => item.properties.code === code)
        if (!feature) return
        latestHandlers.current.onPrefecture?.(code)
        map.fitBounds(featureBounds(feature), { padding: 36, duration: 650, maxZoom: 8 })
      })
        renderMarkers()
        for (const layer of ['prefecture-fill']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
        }
        map.once('idle', () => { if (active) setStatus('ready') })
      } catch (error) {
        console.error('オフライン地図の描画に失敗しました', error)
        if (active) setStatus('error')
      }
    })
    return () => { active = false; clearMarkers(); refreshMarkersRef.current = () => undefined; mapRef.current = null; map.remove() }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('prefecture-fill')) return
    map.setPaintProperty('prefecture-fill', 'fill-color', ['case', ['in', ['get', 'code'], ['literal', visitedCodes]], '#b56f52', '#b8c8c0'])
    map.setPaintProperty('prefecture-fill', 'fill-opacity', ['case', ['in', ['get', 'code'], ['literal', visitedCodes]], 0.9, 0.58])
  }, [visitedCodes])

  useEffect(() => {
    refreshMarkersRef.current()
  }, [selectedSpotId, spots])

  useEffect(() => {
    refreshMarkersRef.current()
  }, [pinMinZoom])

  useEffect(() => {
    const map = mapRef.current
    const camera = focusCameraForSpot(spots, focusSpotId)
    if (!map || !camera) return
    map.easeTo({ ...camera, duration: 600 })
  }, [focusSpotId, spots])

  return <div className="offline-map-shell" data-map-status={status}>
    <div ref={containerRef} className="offline-map-canvas" aria-label="オフライン日本地図" />
    {status === 'loading' && <p className="map-status">日本地図を準備しています…</p>}
    {status === 'error' && <p className="map-status error">地図を表示できませんでした。アプリを更新して、もう一度お試しください。</p>}
    {status === 'ready' && spots.length > 0 && zoomLevel < pinMinZoom && <p className="map-zoom-hint">拡大するとスポットが表示されます</p>}
  </div>
}

export function CoordinateMap({ latitude, longitude, allowedCodes, initialBoundsCodes = [], onCenterChange }: {
  latitude: number
  longitude: number
  allowedCodes: number[]
  initialBoundsCodes?: number[]
  onCenterChange: (latitude: number, longitude: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCenterChange)
  const allowedCodesRef = useRef(allowedCodes)
  const initialBoundsCodesRef = useRef(initialBoundsCodes)
  callbackRef.current = onCenterChange
  allowedCodesRef.current = allowedCodes
  initialBoundsCodesRef.current = initialBoundsCodes

  useEffect(() => {
    if (!containerRef.current || typeof WebGLRenderingContext === 'undefined') return
    const hasInitialCoordinate = Number.isFinite(latitude) && Number.isFinite(longitude)
    const initialCenter: [number, number] = hasInitialCoordinate ? [longitude, latitude] : [137.2, 37.1]
    const map = new MapLibreMap({
      container: containerRef.current,
      style: blankStyle,
      center: initialCenter,
      zoom: hasInitialCoordinate ? 8 : 3.2,
      minZoom: 3,
      maxZoom: 16,
      maxBounds: [[119, 17], [157, 49]],
      attributionControl: false,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.once('load', async () => {
      const boundaries = await loadPrefectureBoundaries()
      map.addSource('prefectures', { type: 'geojson', data: boundaries as never })
      map.addLayer({
        id: 'prefecture-fill', type: 'fill', source: 'prefectures',
        paint: {
          'fill-color': ['case', ['in', ['get', 'code'], ['literal', allowedCodesRef.current]], '#9fbbae', '#cad5cf'],
          'fill-opacity': 0.68,
        },
      })
      map.addLayer({ id: 'prefecture-lines', type: 'line', source: 'prefectures', paint: { 'line-color': '#fffaf2', 'line-width': 1.25 } })
      const boundsCodes = hasInitialCoordinate
        ? []
        : initialBoundsCodesRef.current.length ? initialBoundsCodesRef.current : allowedCodesRef.current
      if (boundsCodes.length) {
        const selectedFeatures = boundaries.features.filter((feature) => boundsCodes.includes(feature.properties.code ?? 0))
        if (selectedFeatures.length) {
          const bounds = selectedFeatures.map(featureBounds).reduce<[number, number, number, number]>((result, [[west, south], [east, north]]) => [
            Math.min(result[0], west), Math.min(result[1], south), Math.max(result[2], east), Math.max(result[3], north),
          ], [Infinity, Infinity, -Infinity, -Infinity])
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 34, duration: 0, maxZoom: 8 })
        }
      }
    })
    map.on('moveend', () => {
      const center = map.getCenter()
      callbackRef.current(Number(center.lat.toFixed(5)), Number(center.lng.toFixed(5)))
    })
    return () => map.remove()
  }, [])

  return <div className="coordinate-map-shell"><div ref={containerRef} className="coordinate-map-canvas" aria-label="座標を選択するオフライン地図" /><div className="crosshair"><i /><b /></div><span className="map-hint">地図を動かして中央に合わせます</span></div>
}
