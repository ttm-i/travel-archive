import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Luggage,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { db } from '../db'
import { DEFAULT_CROP, loadTripCoverDraft, resolveTripCover, saveTripCover, type TripCoverDraft } from '../coverRepository'
import { storageErrorMessage } from '../dataStatus'
import { PREFECTURES, prefectureName } from '../prefectures'
import { getTripSpots } from '../spotRepository'
import { BlobImage, CroppedBlobImage } from './BlobImage'
import { TripCoverEditor } from './TripCoverEditor'
import { DEFAULT_TRIP_SEARCH, spotMatchesTripSearch, tripSearchCount, UNCATEGORIZED, type TripSearchFilter } from '../browsingFilters'
import {
  addCompanionCategory,
  addSpotCategory,
  clearTripDraft,
  deleteCompanionCategory,
  deleteSpotCategory,
  getTripInput,
  loadTripDraft,
  moveCategory,
  renameCompanionCategory,
  renameSpotCategory,
  saveTrip,
  saveTripDraft,
  validateTrip,
  type TripDraft,
} from '../travelRepository'

const emptyDraft = (): TripDraft => ({ name: '', companionCategoryIds: [], startDate: '', endDate: '', prefectureCodes: [] })
const emptyCoverDraft = (): TripCoverDraft => ({ kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })

function BackHeader({ title, back, action }: { title: string; back: () => void; action?: React.ReactNode }) {
  return <header className="back-header"><button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button><strong>{title}</strong><div>{action}</div></header>
}

export function CategoryManager({ kind, back }: { kind: 'companion' | 'spot'; back: () => void }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [editingName, setEditingName] = useState('')
  const [message, setMessage] = useState('')
  const categories = useLiveQuery(
    () => (kind === 'companion' ? db.companionCategories : db.spotCategories).orderBy('sortOrder').toArray(),
    [kind],
    [],
  )
  const usageResult = useLiveQuery(async () => {
    const pairs = await Promise.all(categories.map(async (category) => [
      category.id,
      kind === 'companion'
        ? await db.tripCompanionCategories.where('categoryId').equals(category.id).count()
        : await db.spots.where('spotCategoryId').equals(category.id).count(),
    ] as const))
    return Object.fromEntries(pairs) as Record<string, number>
  }, [kind, categories]) as Record<string, number> | undefined
  const usage = usageResult ?? {}

  const add = async () => {
    try {
      if (kind === 'companion') await addCompanionCategory(newName)
      else await addSpotCategory(newName)
      setNewName(''); setMessage('追加しました')
    } catch (error) { setMessage(error instanceof Error ? error.message : '追加できませんでした') }
  }
  const rename = async (id: string) => {
    try {
      if (kind === 'companion') await renameCompanionCategory(id, editingName)
      else await renameSpotCategory(id, editingName)
      setEditingId(undefined); setMessage('名称を変更しました')
    } catch (error) { setMessage(error instanceof Error ? error.message : '変更できませんでした') }
  }
  const remove = async (id: string, name: string) => {
    const count = usage[id] ?? 0
    const detail = count ? `\n${count}件の${kind === 'companion' ? '旅行との関連が外れます' : 'スポットが未分類になります'}。` : ''
    if (!window.confirm(`「${name}」を削除しますか？${detail}`)) return
    if (kind === 'companion') await deleteCompanionCategory(id)
    else await deleteSpotCategory(id)
    setMessage('削除しました')
  }

  const title = kind === 'companion' ? '同行カテゴリ' : 'スポットカテゴリ'
  return (
    <main className="screen sub-screen category-screen">
      <BackHeader title={title} back={back} />
      <section className="editor-intro"><span>CATEGORIES</span><h1>{title}を整理</h1><p>自分に合う分類を作り、表示順も変更できます。</p></section>
      <form className="category-add" onSubmit={(event) => { event.preventDefault(); void add() }}>
        <input aria-label="新しいカテゴリ名" value={newName} maxLength={30} placeholder={kind === 'companion' ? '例：学生時代の友人' : '例：温泉'} onChange={(event) => setNewName(event.target.value)} />
        <button type="submit"><Plus />追加</button>
      </form>
      {message && <p className="form-message" role="status">{message}</p>}
      <section className="category-list">
        {categories.map((category, index) => (
          <article className="category-item" key={category.id}>
            {editingId === category.id ? (
              <form className="category-edit" onSubmit={(event) => { event.preventDefault(); void rename(category.id) }}>
                <input aria-label={`${category.name}の新しい名前`} autoFocus value={editingName} maxLength={30} onChange={(event) => setEditingName(event.target.value)} />
                <button type="submit" aria-label="変更を保存"><Check /></button>
                <button type="button" aria-label="変更を中止" onClick={() => setEditingId(undefined)}><X /></button>
              </form>
            ) : (
              <>
                <div><strong>{category.name}</strong><span>{usage[category.id] ?? 0}件で使用</span></div>
                <div className="category-actions">
                  <button type="button" disabled={index === 0} aria-label={`${category.name}を上へ`} onClick={() => void moveCategory(kind, category.id, -1)}><ArrowUp /></button>
                  <button type="button" disabled={index === categories.length - 1} aria-label={`${category.name}を下へ`} onClick={() => void moveCategory(kind, category.id, 1)}><ArrowDown /></button>
                  <button type="button" aria-label={`${category.name}の名前を変更`} onClick={() => { setEditingId(category.id); setEditingName(category.name) }}><Edit3 /></button>
                  <button type="button" aria-label={`${category.name}を削除`} onClick={() => void remove(category.id, category.name)}><Trash2 /></button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}

export function SavedTripsHome({ openTrip, add, filter, changeFilter, scrollY, rememberScroll }: { openTrip: (id: string) => void; add: () => void; filter: TripSearchFilter; changeFilter: (filter: TripSearchFilter) => void; scrollY: number; rememberScroll: (value: number) => void }) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState<string[]>(filter.spotCategoryIds)
  const trips = useLiveQuery(() => db.trips.filter((trip) => !trip.deletedAt).reverse().sortBy('startDate'), [], [])
  const spotCategories = useLiveQuery(() => db.spotCategories.orderBy('sortOrder').toArray(), [], [])
  const details = useLiveQuery(async () => Promise.all(trips.map(async (trip) => {
    const [companionLinks, prefectureLinks] = await Promise.all([
      db.tripCompanionCategories.where('tripId').equals(trip.id).toArray(),
      db.tripPrefectures.where('tripId').equals(trip.id).toArray(),
    ])
    const companionNames = (await db.companionCategories.bulkGet(companionLinks.map((link) => link.categoryId))).flatMap((category) => category ? [category.name] : [])
    const tripSpots = await getTripSpots(trip.id)
    const cover = await resolveTripCover(trip)
    return { ...trip, companionNames, prefectureCodes: prefectureLinks.map((link) => link.prefectureCode), tripSpots, cover }
  })), [trips], [])
  const activeFilterCount = tripSearchCount(filter)
  const visibleTrips = useMemo(() => details.flatMap((trip) => {
    const matchedSpots = trip.tripSpots.filter(({ spot }) => spotMatchesTripSearch(spot, filter))
    return activeFilterCount && !matchedSpots.length ? [] : [{ ...trip, matchedSpots }]
  }), [details, filter, activeFilterCount])

  useEffect(() => {
    if (scrollY) requestAnimationFrame(() => window.scrollTo({ top: scrollY }))
    return () => rememberScroll(window.scrollY)
  }, [])

  const openCategories = () => { setCategoryDraft(filter.spotCategoryIds); setCategoryOpen(true) }
  const toggleCategory = (id: string) => setCategoryDraft((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const reset = () => changeFilter(DEFAULT_TRIP_SEARCH)

  return (
    <main className="screen">
      <header className="app-header"><div><span>JOURNEYS</span><h1>旅行</h1></div><button className="round-add" type="button" onClick={add} aria-label="旅行を追加"><Plus /></button></header>
      {details.length ? <section className="trip-search-panel"><label><Search /><input type="search" value={filter.query} placeholder="スポット名で旅行を検索" aria-label="スポット名で旅行を検索" onChange={(event) => changeFilter({ ...filter, query: event.target.value })} /></label><button className={filter.spotCategoryIds.length ? 'active' : ''} type="button" onClick={openCategories}><SlidersHorizontal />カテゴリ{filter.spotCategoryIds.length ? ` ${filter.spotCategoryIds.length}` : ''}</button></section> : null}
      {activeFilterCount ? <section className="browse-result-summary"><span><strong>{visibleTrips.length}件</strong>の旅行が該当</span><button type="button" onClick={reset}><RotateCcw />条件を解除</button></section> : details.length ? <section className="quiet-banner"><Luggage /><span>端末内に<strong>{details.length}件</strong>の旅を保存しています</span></section> : null}
      {visibleTrips.length ? (
        <div className="trip-list">
          {visibleTrips.map((trip, index) => (
            <button className="trip-card saved-trip-card" type="button" key={trip.id} onClick={() => { rememberScroll(window.scrollY); openTrip(trip.id) }}>
              {trip.cover ? <div className="trip-cover"><CroppedBlobImage blob={trip.cover.thumbnailBlob} alt={trip.name} crop={trip.cover.listCrop} /><span>{String(index + 1).padStart(2, '0')}</span></div> : <div className={`trip-cover saved-cover cover-${index % 4}`}><CalendarDays /><span>{String(index + 1).padStart(2, '0')}</span></div>}
              <div className="trip-card-copy"><span>{formatDateRange(trip.startDate, trip.endDate)}</span><h2>{trip.name}</h2><p>{trip.companionNames.join('・')} · {trip.prefectureCodes.map(prefectureName).join('・')}</p>{activeFilterCount ? <small className="matched-spots">該当 {trip.matchedSpots.length}件 · {trip.matchedSpots.slice(0, 3).map(({ spot }) => spot.name).join('・')}{trip.matchedSpots.length > 3 ? ' ほか' : ''}</small> : <small>{trip.tripSpots.length ? `${trip.tripSpots.length} SPOTS` : 'スポット未登録'}</small>}</div><ChevronRight />
            </button>
          ))}
        </div>
      ) : details.length ? (
        <section className="browse-empty"><Search /><h2>条件に合う旅行がありません</h2><p>スポット名やカテゴリを変えてお試しください。</p><button type="button" onClick={reset}><RotateCcw />条件を解除</button></section>
      ) : (
        <section className="empty-trips"><Luggage /><h2>最初の旅行を記録しましょう</h2><p>旅行名、日付、同行カテゴリ、都道府県をiPhone内に保存できます。</p><button type="button" onClick={add}><Plus />ここから始める</button></section>
      )}
      {categoryOpen && <div className="browse-filter-modal" role="dialog" aria-modal="true" aria-label="スポットカテゴリで絞り込み"><header><button type="button" onClick={() => setCategoryOpen(false)} aria-label="絞り込みを閉じる"><X /></button><strong>スポットカテゴリ</strong><span /></header><div className="browse-filter-content"><p>いずれかのカテゴリに当てはまるスポットを含む旅行を表示します。</p><div className="filter-option-list">{spotCategories.map((category) => <button className={categoryDraft.includes(category.id) ? 'selected' : ''} type="button" aria-pressed={categoryDraft.includes(category.id)} key={category.id} onClick={() => toggleCategory(category.id)}>{category.name}</button>)}<button className={categoryDraft.includes(UNCATEGORIZED) ? 'selected' : ''} type="button" aria-pressed={categoryDraft.includes(UNCATEGORIZED)} onClick={() => toggleCategory(UNCATEGORIZED)}>未分類</button></div></div><footer><button className="secondary" type="button" onClick={() => setCategoryDraft([])}>すべて解除</button><button type="button" onClick={() => { changeFilter({ ...filter, spotCategoryIds: categoryDraft }); setCategoryOpen(false) }}><Check />この条件で表示</button></footer></div>}
    </main>
  )
}

export function SavedTripDetail({ id, back, edit, remove, addSpot, openSpot }: { id: string; back: () => void; edit: () => void; remove: () => void; addSpot: () => void; openSpot: (id: string) => void }) {
  const trip = useLiveQuery(() => db.trips.get(id), [id])
  const details = useLiveQuery(async () => {
    const [companionLinks, prefectureLinks] = await Promise.all([
      db.tripCompanionCategories.where('tripId').equals(id).toArray(),
      db.tripPrefectures.where('tripId').equals(id).toArray(),
    ])
    const companionNames = (await db.companionCategories.bulkGet(companionLinks.map((link) => link.categoryId))).flatMap((category) => category ? [category.name] : [])
    return { companionNames, prefectureCodes: prefectureLinks.map((link) => link.prefectureCode) }
  }, [id], { companionNames: [], prefectureCodes: [] })
  const tripSpots = useLiveQuery(() => getTripSpots(id), [id], [])
  const cover = useLiveQuery(() => trip ? resolveTripCover(trip) : Promise.resolve(undefined), [trip])
  if (!trip) return <main className="screen sub-screen"><BackHeader title="旅行の記録" back={back} /><p className="loading-note">旅行を読み込んでいます…</p></main>
  const days = Math.round((new Date(`${trip.endDate}T00:00:00`).getTime() - new Date(`${trip.startDate}T00:00:00`).getTime()) / 86400000) + 1
  return (
    <main className="screen sub-screen">
      <BackHeader title="旅行の記録" back={back} action={<><button className="header-trash" type="button" onClick={remove} aria-label="旅行をゴミ箱へ移動"><Trash2 /></button><button className="text-action" type="button" onClick={edit}>編集</button></>} />
      <section className={`saved-trip-hero ${cover ? 'has-cover' : ''}`}>{cover && <CroppedBlobImage blob={cover.imageBlob} alt={`${trip.name}の表紙`} crop={cover.heroCrop} />}<div><span>{formatDateRange(trip.startDate, trip.endDate)}</span><h1>{trip.name}</h1></div></section>
      <section className="trip-facts"><div><CalendarDays /><span>{days}日間</span></div><div><Users /><span>{details.companionNames.join('・')}</span></div><div><MapPin /><span>{details.prefectureCodes.length}都道府県</span></div></section>
      <section className="saved-trip-meta"><h2>訪れた都道府県</h2><div className="chip-row">{details.prefectureCodes.map((code) => <span className="read-chip" key={code}>{prefectureName(code)}</span>)}</div></section>
      <section className="content-section">
        <div className="section-heading"><div><span>PLACES</span><h2>訪れたスポット</h2></div><button className="section-add" type="button" onClick={addSpot}><Plus />追加</button></div>
        {tripSpots.length ? <div className="spot-list">{tripSpots.map(({ spot, imageId, thumbnailBlob }) => <button type="button" key={spot.id} onClick={() => openSpot(spot.id)}><BlobImage blob={thumbnailBlob} imageKey={imageId ? `${imageId}:thumbnail` : undefined} alt={spot.name} /><div><strong>{spot.name}</strong><span>{prefectureName(spot.effectivePrefectureCode)}</span></div><ChevronRight /></button>)}</div> : <button className="empty-spot-button" type="button" onClick={addSpot}><MapPin /><div><strong>最初のスポットを追加</strong><span>座標と写真を端末内に保存します</span></div><ChevronRight /></button>}
      </section>
    </main>
  )
}

export function SavedTripEditor({ tripId, back, saved }: { tripId?: string; back: () => void; saved: (id: string) => void }) {
  const categories = useLiveQuery(() => db.companionCategories.orderBy('sortOrder').toArray(), [], [])
  const [draft, setDraft] = useState<TripDraft>(emptyDraft)
  const [hydrated, setHydrated] = useState(false)
  const [showPrefectures, setShowPrefectures] = useState(false)
  const [message, setMessage] = useState('')
  const [coverDraft, setCoverDraft] = useState<TripCoverDraft>(emptyCoverDraft)

  useEffect(() => {
    let active = true
    void Promise.all([tripId ? getTripInput(tripId) : loadTripDraft(), tripId ? loadTripCoverDraft(tripId) : Promise.resolve(emptyCoverDraft())]).then(([value, cover]) => {
      if (!active) return
      setDraft(value ?? { ...emptyDraft(), tripId })
      setCoverDraft(cover)
      setHydrated(true)
    })
    return () => { active = false }
  }, [tripId])

  useEffect(() => {
    if (!hydrated || tripId) return
    const timer = window.setTimeout(() => void saveTripDraft(draft), 250)
    return () => window.clearTimeout(timer)
  }, [draft, hydrated, tripId])

  const validation = useMemo(() => validateTrip(draft), [draft])
  const toggleCompanion = (id: string) => setDraft((current) => ({ ...current, companionCategoryIds: current.companionCategoryIds.includes(id) ? current.companionCategoryIds.filter((value) => value !== id) : [...current.companionCategoryIds, id] }))
  const togglePrefecture = (code: number) => setDraft((current) => ({ ...current, prefectureCodes: current.prefectureCodes.includes(code) ? current.prefectureCodes.filter((value) => value !== code) : [...current.prefectureCodes, code].sort((a, b) => a - b) }))
  const submit = async () => {
    try { const id = await saveTrip(draft); await saveTripCover(id, coverDraft); saved(id) }
    catch (error) { setMessage(storageErrorMessage(error, '保存できませんでした')) }
  }
  const cancelDraft = async () => {
    if (!tripId && hasDraftContent(draft) && !window.confirm('入力中の下書きを破棄して戻りますか？')) return
    if (!tripId) await clearTripDraft()
    back()
  }

  return (
    <main className="screen sub-screen editor-screen">
      <BackHeader title={tripId ? '旅行を編集' : '新しい旅行'} back={() => void cancelDraft()} action={<span className="step-count">基本情報</span>} />
      <section className="editor-intro"><span>NEW JOURNEY</span><h1>どんな旅でしたか？</h1><p>入力内容は下書きとして、このiPhoneに自動保存されます。</p></section>
      <div className="form-stack">
        <label className="field"><span>旅行名（必須）</span><input value={draft.name} maxLength={80} placeholder="例：秋の京都、小さな寄り道" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <div className="field"><span>誰と行きましたか？（1件以上）</span><div className="chip-row">{categories.map((item) => <button className={draft.companionCategoryIds.includes(item.id) ? 'selected' : ''} type="button" aria-pressed={draft.companionCategoryIds.includes(item.id)} key={item.id} onClick={() => toggleCompanion(item.id)}>{item.name}</button>)}</div></div>
        <div className="field"><span>いつ行きましたか？</span><DateRangeField startDate={draft.startDate} endDate={draft.endDate} onChange={(startDate, endDate) => setDraft({ ...draft, startDate, endDate })} /></div>
        <div className="field"><span>訪れた都道府県（1件以上）</span><div className="selected-prefectures">{draft.prefectureCodes.map((code) => <button type="button" key={code} onClick={() => togglePrefecture(code)}>{prefectureName(code)}<X /></button>)}</div><button className="prefecture-toggle" type="button" onClick={() => setShowPrefectures(!showPrefectures)}><Plus />{showPrefectures ? '選択画面を閉じる' : '都道府県を選ぶ'}</button>{showPrefectures && <div className="prefecture-picker">{PREFECTURES.map((name, index) => <button className={draft.prefectureCodes.includes(index + 1) ? 'selected' : ''} type="button" aria-pressed={draft.prefectureCodes.includes(index + 1)} key={name} onClick={() => togglePrefecture(index + 1)}>{name}</button>)}</div>}</div>
      </div>
      <TripCoverEditor tripId={tripId} draft={coverDraft} change={setCoverDraft} error={setMessage} />
      {message && <p className="form-error" role="alert">{message}</p>}
      <div className="sticky-action save-trip-action"><button type="button" disabled={Boolean(validation)} onClick={() => void submit()}><Save />旅行の基本情報を保存</button>{validation && <span>{validation}</span>}</div>
    </main>
  )
}

export function DateRangeField({ startDate, endDate, onChange, ariaLabel = '旅行期間を選択', hintLabel = '出発日と帰宅日', emptyLabel = 'カレンダーからまとめて選ぶ' }: { startDate: string; endDate: string; onChange: (startDate: string, endDate: string) => void; ariaLabel?: string; hintLabel?: string; emptyLabel?: string }) {
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(startDate ? parseDate(startDate) : new Date()))

  const openPicker = () => {
    setDraftStart(startDate)
    setDraftEnd(endDate)
    setVisibleMonth(monthStart(startDate ? parseDate(startDate) : new Date()))
    setOpen(true)
  }
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const selectDate = (value: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(value)
      setDraftEnd('')
    } else if (value < draftStart) {
      setDraftStart(value)
    } else {
      setDraftEnd(value)
    }
  }
  return <>
    <button className="date-range-trigger" type="button" onClick={openPicker} aria-label={ariaLabel}>
      <CalendarDays /><div><small>{startDate && endDate ? '選択した期間' : hintLabel}</small><strong>{startDate && endDate ? formatJapaneseDateRange(startDate, endDate) : emptyLabel}</strong></div><ChevronRight />
    </button>
    {open && <div className="date-range-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <header><button type="button" onClick={() => setOpen(false)} aria-label="カレンダーを閉じる"><X /></button><strong>{ariaLabel}</strong><span /></header>
      <div className="calendar-month-nav"><button type="button" aria-label="前の月" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}><ChevronLeft /></button><strong>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong><button type="button" aria-label="次の月" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}><ChevronRight /></button></div>
      <div className="calendar-weekdays">{['日', '月', '火', '水', '木', '金', '土'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">{days.map((date) => {
        const value = toDateKey(date)
        const selected = value === draftStart || value === draftEnd
        const inRange = Boolean(draftStart && draftEnd && value > draftStart && value < draftEnd)
        const outside = date.getMonth() !== visibleMonth.getMonth()
        return <button className={`${outside ? 'outside ' : ''}${inRange ? 'in-range ' : ''}${selected ? 'selected' : ''}`} type="button" key={value} aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`} aria-pressed={selected} onClick={() => selectDate(value)}><span>{date.getDate()}</span></button>
      })}</div>
      <section className="date-range-selection"><div><small>出発</small><strong>{draftStart ? formatJapaneseDate(draftStart) : '未選択'}</strong></div><i>—</i><div><small>帰宅</small><strong>{draftEnd ? formatJapaneseDate(draftEnd) : '未選択'}</strong></div></section>
      <p className="date-range-help">{draftStart && !draftEnd ? '続けて帰宅日を選んでください。同日を選ぶと日帰りになります。' : '出発日を選び、続けて帰宅日を選びます。'}</p>
      <div className="date-range-actions"><button className="cancel" type="button" onClick={() => setOpen(false)}>キャンセル</button><button type="button" disabled={!draftStart || !draftEnd} onClick={() => { onChange(draftStart, draftEnd); setOpen(false) }}><Check />この期間に決定</button></div>
    </div>}
  </>
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1) }
function toDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function calendarDays(month: Date) {
  const first = monthStart(month)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}
function formatJapaneseDate(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
function formatJapaneseDateRange(start: string, end: string) {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const startLabel = `${startDate.getFullYear()}年${startDate.getMonth() + 1}月${startDate.getDate()}日`
  const endLabel = startDate.getFullYear() === endDate.getFullYear() ? `${endDate.getMonth() + 1}月${endDate.getDate()}日` : `${endDate.getFullYear()}年${endDate.getMonth() + 1}月${endDate.getDate()}日`
  return `${startLabel} — ${endLabel}`
}

function hasDraftContent(draft: TripDraft) {
  return Boolean(draft.name || draft.companionCategoryIds.length || draft.startDate || draft.endDate || draft.prefectureCodes.length)
}

function formatDateRange(start: string, end: string) {
  if (!start || !end) return '日付未設定'
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const first = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')}`
  if (start === end) return first
  return `${first} — ${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')}`
}

