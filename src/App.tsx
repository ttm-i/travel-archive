import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Database,
  Download,
  Images,
  HardDrive,
  LocateFixed,
  Luggage,
  Map as MapIcon,
  MapPin,
  MapPinned,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { normalizeDigits } from './coordinate'
import { DATABASE_VERSION, db } from './db'
import { CategoryManager, SavedTripDetail, SavedTripEditor, SavedTripsHome } from './components/Phase2Screens'
import { SavedSpotDetail, SpotEditor, SpotEditScreen } from './components/Phase3Screens'
import { Phase4MapHome } from './components/Phase4MapHome'
import { PrefectureDetail, SavedPrefecturesHome } from './components/Phase5Screens'
import { BackupScreen, RestoreScreen, TrashScreen } from './components/Phase6Screens'
import { EdgeSwipeBack } from './components/EdgeSwipeBack'
import { detachVisitFromSpot, moveTripToTrash } from './trashRepository'
import { formatBytes, getDataProtectionStatus, getStorageStatus } from './dataStatus'
import { DEFAULT_MAP_FILTER, DEFAULT_TRIP_SEARCH, type MapFilter, type TripSearchFilter } from './browsingFilters'
import { DEFAULT_MAP_PIN_MIN_ZOOM, describeMapPinZoom, getMapPinMinZoom, MAP_PIN_MAX_ZOOM, MAP_PIN_MIN_ZOOM, MAP_PIN_ZOOM_STEP, saveMapPinMinZoom } from './mapPreferences'
import { restoreScrollAfterRender } from './scrollRestoration'

type Tab = 'map' | 'trips' | 'prefectures' | 'settings'
type View =
  | { name: 'root'; tab: Tab; focusSpotId?: string }
  | { name: 'trip'; id: string; mode?: 'spots' | 'photos' }
  | { name: 'spot'; id: string; fromTripId?: string; fromPrefectureCode?: number; fromMap?: boolean }
  | { name: 'prefecture'; code: number; mode?: 'spots' | 'photos' }
  | { name: 'trip-editor'; id?: string }
  | { name: 'categories'; kind: 'companion' | 'spot' }
  | { name: 'spot-editor'; tripId: string }
  | { name: 'spot-edit'; id: string; contextTripId?: string }
  | { name: 'backup' }
  | { name: 'restore' }
  | { name: 'trash' }
type HistoryEntry = { view: View; activeTab: Tab; scrollY: number }
type RouteMotion = 'none' | 'forward' | 'back' | 'tab' | 'replace'
type BrowsingRoute = { content: React.ReactNode; fallback?: View; swipeBack?: boolean }

function viewLabel(view: View) {
  if (view.name === 'root') return view.tab === 'map' ? '訪問マップ' : view.tab === 'trips' ? '旅行' : view.tab === 'prefectures' ? '都道府県' : '設定'
  if (view.name === 'trip') return '旅行の記録'
  if (view.name === 'spot') return 'スポット'
  if (view.name === 'prefecture') return '都道府県の記録'
  if (view.name === 'trip-editor') return view.id ? '旅行を編集' : '新しい旅行'
  if (view.name === 'spot-editor') return 'スポットを追加'
  if (view.name === 'spot-edit') return 'スポットを編集'
  if (view.name === 'categories') return 'カテゴリ管理'
  if (view.name === 'backup') return 'バックアップ'
  if (view.name === 'restore') return 'バックアップから復元'
  return 'ゴミ箱'
}

function tabForView(view: View, current: Tab): Tab {
  if (view.name === 'root') return view.tab
  if (view.name === 'trip' || view.name === 'trip-editor' || view.name === 'spot-editor') return 'trips'
  if (view.name === 'spot-edit') return current
  if (view.name === 'prefecture') return 'prefectures'
  if (view.name === 'categories') return 'settings'
  return current
}

const trips = [
  { id: 'kyoto', name: '秋の京都、小さな寄り道', date: '2026.11.14 — 11.16', meta: '友人 · 京都府・滋賀県', count: 8, tone: 'kyoto' },
  { id: 'setouchi', name: '瀬戸内の島をめぐる', date: '2026.05.02 — 05.05', meta: '家族 · 香川県・岡山県', count: 12, tone: 'setouchi' },
  { id: 'kanazawa', name: '雪の金沢', date: '2025.12.28 — 12.30', meta: 'パートナー · 石川県', count: 6, tone: 'kanazawa' },
]

const spots = [
  { id: 'temple', name: '南禅寺 水路閣', type: '観光', prefecture: '京都府', tone: 'temple' },
  { id: 'cafe', name: '喫茶ソワレ', type: '食事', prefecture: '京都府', tone: 'cafe' },
  { id: 'lake', name: 'びわ湖テラス', type: '観光', prefecture: '滋賀県', tone: 'lake' },
]

function App() {
  const [view, setView] = useState<View>({ name: 'root', tab: 'map' })
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [mapFilter, setMapFilter] = useState<MapFilter>(DEFAULT_MAP_FILTER)
  const [tripSearch, setTripSearch] = useState<TripSearchFilter>(DEFAULT_TRIP_SEARCH)
  const [tripScrollY, setTripScrollY] = useState(0)
  const [routeMotion, setRouteMotion] = useState<RouteMotion>('none')
  const [routeSequence, setRouteSequence] = useState(0)
  const pendingScrollY = useRef<number | undefined>(undefined)
  const navigationGuard = useRef<(() => boolean) | undefined>(undefined)

  useLayoutEffect(() => {
    if (pendingScrollY.current === undefined) return
    const top = pendingScrollY.current
    pendingScrollY.current = undefined
    return restoreScrollAfterRender(top)
  }, [view, routeSequence])

  const changeView = (motion: RouteMotion, update: () => void) => {
    setRouteMotion(motion)
    setRouteSequence((current) => current + 1)
    update()
  }
  const openTab = (tab: Tab) => {
    if (navigationGuard.current && !navigationGuard.current()) return
    pendingScrollY.current = 0
    changeView('tab', () => { setHistory([]); setActiveTab(tab); setView({ name: 'root', tab }) })
  }
  const navigate = (next: View) => {
    if (navigationGuard.current && !navigationGuard.current()) return
    const scrollY = window.scrollY
    pendingScrollY.current = 0
    changeView('forward', () => {
      setHistory((current) => [...current, { view, activeTab, scrollY }])
      setActiveTab(tabForView(next, activeTab))
      setView(next)
    })
  }
  const replace = (next: View) => {
    pendingScrollY.current = 0
    changeView('replace', () => { setActiveTab(tabForView(next, activeTab)); setView(next) })
  }
  const goBack = (fallback: View, motion: RouteMotion = 'back') => {
    if (navigationGuard.current && !navigationGuard.current()) return
    const previous = history.at(-1)
    pendingScrollY.current = previous?.scrollY ?? 0
    changeView(motion, () => {
      if (!previous) { setActiveTab(tabForView(fallback, activeTab)); setView(fallback); return }
      setHistory((current) => current.slice(0, -1))
      setActiveTab(previous.activeTab)
      setView(previous.view)
    })
  }

  const renderBrowsingView = (target: View, preview = false, historyDepth = history.length): BrowsingRoute | undefined => {
    if (target.name === 'trip' && target.id === 'kyoto') {
      const fallback: View = { name: 'root', tab: 'trips' }
      return { content: <TripDetail back={() => goBack(fallback)} openSpot={(id) => navigate({ name: 'spot', id })} />, fallback, swipeBack: true }
    }
    if (target.name === 'trip') {
      const fallback: View = { name: 'root', tab: 'trips' }
      return { content: <SavedTripDetail id={target.id} mode={target.mode ?? 'spots'} changeMode={(mode) => setView({ ...target, mode })} back={() => goBack(fallback)} edit={() => navigate({ name: 'trip-editor', id: target.id })} remove={() => void (async () => { if (!window.confirm('この旅行をゴミ箱へ移動しますか？スポットは別の旅行から引き続き利用できます。')) return; await moveTripToTrash(target.id); goBack(fallback) })()} addSpot={() => navigate({ name: 'spot-editor', tripId: target.id })} openSpot={(id) => navigate({ name: 'spot', id, fromTripId: target.id })} registerNavigationGuard={preview ? undefined : (guard) => { navigationGuard.current = guard }} />, fallback, swipeBack: true }
    }
    if (target.name === 'prefecture') {
      const fallback: View = { name: 'root', tab: 'prefectures' }
      return { content: <PrefectureDetail code={target.code} mode={target.mode ?? 'spots'} changeMode={(mode) => setView({ ...target, mode })} back={() => goBack(fallback)} openSpot={(id) => navigate({ name: 'spot', id, fromPrefectureCode: target.code })} />, fallback, swipeBack: true }
    }
    if (target.name === 'spot' && ['temple', 'cafe', 'lake'].includes(target.id)) {
      const fallback: View = { name: 'trip', id: 'kyoto' }
      return { content: <SpotDetail back={() => goBack(fallback)} openTrip={() => navigate({ name: 'trip', id: 'kyoto' })} />, fallback, swipeBack: true }
    }
    if (target.name === 'spot') {
      const fallback: View = target.fromTripId
        ? { name: 'trip', id: target.fromTripId }
        : target.fromPrefectureCode
          ? { name: 'prefecture', code: target.fromPrefectureCode }
          : { name: 'root', tab: target.fromMap ? 'map' : 'trips' }
      return { content: <SavedSpotDetail id={target.id} back={() => goBack(fallback)} edit={() => navigate({ name: 'spot-edit', id: target.id, contextTripId: target.fromTripId })} removeVisit={async (visitId) => { const result = await detachVisitFromSpot(visitId); if (result.spotDeleted) goBack({ name: 'root', tab: activeTab }); return result }} openTrip={(id) => navigate({ name: 'trip', id })} openPrefecture={(code) => navigate({ name: 'prefecture', code })} openMap={() => { setMapFilter(DEFAULT_MAP_FILTER); navigate({ name: 'root', tab: 'map', focusSpotId: target.id }) }} />, fallback, swipeBack: true }
    }
    if (target.name !== 'root') return undefined
    return { content: <>
      {target.tab === 'map' && <Phase4MapHome preview={preview} initialSpotId={target.focusSpotId} back={historyDepth ? () => goBack({ name: 'root', tab: 'map' }) : undefined} startFirstTrip={() => navigate({ name: 'trip-editor' })} openSpot={(id) => navigate({ name: 'spot', id, fromMap: true })} openPrefecture={(code) => navigate({ name: 'prefecture', code })} openTrip={(id) => navigate({ name: 'trip', id })} filter={mapFilter} changeFilter={setMapFilter} />}
      {target.tab === 'trips' && <SavedTripsHome openTrip={(id) => navigate({ name: 'trip', id })} add={() => navigate({ name: 'trip-editor' })} filter={tripSearch} changeFilter={setTripSearch} scrollY={preview ? 0 : tripScrollY} rememberScroll={preview ? () => undefined : setTripScrollY} />}
      {target.tab === 'prefectures' && <SavedPrefecturesHome openPrefecture={(code) => navigate({ name: 'prefecture', code })} />}
      {target.tab === 'settings' && <SettingsHome openCategories={(kind) => navigate({ name: 'categories', kind })} openBackup={() => navigate({ name: 'backup' })} openRestore={() => navigate({ name: 'restore' })} openTrash={() => navigate({ name: 'trash' })} />}
    </> }
  }

  const routeStage = (content: React.ReactNode, previewKey?: string) => previewKey
    ? <div key={previewKey} className="route-stage edge-swipe-preview-stage">{content}</div>
    : <div key={routeSequence} className={`route-stage route-${routeMotion}`} data-route-motion={routeMotion}>{content}</div>
  const browsingShell = (route: BrowsingRoute) => {
    const previousEntry = history.at(-1)
    const previousView = previousEntry?.view ?? route.fallback
    const previousRoute = route.swipeBack && previousView
      ? renderBrowsingView(previousView, true, previousEntry ? Math.max(0, history.length - 1) : 0)
      : undefined
    const previousStage = previousRoute && previousView
      ? routeStage(previousRoute.content, `preview-${JSON.stringify(previousView)}`)
      : undefined
    const stage = routeStage(route.content)
    return <div className="app-shell browsing-shell">{route.swipeBack && previousView
      ? <EdgeSwipeBack previous={previousStage} previousLabel={viewLabel(previousView)} previousScrollY={previousEntry?.scrollY ?? 0} back={() => goBack(route.fallback!, 'none')}>{stage}</EdgeSwipeBack>
      : stage}<BottomNav active={activeTab} select={openTab} /></div>
  }
  const standaloneShell = (content: React.ReactNode) => <div className="app-shell standalone-shell">{routeStage(content)}</div>

  const browsingRoute = renderBrowsingView(view)
  if (browsingRoute) return browsingShell(browsingRoute)
  if (view.name === 'trip-editor') return standaloneShell(<SavedTripEditor tripId={view.id} back={() => goBack({ name: 'root', tab: 'trips' })} saved={(id) => replace({ name: 'trip', id })} />)
  if (view.name === 'categories') return standaloneShell(<CategoryManager kind={view.kind} back={() => goBack({ name: 'root', tab: 'settings' })} />)
  if (view.name === 'spot-editor') return standaloneShell(<SpotEditor tripId={view.tripId} back={() => goBack({ name: 'trip', id: view.tripId })} saved={(id) => replace({ name: 'spot', id, fromTripId: view.tripId })} />)
  if (view.name === 'spot-edit') return standaloneShell(<SpotEditScreen spotId={view.id} contextTripId={view.contextTripId} back={() => goBack({ name: 'spot', id: view.id, fromTripId: view.contextTripId })} saved={() => goBack({ name: 'spot', id: view.id, fromTripId: view.contextTripId })} />)
  if (view.name === 'backup') return standaloneShell(<BackupScreen back={() => goBack({ name: 'root', tab: 'settings' })} />)
  if (view.name === 'restore') return standaloneShell(<RestoreScreen back={() => goBack({ name: 'root', tab: 'settings' })} />)
  if (view.name === 'trash') return standaloneShell(<TrashScreen back={() => goBack({ name: 'root', tab: 'settings' })} />)

  return null
}

function AppHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <header className="app-header">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  )
}

function BackHeader({ title, back, action }: { title: string; back: () => void; action?: React.ReactNode }) {
  return (
    <header className="back-header">
      <button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button>
      <strong>{title}</strong>
      <div>{action}</div>
    </header>
  )
}

function MapHome({ openSpot }: { openSpot: (id: string) => void }) {
  const [selected, setSelected] = useState(true)
  return (
    <main className="screen map-home">
      <AppHeader eyebrow="VISITED MAP" title="訪問マップ" action={<button className="icon-button" aria-label="地図メニュー"><MoreHorizontal /></button>} />
      <section className="map-summary">
        <div><strong>7</strong><span>/ 47 都道府県</span></div>
        <p>旅の記憶が、少しずつ地図を彩ります。</p>
      </section>
      <section className="japan-map-card" aria-label="日本地図の操作モック">
        <div className="map-canvas">
          <svg viewBox="0 0 310 410" role="img" aria-label="訪問済み都道府県を色分けした日本地図のモック">
            <g className="map-unvisited">
              <path d="M232 38l28-15 20 11-6 22-31 7-18-10z" />
              <path d="M225 77l28-9 9 17-16 18-25-9z" />
              <path d="M207 102l34 10-8 24-31 4-13-16z" />
              <path d="M191 139l38 5-2 25-36 7-16-17z" />
              <path d="M169 170l52 10-8 26-38 2-19-18z" />
              <path d="M146 205l57 11-6 27-51 6-17-22z" />
              <path d="M122 244l62 10-7 28-50 5-21-21z" />
              <path d="M86 282l74 9-10 24-54 10-25-18z" />
              <path d="M43 321l61 8-12 26-44 9-24-18z" />
              <path d="M21 369l35 3-6 20-31-1z" />
            </g>
            <g className="map-visited">
              <path d="M151 252l28 5-4 20-28 3-12-13z" />
              <path d="M122 286l35 7-9 20-31 5-10-17z" />
              <path d="M91 326l28 4-8 22-26 5-10-15z" />
            </g>
            <g className="map-markers">
              <circle cx="160" cy="266" r="7" onClick={() => setSelected(true)} />
              <circle cx="135" cy="301" r="5" />
              <circle cx="101" cy="341" r="5" />
            </g>
          </svg>
          <div className="map-controls"><button aria-label="拡大">＋</button><button aria-label="縮小">−</button></div>
          <div className="map-legend"><i />訪れた都道府県</div>
        </div>
        {selected && (
          <button className="map-spot-sheet" type="button" onClick={() => openSpot('temple')}>
            <div className="photo photo-temple" />
            <div><span>京都府 · 観光</span><strong>南禅寺 水路閣</strong><small>2回の旅行で訪問</small></div>
            <ChevronRight />
          </button>
        )}
      </section>
    </main>
  )
}

function TripsHome({ openTrip, add }: { openTrip: (id: string) => void; add: () => void }) {
  return (
    <main className="screen">
      <AppHeader eyebrow="JOURNEYS" title="旅行" action={<button className="round-add" type="button" onClick={add} aria-label="旅行を追加"><Plus /></button>} />
      <section className="quiet-banner"><Sparkles /><span>これまでに<strong>3回</strong>の旅を記録しました</span></section>
      <div className="trip-list">
        {trips.map((trip, index) => (
          <button className="trip-card" type="button" key={trip.id} onClick={() => openTrip(trip.id)}>
            <div className={`trip-cover photo-${trip.tone}`}><span>{String(index + 1).padStart(2, '0')}</span></div>
            <div className="trip-card-copy">
              <span>{trip.date}</span>
              <h2>{trip.name}</h2>
              <p>{trip.meta}</p>
              <small>{trip.count} SPOTS</small>
            </div>
            <ChevronRight />
          </button>
        ))}
      </div>
    </main>
  )
}

function PrefecturesHome({ openSpot }: { openSpot: (id: string) => void }) {
  const prefectures = [
    { name: '京都府', count: 9, tone: 'temple', spot: 'temple' },
    { name: '石川県', count: 6, tone: 'kanazawa', spot: 'cafe' },
    { name: '香川県', count: 5, tone: 'setouchi', spot: 'lake' },
    { name: '滋賀県', count: 3, tone: 'lake', spot: 'lake' },
  ]
  return (
    <main className="screen">
      <AppHeader eyebrow="PREFECTURES" title="都道府県" />
      <div className="prefecture-grid">
        {prefectures.map((item) => (
          <button key={item.name} className="prefecture-card" type="button" onClick={() => openSpot(item.spot)}>
            <div className={`prefecture-photo photo-${item.tone}`} />
            <div><strong>{item.name}</strong><span>{item.count}スポット</span></div>
          </button>
        ))}
      </div>
      <section className="empty-prefectures"><Compass /><div><strong>まだ見ぬ40都道府県</strong><span>次の旅で、地図に新しい色を。</span></div></section>
    </main>
  )
}

function SettingsHome({ openCategories, openBackup, openRestore, openTrash }: { openCategories: (kind: 'companion' | 'spot') => void; openBackup: () => void; openRestore: () => void; openTrash: () => void }) {
  const databaseVersion = useLiveQuery(async () => (await db.metadata.get('databaseVersion'))?.value)
  const localRecordCount = useLiveQuery(async () => {
    const [tripsCount, spotsCount, imagesCount] = await Promise.all([
      db.trips.count(),
      db.spots.count(),
      db.images.count(),
    ])
    return tripsCount + spotsCount + imagesCount
  }, [], 0)
  const protection = useLiveQuery(getDataProtectionStatus, [], { hasUserData: false, hasUnbackedChanges: false, lastBackupAt: undefined, latestChangeAt: undefined })
  const storage = useLiveQuery(getStorageStatus, [], { photoBytes: 0, usageBytes: undefined, quotaBytes: undefined, remainingBytes: undefined, nearLimit: false })
  const storageDetail = storage.usageBytes !== undefined && storage.quotaBytes
    ? `${formatBytes(storage.usageBytes)} / ${formatBytes(storage.quotaBytes)}`
    : `写真 ${formatBytes(storage.photoBytes)}`

  return (
    <main className="screen">
      <AppHeader eyebrow="PREFERENCES" title="設定" />
      <section className="settings-status"><ShieldCheck /><div><span>端末内保存</span><strong>あなたの記録はこのiPhoneにあります</strong></div></section>
      {protection.hasUnbackedChanges && <button className="backup-reminder" type="button" onClick={openBackup}><AlertTriangle /><div><strong>バックアップしていない変更があります</strong><span>「ファイル」またはiCloud Driveへ保存しておくと安心です。</span></div><ChevronRight /></button>}
      {storage.nearLimit && <section className="storage-warning" role="status"><AlertTriangle /><div><strong>保存できる容量が少なくなっています</strong><span>バックアップ後、不要な写真やWebサイトデータを整理してください。</span></div></section>}
      <div className="settings-group">
        <h2>整理</h2>
        <SettingRow icon={<Users />} label="同行カテゴリ" detail="作成・編集" onClick={() => openCategories('companion')} />
        <SettingRow icon={<MapPin />} label="スポットカテゴリ" detail="作成・編集" onClick={() => openCategories('spot')} />
      </div>
      <div className="settings-group">
        <h2>地図表示</h2>
        <MapPinZoomSetting />
      </div>
      <div className="settings-group">
        <h2>データ管理</h2>
        <SettingRow icon={<Download />} label="バックアップを作成" detail={protection.lastBackupAt ? new Date(protection.lastBackupAt).toLocaleDateString('ja-JP') : '未作成'} onClick={openBackup} />
        <SettingRow icon={<Upload />} label="バックアップから復元" onClick={openRestore} />
        <SettingRow icon={<Trash2 />} label="ゴミ箱" onClick={openTrash} />
        <SettingRow icon={<HardDrive />} label="使用中の保存容量" detail={storageDetail} />
        <SettingRow icon={<Database />} label="端末内データベース" detail={databaseVersion === DATABASE_VERSION ? `v${DATABASE_VERSION} · 準備済み` : '準備中…'} />
      </div>
      <p className="local-data-note">現在の保存データ {localRecordCount}件 · サンプル表示は保存件数に含まれません</p>
      <p className="prototype-note">TRAVEL ARCHIVE · OFFLINE FIRST</p>
    </main>
  )
}

function MapPinZoomSetting() {
  const savedValue = useLiveQuery(getMapPinMinZoom, [], DEFAULT_MAP_PIN_MIN_ZOOM)
  const [value, setValue] = useState(savedValue)
  useEffect(() => setValue(savedValue), [savedValue])

  const change = (next: number) => {
    setValue(next)
    void saveMapPinMinZoom(next)
  }

  return <section className="map-zoom-setting">
    <div><i><MapIcon /></i><div><strong>ピンを表示するタイミング</strong><span>地図をどこまで拡大したら表示するか</span></div></div>
    <div className="map-zoom-current"><strong>{describeMapPinZoom(value)}</strong><span>倍率 {value.toFixed(1)}</span></div>
    <input type="range" min={MAP_PIN_MIN_ZOOM} max={MAP_PIN_MAX_ZOOM} step={MAP_PIN_ZOOM_STEP} value={value} aria-label="ピンを表示する倍率" aria-valuetext={describeMapPinZoom(value)} onChange={(event) => change(Number(event.target.value))} />
    <div className="map-zoom-labels"><span>早く表示</span><span>近づいてから表示</span></div>
  </section>
}

function SettingRow({ icon, label, detail, onClick }: { icon: React.ReactNode; label: string; detail?: string; onClick?: () => void }) {
  const content = <><i>{icon}</i><strong>{label}</strong>{detail && <span>{detail}</span>}{onClick && <ChevronRight />}</>
  return onClick
    ? <button className="setting-row" type="button" onClick={onClick}>{content}</button>
    : <div className="setting-row setting-row-static">{content}</div>
}

function TripDetail({ back, openSpot }: { back: () => void; openSpot: (id: string) => void }) {
  return (
    <main className="screen sub-screen">
      <BackHeader title="旅行の記録" back={back} action={<button className="text-action">編集</button>} />
      <section className="trip-hero photo-kyoto"><div><span>2026.11.14 — 11.16</span><h1>秋の京都、<br />小さな寄り道</h1></div></section>
      <section className="trip-facts">
        <div><CalendarDays /><span>3日間</span></div><div><Users /><span>友人</span></div><div><MapPinned /><span>2府県</span></div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><span>PLACES</span><h2>訪れたスポット</h2></div><small>8件</small></div>
        <div className="spot-list">
          {spots.map((spot) => (
            <button type="button" key={spot.id} onClick={() => openSpot(spot.id)}>
              <div className={`photo photo-${spot.tone}`} />
              <div><strong>{spot.name}</strong><span>{spot.prefecture} · {spot.type}</span></div><ChevronRight />
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function SpotDetail({ back, openTrip }: { back: () => void; openTrip: () => void }) {
  return (
    <main className="screen sub-screen">
      <BackHeader title="スポット" back={back} action={<button className="icon-button"><MoreHorizontal /></button>} />
      <section className="spot-gallery">
        <div className="photo photo-temple" />
        <div className="gallery-count"><Images />1 / 4</div>
      </section>
      <section className="spot-title-block"><span>京都府 · 観光</span><h1>南禅寺 水路閣</h1><p>35.01127, 135.79315</p></section>
      <section className="mini-map">
        <div className="contour contour-a" /><div className="contour contour-b" /><div className="contour contour-c" />
        <div className="single-pin"><MapPin /></div>
        <button type="button">日本地図で見る<ChevronRight /></button>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><span>VISITED ON</span><h2>訪れた旅行</h2></div><small>2回</small></div>
        <button className="visit-row" type="button" onClick={openTrip}><CalendarDays /><div><strong>秋の京都、小さな寄り道</strong><span>2026.11.14 — 11.16</span></div><ChevronRight /></button>
        <button className="visit-row" type="button"><CalendarDays /><div><strong>初夏の京都散歩</strong><span>2024.06.08 — 06.09</span></div><ChevronRight /></button>
      </section>
    </main>
  )
}

function TripEditor({ back, chooseCoordinate }: { back: () => void; chooseCoordinate: () => void }) {
  const [companions, setCompanions] = useState(['友人'])
  const toggle = (value: string) => setCompanions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  return (
    <main className="screen sub-screen editor-screen">
      <BackHeader title="新しい旅行" back={back} action={<span className="step-count">1 / 2</span>} />
      <section className="editor-intro"><span>NEW JOURNEY</span><h1>どんな旅でしたか？</h1><p>まずは旅の輪郭を記録しましょう。</p></section>
      <div className="form-stack">
        <label className="field"><span>旅行名</span><input defaultValue="秋の京都、小さな寄り道" /></label>
        <div className="field"><span>誰と行きましたか？</span><div className="chip-row">{['一人', '家族', '友人', 'パートナー'].map((item) => <button className={companions.includes(item) ? 'selected' : ''} type="button" aria-pressed={companions.includes(item)} key={item} onClick={() => toggle(item)}>{item}</button>)}</div></div>
        <div className="field"><span>いつ行きましたか？</span><div className="date-pair"><label><small>出発</small><input type="date" defaultValue="2026-11-14" /></label><i>—</i><label><small>帰宅</small><input type="date" defaultValue="2026-11-16" /></label></div></div>
        <div className="field"><span>訪れた都道府県</span><div className="chip-row"><button className="selected" aria-pressed="true">京都府</button><button className="selected" aria-pressed="true">滋賀県</button><button><Plus />追加</button></div></div>
      </div>
      <section className="draft-spot">
        <div className="draft-spot-heading"><div><span>SPOTS</span><strong>スポットを追加</strong></div><small>1件以上必要です</small></div>
        <button type="button" onClick={chooseCoordinate}><MapPin /><div><strong>位置からスポットを登録</strong><span>地図または座標から指定</span></div><ChevronRight /></button>
      </section>
      <div className="sticky-action"><button type="button" onClick={chooseCoordinate}>スポット登録へ<ChevronRight /></button></div>
    </main>
  )
}

function CoordinatePicker({ back, done }: { back: () => void; done: () => void }) {
  const [mode, setMode] = useState<'map' | 'direct'>('direct')
  const [latWhole, setLatWhole] = useState('35')
  const [latFraction, setLatFraction] = useState('68124')
  const [lngWhole, setLngWhole] = useState('139')
  const [lngFraction, setLngFraction] = useState('76712')
  const [mapPoint, setMapPoint] = useState({ x: 52, y: 45 })
  const latFractionRef = useRef<HTMLInputElement>(null)
  const lngWholeRef = useRef<HTMLInputElement>(null)
  const lngFractionRef = useRef<HTMLInputElement>(null)

  const complete = latWhole.length === 2 && latFraction.length === 5 && lngWhole.length === 3 && lngFraction.length === 5
  const formatted = useMemo(() => complete ? `${latWhole}.${latFraction}, ${lngWhole}.${lngFraction}` : '入力を完成してください', [complete, latWhole, latFraction, lngWhole, lngFraction])

  const numberInput = (setter: (value: string) => void, max: number, next?: React.RefObject<HTMLInputElement | null>) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeDigits(event.target.value).replace(/\D/g, '').slice(0, max)
    setter(value)
    if (value.length === max) requestAnimationFrame(() => next?.current?.focus())
  }
  const updateMapPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMapPoint({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 })
  }

  return (
    <main className="screen sub-screen coordinate-screen">
      <BackHeader title="位置を指定" back={back} action={<button className="close-button" onClick={back}><X /></button>} />
      <div className="segmented-control"><button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}><MapIcon />地図から</button><button className={mode === 'direct' ? 'active' : ''} onClick={() => setMode('direct')}><LocateFixed />座標を入力</button></div>

      {mode === 'direct' ? (
        <>
          <section className="coordinate-copy"><span>DECIMAL DEGREES</span><h1>位置を数字で入力</h1><p>小数点は入力不要です。5桁ずつ数字を入れてください。</p></section>
          <section className="coordinate-form">
            <div className="coordinate-row">
              <label><span>緯度</span><small>LATITUDE</small></label>
              <div className="split-coordinate"><input aria-label="緯度の整数部" inputMode="numeric" value={latWhole} onChange={numberInput(setLatWhole, 2, latFractionRef)} /><b>.</b><input ref={latFractionRef} aria-label="緯度の小数部" inputMode="numeric" value={latFraction} onChange={numberInput(setLatFraction, 5, lngWholeRef)} /><em>{latFraction.length}/5</em></div>
            </div>
            <div className="coordinate-row">
              <label><span>経度</span><small>LONGITUDE</small></label>
              <div className="split-coordinate longitude"><input ref={lngWholeRef} aria-label="経度の整数部" inputMode="numeric" value={lngWhole} onChange={numberInput(setLngWhole, 3, lngFractionRef)} /><b>.</b><input ref={lngFractionRef} aria-label="経度の小数部" inputMode="numeric" value={lngFraction} onChange={numberInput(setLngFraction, 5)} /><em>{lngFraction.length}/5</em></div>
            </div>
          </section>
          <section className="coordinate-preview">
            <div className="preview-map"><div className="preview-grid" /><MapPin /></div>
            <div><span>判定された都道府県</span><strong>{complete ? '東京都' : '—'}</strong><small>{formatted}</small></div>
          </section>
        </>
      ) : (
        <section className="picker-map-wrap">
          <div className="picker-map" onClick={updateMapPoint}>
            <div className="map-lines line-a" /><div className="map-lines line-b" /><div className="map-lines line-c" />
            <div className="water-label">琵琶湖</div><div className="city-label city-a">京都</div><div className="city-label city-b">大津</div>
            <div className="selected-dot" style={{ left: `${mapPoint.x}%`, top: `${mapPoint.y}%` }} />
            <div className="crosshair"><i /><b /></div>
            <div className="map-hint">地図を動かして照準に合わせます</div>
          </div>
          <div className="map-coordinate-result"><div><span>選択中の位置</span><strong>京都府</strong><small>35.01127, 135.79315</small></div><button type="button">拡大＋</button></div>
        </section>
      )}
      <div className="sticky-action coordinate-confirm"><button type="button" disabled={mode === 'direct' && !complete} onClick={done}><Check />この位置に決定</button></div>
    </main>
  )
}

function BottomNav({ active, select }: { active: Tab; select: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'map', label: '地図', icon: <MapIcon /> },
    { id: 'trips', label: '旅行', icon: <Luggage /> },
    { id: 'prefectures', label: '都道府県', icon: <MapPinned /> },
    { id: 'settings', label: '設定', icon: <Settings /> },
  ]
  return <nav className="bottom-nav" aria-label="メインメニュー">{items.map((item) => <button type="button" key={item.id} className={active === item.id ? 'active' : ''} aria-current={active === item.id ? 'page' : undefined} onClick={() => select(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
}

export default App

