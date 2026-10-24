import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, CalendarDays, Check, ChevronRight, Luggage, MapPinned, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { DEFAULT_MAP_FILTER, filterTripsForMap, mapFilterCount, type MapFilter } from '../browsingFilters'
import { db } from '../db'
import { prefectureName } from '../prefectures'
import { BlobImage } from './BlobImage'
import { DateRangeField } from './Phase2Screens'
import { OfflineJapanMap } from './OfflineJapanMap'

export function Phase4MapHome({ initialSpotId, back, startFirstTrip, openSpot, openPrefecture, openTrip, filter, changeFilter }: { initialSpotId?: string; back?: () => void; startFirstTrip: () => void; openSpot: (id: string) => void; openPrefecture: (code: number) => void; openTrip: (id: string) => void; filter: MapFilter; changeFilter: (filter: MapFilter) => void }) {
  const [selectedSpotId, setSelectedSpotId] = useState<string | undefined>(initialSpotId)
  const [selectedPrefectureCode, setSelectedPrefectureCode] = useState<number>()
  const [tripPickerOpen, setTripPickerOpen] = useState(false)
  const [clusterSpotIds, setClusterSpotIds] = useState<string[]>()
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState<MapFilter>(filter)
  const panelRef = useRef<HTMLElement>(null)
  const activeTripCount = useLiveQuery(() => db.trips.filter((trip) => !trip.deletedAt).count())
  const companionCategories = useLiveQuery(() => db.companionCategories.orderBy('sortOrder').toArray(), [], [])
  const dataResult = useLiveQuery(async () => {
    const [allTrips, companionLinks, prefectureLinks, allVisits, allSpots] = await Promise.all([
      db.trips.filter((trip) => !trip.deletedAt).toArray(),
      db.tripCompanionCategories.toArray(),
      db.tripPrefectures.toArray(),
      db.visits.filter((visit) => !visit.deletedAt).toArray(),
      db.spots.filter((spot) => !spot.deletedAt).toArray(),
    ])
    const activeTripIds = new Set(allTrips.map((trip) => trip.id))
    const matchedTrips = filterTripsForMap(allTrips, companionLinks, filter)
    const matchedTripIds = new Set(matchedTrips.map((trip) => trip.id))
    const matchedVisits = allVisits.filter((visit) => activeTripIds.has(visit.tripId) && matchedTripIds.has(visit.tripId))
    const visitsBySpot = new Map<string, typeof matchedVisits>()
    const fullCounts = new Map<string, number>()
    for (const visit of allVisits) {
      if (!activeTripIds.has(visit.tripId)) continue
      fullCounts.set(visit.spotId, (fullCounts.get(visit.spotId) ?? 0) + 1)
    }
    for (const visit of matchedVisits) {
      const current = visitsBySpot.get(visit.spotId) ?? []
      current.push(visit)
      visitsBySpot.set(visit.spotId, current)
    }
    const spotsById = new Map(allSpots.map((spot) => [spot.id, spot]))
    const rows = await Promise.all([...visitsBySpot].flatMap(([spotId, visits]) => {
      const spot = spotsById.get(spotId)
      if (!spot) return []
      const trips = matchedTrips.filter((trip) => visits.some((visit) => visit.tripId === trip.id))
      return [(spot.representativeImageId ? db.images.get(spot.representativeImageId) : Promise.resolve(undefined)).then((image) => ({ spot, image, trips, fullTripCount: fullCounts.get(spotId) ?? trips.length }))]
    }))
    return { rows, visitedCodes: [...new Set(prefectureLinks.filter((link) => matchedTripIds.has(link.tripId)).map((link) => link.prefectureCode))] }
  }, [filter])
  const data = dataResult ?? { rows: [], visitedCodes: [] }
  const activeFilterCount = mapFilterCount(filter)
  const mapSpots = useMemo(() => data.rows.map(({ spot }) => ({ id: spot.id, name: spot.name, latitude: spot.latitude, longitude: spot.longitude, prefectureCode: spot.effectivePrefectureCode })), [data.rows])
  const selected = data.rows.find(({ spot }) => spot.id === selectedSpotId)
  const clusterRows = clusterSpotIds ? data.rows.filter(({ spot }) => clusterSpotIds.includes(spot.id)).sort((a, b) => a.spot.name.localeCompare(b.spot.name, 'ja')) : []

  useEffect(() => {
    if (dataResult && selectedSpotId && !selected) setSelectedSpotId(undefined)
  }, [dataResult, selectedSpotId, selected])
  useEffect(() => {
    if (clusterSpotIds && clusterRows.length < 2) setClusterSpotIds(undefined)
  }, [clusterRows.length, clusterSpotIds])
  useEffect(() => {
    if (!selected) return
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
  }, [selected?.spot.id])

  const openFilters = () => { setDraftFilter(filter); setFilterOpen(true) }
  const toggleCompanion = (id: string) => setDraftFilter((current) => ({ ...current, companionCategoryIds: current.companionCategoryIds.includes(id) ? current.companionCategoryIds.filter((value) => value !== id) : [...current.companionCategoryIds, id] }))
  const applyFilters = () => { changeFilter(draftFilter); setSelectedSpotId(undefined); setSelectedPrefectureCode(undefined); setClusterSpotIds(undefined); setFilterOpen(false) }
  const resetFilters = () => { changeFilter(DEFAULT_MAP_FILTER); setDraftFilter(DEFAULT_MAP_FILTER); setSelectedSpotId(undefined); setSelectedPrefectureCode(undefined); setClusterSpotIds(undefined); setFilterOpen(false) }
  const invalidCustomRange = draftFilter.period === 'custom' && (!draftFilter.startDate || !draftFilter.endDate)

  return <main className="screen map-home">
    <header className={`app-header ${back ? 'with-context-back' : ''}`}>{back && <button className="map-context-back" type="button" onClick={back} aria-label="前の画面に戻る"><ArrowLeft /></button>}<div><span>VISITED MAP</span><h1>訪問マップ</h1></div><button className={`icon-button filter-trigger ${activeFilterCount ? 'active' : ''}`} type="button" aria-label="地図を絞り込む" onClick={openFilters}><SlidersHorizontal />{activeFilterCount ? <b>{activeFilterCount}</b> : null}</button></header>
    <section className="map-summary"><div><strong>{data.visitedCodes.length}</strong><span>/ 47 都道府県</span></div><p>{activeFilterCount ? '条件に合う旅の記憶を表示しています。' : data.visitedCodes.length ? '旅の記憶が、少しずつ地図を彩ります。' : 'スポットを登録すると、地図に色が灯ります。'}</p></section>
    {activeFilterCount ? <section className="browse-result-summary map-filter-summary"><span><strong>{data.rows.length}件</strong>のスポットが該当</span><button type="button" onClick={resetFilters}><RotateCcw />条件を解除</button></section> : null}
    {activeTripCount === 0 && <section className="first-use-card"><Luggage /><div><span>はじめての記録</span><strong>まず旅行を作り、その中にスポットと写真を追加します。</strong><small>保存後は設定からZIPバックアップを作成できます。</small></div><button type="button" onClick={startFirstTrip}><Plus />最初の旅行を作る</button></section>}
    {activeFilterCount && !data.rows.length ? <section className="browse-empty map-filter-empty"><MapPinned /><h2>条件に合うスポットがありません</h2><p>期間や同行カテゴリを変えてお試しください。</p><button type="button" onClick={resetFilters}><RotateCcw />条件を解除</button></section> : null}
    <section className="japan-map-card real-map-card">
      <div className="real-map-frame">
        <OfflineJapanMap visitedCodes={data.visitedCodes} spots={mapSpots} selectedSpotId={selectedSpotId} focusSpotId={initialSpotId} onPrefecture={(code) => { setSelectedPrefectureCode(code); setSelectedSpotId(undefined); setClusterSpotIds(undefined); setTripPickerOpen(false) }} onSpot={(id) => { setSelectedSpotId(id); setSelectedPrefectureCode(undefined); setClusterSpotIds(undefined); setTripPickerOpen(false) }} onCluster={(ids) => { setClusterSpotIds(ids); setSelectedSpotId(undefined); setSelectedPrefectureCode(undefined); setTripPickerOpen(false) }} />
        <div className="map-legend"><i />訪れた都道府県</div>
        <p className="map-data-credit">境界：国土交通省 国土数値情報（加工）</p>
        {selectedPrefectureCode && !selected && <p className="selected-prefecture-label">{prefectureName(selectedPrefectureCode)}</p>}
      </div>
      {selected && <section ref={panelRef} className="map-spot-panel"><button className="map-spot-sheet" type="button" onClick={() => openSpot(selected.spot.id)}><BlobImage blob={selected.image?.thumbnailBlob} imageKey={selected.image ? `${selected.image.id}:thumbnail` : undefined} alt={selected.spot.name} /><div><span>{prefectureName(selected.spot.effectivePrefectureCode)}</span><strong>{selected.spot.name}</strong><small>{activeFilterCount && selected.fullTripCount !== selected.trips.length ? `条件内${selected.trips.length}回 / 全${selected.fullTripCount}回` : `${selected.trips.length}回の旅行で訪問`}</small></div><ChevronRight /></button><div className="map-spot-actions"><button type="button" onClick={() => openPrefecture(selected.spot.effectivePrefectureCode)}><MapPinned />都道府県</button><button type="button" disabled={!selected.trips.length} onClick={() => selected.trips.length === 1 ? openTrip(selected.trips[0].id) : setTripPickerOpen(true)}><CalendarDays />旅行{selected.trips.length > 1 ? 'を選ぶ' : ''}</button></div></section>}
    </section>
    {tripPickerOpen && selected && <div className="trip-picker-modal" role="dialog" aria-modal="true" aria-label="訪れた旅行を選択"><header><button type="button" aria-label="旅行選択を閉じる" onClick={() => setTripPickerOpen(false)}><X /></button><strong>訪れた旅行を選択</strong><span /></header><div>{selected.trips.map((trip) => <button type="button" key={trip.id} onClick={() => openTrip(trip.id)}><CalendarDays /><div><strong>{trip.name}</strong><span>{trip.startDate} — {trip.endDate}</span></div><ChevronRight /></button>)}</div></div>}
    {clusterSpotIds && clusterRows.length > 1 && <div className="trip-picker-modal cluster-spot-picker" role="dialog" aria-modal="true" aria-label="重なっているスポットを選択"><header><button type="button" aria-label="スポット選択を閉じる" onClick={() => setClusterSpotIds(undefined)}><X /></button><strong>スポットを選択</strong><span /></header><p>同じ場所に近いスポットが{clusterRows.length}件あります。</p><div>{clusterRows.map(({ spot }) => <button type="button" key={spot.id} onClick={() => { setSelectedSpotId(spot.id); setClusterSpotIds(undefined) }}><MapPinned /><div><strong>{spot.name}</strong><span>{prefectureName(spot.effectivePrefectureCode)}</span></div><ChevronRight /></button>)}</div></div>}
    {filterOpen && <div className="browse-filter-modal" role="dialog" aria-modal="true" aria-label="地図を絞り込む"><header><button type="button" onClick={() => setFilterOpen(false)} aria-label="絞り込みを閉じる"><X /></button><strong>地図を絞り込む</strong><span /></header><div className="browse-filter-content"><section><h2>期間</h2><div className="filter-option-list period-options">{([['all', 'すべて'], ['year', '今年'], ['past-year', '過去1年'], ['custom', '期間を指定']] as const).map(([value, label]) => <button className={draftFilter.period === value ? 'selected' : ''} type="button" aria-pressed={draftFilter.period === value} key={value} onClick={() => setDraftFilter({ ...draftFilter, period: value })}>{label}</button>)}</div>{draftFilter.period === 'custom' && <DateRangeField startDate={draftFilter.startDate} endDate={draftFilter.endDate} ariaLabel="絞り込み期間を選択" hintLabel="開始日と終了日" emptyLabel="期間をカレンダーから選ぶ" onChange={(startDate, endDate) => setDraftFilter({ ...draftFilter, startDate, endDate })} />}</section><section><h2>誰と行ったか</h2><p>複数選んだ場合は、いずれかに当てはまる旅行を表示します。</p><div className="filter-option-list">{companionCategories.map((category) => <button className={draftFilter.companionCategoryIds.includes(category.id) ? 'selected' : ''} type="button" aria-pressed={draftFilter.companionCategoryIds.includes(category.id)} key={category.id} onClick={() => toggleCompanion(category.id)}>{category.name}</button>)}</div></section></div><footer><button className="secondary" type="button" onClick={() => setDraftFilter(DEFAULT_MAP_FILTER)}>すべて解除</button><button type="button" disabled={invalidCustomRange} onClick={applyFilters}><Check />この条件で表示</button></footer></div>}
  </main>
}
