import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Plus,
  Pencil,
  Search,
  Star,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import { normalizeDigits, toFiveDecimals } from '../coordinate'
import { db } from '../db'
import { detectPrefectureCode } from '../geoData'
import { processImageFile, type ProcessedImage } from '../imageProcessing'
import { getVisitImages } from '../imageOrder'
import { resolvePlusCodeInput } from '../plusCode'
import { prefectureName } from '../prefectures'
import { getNavigationSnapshot, mergeNavigationSnapshot, setNavigationSnapshot } from '../navigationSnapshots'
import { addExistingSpotVisit, createSpotWithVisit, deleteSpotImage, getReusableSpots, getSpotEditData, saveSpotEdits, setSpotRepresentativeImage, validateJapanCoordinate, type SpotEditPhoto, type SpotEditVisit } from '../spotRepository'
import { storageErrorMessage } from '../dataStatus'
import type { Spot, TravelImage, Trip, Visit } from '../types'
import { BlobImage } from './BlobImage'
import { CoordinateMap, OfflineJapanMap } from './OfflineJapanMap'

function BackHeader({ title, back, action }: { title: string; back: () => void; action?: React.ReactNode }) {
  return <header className="back-header"><button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button><strong>{title}</strong><div>{action}</div></header>
}

export function SpotEditor({ tripId, back, saved }: { tripId: string; back: () => void; saved: (spotId: string) => void }) {
  const [mode, setMode] = useState<'new' | 'reuse'>('new')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [prefectureCode, setPrefectureCode] = useState<number>()
  const [detectedPrefectureCode, setDetectedPrefectureCode] = useState<number>()
  const [prefectureManuallySelected, setPrefectureManuallySelected] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [latWhole, setLatWhole] = useState('')
  const [latFraction, setLatFraction] = useState('')
  const [lngWhole, setLngWhole] = useState('')
  const [lngFraction, setLngFraction] = useState('')
  const [images, setImages] = useState<ProcessedImage[]>([])
  const [mainImageIndex, setMainImageIndex] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [selectedExistingId, setSelectedExistingId] = useState<string>()

  const prefectureLinks = useLiveQuery(() => db.tripPrefectures.where('tripId').equals(tripId).sortBy('prefectureCode'), [tripId], [])
  const categories = useLiveQuery(() => db.spotCategories.orderBy('sortOrder').toArray(), [], [])
  const reusable = useLiveQuery(() => getReusableSpots(tripId), [tripId], [])

  const completeCoordinate = latWhole.length === 2 && latFraction.length === 5 && lngWhole.length === 3 && lngFraction.length === 5
  const latitude = completeCoordinate ? Number(`${latWhole}.${latFraction}`) : Number.NaN
  const longitude = completeCoordinate ? Number(`${lngWhole}.${lngFraction}`) : Number.NaN
  const coordinateValid = completeCoordinate && validateJapanCoordinate(latitude, longitude)
  const filteredReusable = reusable.filter(({ spot }) => spot.name.toLocaleLowerCase('ja').includes(search.trim().toLocaleLowerCase('ja')))

  useEffect(() => {
    let cancelled = false
    if (!coordinateValid) { setDetectedPrefectureCode(undefined); return }
    void detectPrefectureCode(latitude, longitude).then((code) => {
      if (cancelled) return
      setDetectedPrefectureCode(code)
      if (!prefectureManuallySelected && code && prefectureLinks.some((item) => item.prefectureCode === code)) setPrefectureCode(code)
    })
    return () => { cancelled = true }
  }, [coordinateValid, latitude, longitude, prefectureLinks, prefectureManuallySelected])

  const applyCoordinates = (lat: number, lng: number) => {
    const [latW, latF] = toFiveDecimals(lat).split('.')
    const [lngW, lngF] = toFiveDecimals(lng).split('.')
    setLatWhole(latW); setLatFraction(latF); setLngWhole(lngW); setLngFraction(lngF)
  }
  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (images.length + files.length > 20) { setMessage('写真は一度の訪問につき20枚までです'); return }
    setProcessing(true); setMessage('写真を端末内で処理しています…')
    try {
      const processed: ProcessedImage[] = []
      for (const file of files) processed.push(await processImageFile(file))
      setImages((current) => [...current, ...processed])
      setMessage(`${processed.length}枚の写真を準備しました`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '写真を処理できませんでした') }
    finally { setProcessing(false) }
  }
  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setMainImageIndex((current) => current === index ? 0 : current > index ? current - 1 : current)
  }
  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    setImages((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
    setMainImageIndex((current) => current === index ? target : current === target ? index : current)
  }
  const saveNew = async () => {
    try {
      if (!prefectureCode) throw new Error('都道府県を選んでください')
      const result = await createSpotWithVisit({ tripId, name, latitude, longitude, detectedPrefectureCode, effectivePrefectureCode: prefectureCode, prefectureOverridden: detectedPrefectureCode !== prefectureCode, spotCategoryId: categoryId || undefined, images, mainImageIndex })
      saved(result.spotId)
    } catch (error) { setMessage(storageErrorMessage(error, 'スポットを保存できませんでした')) }
  }
  const saveExisting = async () => {
    try {
      if (!selectedExistingId) throw new Error('再訪したスポットを選んでください')
      await addExistingSpotVisit(tripId, selectedExistingId, images, mainImageIndex)
      saved(selectedExistingId)
    } catch (error) { setMessage(storageErrorMessage(error, '訪問を保存できませんでした')) }
  }
  const canSaveNew = Boolean(name.trim() && prefectureCode && coordinateValid && images.length && !processing)
  const canSaveReuse = Boolean(selectedExistingId && !processing)

  return (
    <main className="screen sub-screen spot-editor-screen">
      <BackHeader title="スポットを追加" back={back} action={<span className="step-count">旅行に追加</span>} />
      <div className="segmented-control"><button className={mode === 'new' ? 'active' : ''} type="button" onClick={() => setMode('new')}><Plus />新規登録</button><button className={mode === 'reuse' ? 'active' : ''} type="button" onClick={() => setMode('reuse')}><ArrowLeftRight />登録済みから</button></div>
      {mode === 'new' ? <>
        <section className="editor-intro compact"><span>NEW PLACE</span><h1>どこを訪れましたか？</h1><p>名称、座標、都道府県、写真を端末内に保存します。</p></section>
        <div className="form-stack">
          <label className="field"><span>スポット名（必須）</span><input value={name} maxLength={80} placeholder="例：南禅寺 水路閣" onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span>カテゴリ（任意）</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">未分類</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <div className="field"><span>都道府県（座標から自動判定・変更可）</span><div className="chip-row">{prefectureLinks.map((item) => <button className={prefectureCode === item.prefectureCode ? 'selected' : ''} type="button" aria-pressed={prefectureCode === item.prefectureCode} key={item.id} onClick={() => { setPrefectureCode(item.prefectureCode); setPrefectureManuallySelected(true) }}>{prefectureName(item.prefectureCode)}</button>)}</div>{coordinateValid && <small className="detected-prefecture">{detectedPrefectureCode ? `座標の判定：${prefectureName(detectedPrefectureCode)}${prefectureLinks.some((item) => item.prefectureCode === detectedPrefectureCode) ? '' : '（この旅行の訪問先外）'}` : '座標から都道府県を判定できませんでした'}</small>}</div>
        </div>
        <CoordinateFields latWhole={latWhole} setLatWhole={setLatWhole} latFraction={latFraction} setLatFraction={setLatFraction} lngWhole={lngWhole} setLngWhole={setLngWhole} lngFraction={lngFraction} setLngFraction={setLngFraction} coordinateValid={coordinateValid} latitude={latitude} longitude={longitude} allowedCodes={prefectureLinks.map((item) => item.prefectureCode)} initialBoundsCodes={!coordinateValid && prefectureCode ? [prefectureCode] : []} mapOpen={mapOpen} openMap={() => setMapOpen(true)} closeMap={() => setMapOpen(false)} applyMapCoordinate={(lat, lng) => { applyCoordinates(lat, lng); setMapOpen(false); setMessage('地図で選んだ座標を入力欄に反映しました') }} applyPlusCodeCoordinate={(lat, lng) => { applyCoordinates(lat, lng); setMessage('Plus Codeから座標を入力欄に反映しました') }} />
      </> : <>
        <section className="editor-intro compact"><span>REVISIT</span><h1>登録済みスポットを再訪</h1><p>同じ場所を複製せず、この旅行からも参照します。写真追加は任意です。</p></section>
        <label className="spot-search"><Search /><input value={search} placeholder="スポット名で絞り込む" onChange={(event) => setSearch(event.target.value)} /></label>
        <section className="reusable-list">{filteredReusable.length ? filteredReusable.map(({ spot, imageId, thumbnailBlob }) => <button className={selectedExistingId === spot.id ? 'selected' : ''} type="button" key={spot.id} onClick={() => setSelectedExistingId(spot.id)}><BlobImage blob={thumbnailBlob} imageKey={imageId ? `${imageId}:thumbnail` : undefined} alt={spot.name} /><div><strong>{spot.name}</strong><span>{prefectureName(spot.effectivePrefectureCode)} · {toFiveDecimals(spot.latitude)}, {toFiveDecimals(spot.longitude)}</span></div>{selectedExistingId === spot.id ? <Check /> : <ChevronRight />}</button>) : <p>この旅行の都道府県で再利用できるスポットはありません。</p>}</section>
      </>}
      <PhotoSelector images={images} mainImageIndex={mainImageIndex} processing={processing} selectFiles={selectFiles} setMainImageIndex={setMainImageIndex} removeImage={removeImage} moveImage={moveImage} required={mode === 'new'} />
      {message && <p className="form-message spot-message" role="status">{message}</p>}
      <div className="sticky-action save-trip-action"><button type="button" disabled={mode === 'new' ? !canSaveNew : !canSaveReuse} onClick={() => void (mode === 'new' ? saveNew() : saveExisting())}><Check />{mode === 'new' ? 'スポットを保存' : 'この旅行に追加'}</button></div>
    </main>
  )
}

export function SpotEditScreen({ spotId, contextTripId, back, saved }: { spotId: string; contextTripId?: string; back: () => void; saved: () => void }) {
  const data = useLiveQuery(() => getSpotEditData(spotId), [spotId])
  const categories = useLiveQuery(() => db.spotCategories.orderBy('sortOrder').toArray(), [], [])
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [latWhole, setLatWhole] = useState('')
  const [latFraction, setLatFraction] = useState('')
  const [lngWhole, setLngWhole] = useState('')
  const [lngFraction, setLngFraction] = useState('')
  const [draftVisits, setDraftVisits] = useState<SpotEditVisit[]>([])
  const [selectedVisitId, setSelectedVisitId] = useState('')
  const [representativeKey, setRepresentativeKey] = useState<string>()
  const [mapOpen, setMapOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [detectedPrefectureCode, setDetectedPrefectureCode] = useState<number>()

  const applyCoordinates = (latitude: number, longitude: number) => {
    const [latW, latF] = toFiveDecimals(latitude).split('.')
    const [lngW, lngF] = toFiveDecimals(longitude).split('.')
    setLatWhole(latW); setLatFraction(latF); setLngWhole(lngW); setLngFraction(lngF)
  }
  useEffect(() => {
    if (!data || initialized) return
    setName(data.spot.name)
    setCategoryId(data.spot.spotCategoryId ?? '')
    applyCoordinates(data.spot.latitude, data.spot.longitude)
    setDraftVisits(data.visits)
    setRepresentativeKey(data.spot.representativeImageId)
    setSelectedVisitId(data.visits.find((visit) => visit.tripId === contextTripId)?.visitId ?? data.visits[0]?.visitId ?? '')
    setInitialized(true)
  }, [data, initialized, contextTripId])

  const completeCoordinate = latWhole.length === 2 && latFraction.length === 5 && lngWhole.length === 3 && lngFraction.length === 5
  const latitude = completeCoordinate ? Number(`${latWhole}.${latFraction}`) : Number.NaN
  const longitude = completeCoordinate ? Number(`${lngWhole}.${lngFraction}`) : Number.NaN
  const coordinateValid = completeCoordinate && validateJapanCoordinate(latitude, longitude)
  useEffect(() => {
    let cancelled = false
    if (!coordinateValid) { setDetectedPrefectureCode(undefined); return }
    void detectPrefectureCode(latitude, longitude).then((code) => { if (!cancelled) setDetectedPrefectureCode(code) })
    return () => { cancelled = true }
  }, [coordinateValid, latitude, longitude])

  if (!data || !initialized) return <main className="screen sub-screen"><BackHeader title="スポットを編集" back={back} /><p className="loading-note">スポットを読み込んでいます…</p></main>
  const selectedVisit = draftVisits.find((visit) => visit.visitId === selectedVisitId)
  const totalPhotos = draftVisits.reduce((total, visit) => total + visit.photos.length, 0)
  const originalImageIds = new Set(data.visits.flatMap((visit) => visit.photos).flatMap((photo) => photo.image ? [photo.image.id] : []))
  const remainingExistingIds = new Set(draftVisits.flatMap((visit) => visit.photos).flatMap((photo) => photo.image ? [photo.image.id] : []))
  const deletedExistingCount = [...originalImageIds].filter((id) => !remainingExistingIds.has(id)).length
  const updateVisitPhotos = (visitId: string, update: (photos: SpotEditVisit['photos']) => SpotEditVisit['photos']) => setDraftVisits((current) => current.map((visit) => visit.visitId === visitId ? { ...visit, photos: update(visit.photos) } : visit))
  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !selectedVisit) return
    if (selectedVisit.photos.length + files.length > 20) { setMessage('写真は一度の訪問につき20枚までです'); return }
    setProcessing(true); setMessage('写真を端末内で処理しています…')
    try {
      const photos: SpotEditPhoto[] = []
      for (const file of files) { const processed = await processImageFile(file); photos.push({ key: `draft-${crypto.randomUUID()}`, processed }) }
      updateVisitPhotos(selectedVisit.visitId, (current) => [...current, ...photos])
      setMessage(`${photos.length}枚の写真を追加しました。保存するとこの旅行に紐づきます。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '写真を処理できませんでした') }
    finally { setProcessing(false) }
  }
  const removePhoto = (index: number) => {
    if (!selectedVisit) return
    if (totalPhotos <= 1) { setMessage('スポットには写真が1枚以上必要です'); return }
    const removing = selectedVisit.photos[index]
    setDraftVisits((current) => {
      const next = current.map((visit) => visit.visitId === selectedVisit.visitId ? { ...visit, photos: visit.photos.filter((_, itemIndex) => itemIndex !== index) } : visit)
      if (removing?.key === representativeKey) setRepresentativeKey(next.flatMap((visit) => visit.photos)[0]?.key)
      return next
    })
  }
  const movePhoto = (index: number, direction: -1 | 1) => {
    if (!selectedVisit) return
    const target = index + direction
    if (target < 0 || target >= selectedVisit.photos.length) return
    updateVisitPhotos(selectedVisit.visitId, (current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  const save = async () => {
    if (deletedExistingCount && !window.confirm(`${deletedExistingCount}枚の写真を完全に削除して、変更を保存しますか？バックアップがなければ元に戻せません。`)) return
    try {
      setMessage('保存しています…')
      await saveSpotEdits({ spotId, name, spotCategoryId: categoryId || undefined, latitude, longitude, representativeKey, visits: draftVisits.map((visit) => ({ visitId: visit.visitId, photos: visit.photos })) })
      saved()
    } catch (error) { setMessage(storageErrorMessage(error, 'スポットを保存できませんでした')) }
  }
  const mismatch = detectedPrefectureCode && detectedPrefectureCode !== data.spot.effectivePrefectureCode

  return <main className="screen sub-screen spot-editor-screen">
    <BackHeader title="スポットを編集" back={back} action={<span className="step-count">共通情報</span>} />
    <section className="editor-intro compact"><span>EDIT PLACE</span><h1>スポットの情報を編集</h1><p>名称・カテゴリ・座標は、関連するすべての旅行に反映されます。</p></section>
    <div className="form-stack">
      <label className="field"><span>スポット名（必須）</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field"><span>カテゴリ（任意）</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">未分類</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <div className="field locked-prefecture"><span>都道府県（変更不可）</span><strong><MapPin />{prefectureName(data.spot.effectivePrefectureCode)}</strong><small>複数の旅行から共有されるため、スポット編集では変更できません。</small>{mismatch && <em>入力した座標は{prefectureName(detectedPrefectureCode)}と判定されています。登録都道府県と異なるため、座標をご確認ください。</em>}</div>
    </div>
    <CoordinateFields latWhole={latWhole} setLatWhole={setLatWhole} latFraction={latFraction} setLatFraction={setLatFraction} lngWhole={lngWhole} setLngWhole={setLngWhole} lngFraction={lngFraction} setLngFraction={setLngFraction} coordinateValid={coordinateValid} latitude={latitude} longitude={longitude} allowedCodes={[data.spot.effectivePrefectureCode]} initialBoundsCodes={[data.spot.effectivePrefectureCode]} mapOpen={mapOpen} openMap={() => setMapOpen(true)} closeMap={() => setMapOpen(false)} applyMapCoordinate={(lat, lng) => { applyCoordinates(lat, lng); setMapOpen(false); setMessage('地図で選んだ座標を入力欄に反映しました') }} applyPlusCodeCoordinate={(lat, lng) => { applyCoordinates(lat, lng); setMessage('Plus Codeから座標を入力欄に反映しました') }} />
    <section className="photo-editor spot-edit-photos"><div className="section-heading"><div><span>PHOTOS</span><h2>旅行ごとの写真</h2></div><small>全{totalPhotos}枚</small></div>
      <label className="visit-photo-select"><span>写真を表示・追加する旅行</span><select aria-label="写真を表示・追加する旅行" value={selectedVisitId} disabled={draftVisits.length === 1} onChange={(event) => setSelectedVisitId(event.target.value)}>{draftVisits.map((visit) => <option key={visit.visitId} value={visit.visitId}>{visit.tripName}（{visit.photos.length}枚）</option>)}</select><small>{draftVisits.length === 1 ? '関連する旅行はこの1件です' : contextTripId && selectedVisit?.tripId === contextTripId ? 'スポット詳細を開いた旅行を選択しています' : '旅行を切り替えても、未保存の変更は保持されます'}</small></label>
      <label className="photo-input"><Camera /><strong>{processing ? '処理中…' : 'この旅行に写真を追加'}</strong><span>{selectedVisit?.tripName ?? ''}に紐づけます</span><input type="file" accept="image/*" multiple disabled={processing || !selectedVisit} onChange={selectFiles} /></label>
      {selectedVisit?.photos.length ? <div className="photo-draft-list">{selectedVisit.photos.map((photo, index) => <article className={representativeKey === photo.key ? 'main' : ''} key={photo.key}><BlobImage blob={photo.image?.thumbnailBlob ?? photo.processed?.thumbnailBlob} imageKey={`${photo.key}:thumbnail`} alt={`${selectedVisit.tripName}の写真${index + 1}`} /><button className="main-photo" type="button" onClick={() => setRepresentativeKey(photo.key)}><Star />{representativeKey === photo.key ? 'メイン' : 'メインにする'}</button><div><button type="button" aria-label="前へ移動" disabled={index === 0} onClick={() => movePhoto(index, -1)}><ChevronLeft /></button><button type="button" aria-label="後ろへ移動" disabled={index === selectedVisit.photos.length - 1} onClick={() => movePhoto(index, 1)}><ChevronRight /></button><button type="button" aria-label="写真を削除" onClick={() => removePhoto(index)}><Trash2 /></button></div></article>)}</div> : <p className="visit-photo-empty">この旅行に紐づく写真はありません。写真を追加するか、別の旅行を選択してください。</p>}
    </section>
    {message && <p className="form-message spot-message" role="status">{message}</p>}
    <div className="sticky-action save-trip-action"><button type="button" disabled={!name.trim() || !coordinateValid || processing || !totalPhotos} onClick={() => void save()}><Check />変更を保存</button></div>
  </main>
}

function CoordinateFields(props: {
  latWhole: string; setLatWhole: (value: string) => void; latFraction: string; setLatFraction: (value: string) => void
  lngWhole: string; setLngWhole: (value: string) => void; lngFraction: string; setLngFraction: (value: string) => void
  coordinateValid: boolean; latitude: number; longitude: number; allowedCodes: number[]; initialBoundsCodes: number[]
  mapOpen: boolean; openMap: () => void; closeMap: () => void; applyMapCoordinate: (latitude: number, longitude: number) => void
  applyPlusCodeCoordinate: (latitude: number, longitude: number) => void
}) {
  const [lw, lf, gw, gf] = [props.latWhole, props.latFraction, props.lngWhole, props.lngFraction]
  const [plusCode, setPlusCode] = useState('')
  const [plusCodeMessage, setPlusCodeMessage] = useState('')
  const [resolvingPlusCode, setResolvingPlusCode] = useState(false)
  const applyPlusCode = async () => {
    if (!plusCode.trim() || resolvingPlusCode) return
    setResolvingPlusCode(true)
    setPlusCodeMessage('Plus Codeを確認しています…')
    try {
      const result = await resolvePlusCodeInput(plusCode, props.allowedCodes)
      const detectedCode = await detectPrefectureCode(result.latitude, result.longitude)
      if (!detectedCode) throw new Error('日本国内の位置として確認できませんでした')
      if (result.reference && detectedCode !== result.reference.prefectureCode) {
        throw new Error('地域名と復元された位置が一致しません。フルPlus Codeまたは地図指定をご利用ください')
      }
      props.applyPlusCodeCoordinate(result.latitude, result.longitude)
      setPlusCodeMessage(`${result.fullCode} · ${toFiveDecimals(result.latitude)}, ${toFiveDecimals(result.longitude)} を反映しました`)
    } catch (error) {
      setPlusCodeMessage(error instanceof Error ? error.message : 'Plus Codeを座標へ変換できませんでした')
    } finally {
      setResolvingPlusCode(false)
    }
  }
  return <section className="spot-coordinate-block">
    <div className="coordinate-section-heading"><div><LocateFixed /><span>座標を入力</span></div><small>小数点以下5桁</small></div>
    <DirectCoordinateInputs {...props} />
    <div className="plus-code-input">
      <label htmlFor="spot-plus-code"><span>PLUS CODE</span><strong>Googleマップから貼り付け</strong></label>
      <div><input id="spot-plus-code" value={plusCode} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="MMQR+QM 新宿区、東京都" onChange={(event) => { setPlusCode(event.target.value); setPlusCodeMessage('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void applyPlusCode() } }} /><button type="button" disabled={!plusCode.trim() || resolvingPlusCode} onClick={() => void applyPlusCode()}>{resolvingPlusCode ? '確認中' : '座標に反映'}</button></div>
      <small>フルコード、または地域名付きの短縮コードを使用できます。通信は行いません。</small>
      {plusCodeMessage && <p role="status">{plusCodeMessage}</p>}
    </div>
    <p className={props.coordinateValid ? 'coordinate-state valid' : 'coordinate-state'}>{props.coordinateValid ? <><Check />{lw}.{lf}, {gw}.{gf}</> : '緯度2桁・経度3桁と小数5桁を入力してください'}</p>
    <button className="map-coordinate-helper" type="button" onClick={props.openMap}><MapIcon /><div><strong>地図から座標を入力</strong><span>地図で場所を合わせ、入力欄へ反映します</span></div><ChevronRight /></button>
    {props.mapOpen && <MapCoordinateDialog initialLatitude={props.latitude} initialLongitude={props.longitude} allowedCodes={props.allowedCodes} initialBoundsCodes={props.initialBoundsCodes} cancel={props.closeMap} confirm={props.applyMapCoordinate} />}
  </section>
}

function DirectCoordinateInputs(props: Parameters<typeof CoordinateFields>[0]) {
  const latFractionRef = useRef<HTMLInputElement>(null)
  const lngWholeRef = useRef<HTMLInputElement>(null)
  const lngFractionRef = useRef<HTMLInputElement>(null)
  const numberInput = (setter: (value: string) => void, max: number, next?: React.RefObject<HTMLInputElement | null>) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeDigits(event.target.value).replace(/\D/g, '').slice(0, max)
    setter(value)
    if (value.length === max) requestAnimationFrame(() => next?.current?.focus())
  }
  return <div className="coordinate-form embedded-coordinate" data-coordinate-root>
    <div className="coordinate-row"><label><span>緯度</span><small>LATITUDE</small></label><div className="split-coordinate"><input aria-label="緯度の整数部" inputMode="numeric" value={props.latWhole} onChange={numberInput(props.setLatWhole, 2, latFractionRef)} /><b>.</b><input ref={latFractionRef} aria-label="緯度の小数部" inputMode="numeric" value={props.latFraction} onChange={numberInput(props.setLatFraction, 5, lngWholeRef)} /><em>{props.latFraction.length}/5</em></div></div>
    <div className="coordinate-row"><label><span>経度</span><small>LONGITUDE</small></label><div className="split-coordinate longitude"><input ref={lngWholeRef} aria-label="経度の整数部" inputMode="numeric" value={props.lngWhole} onChange={numberInput(props.setLngWhole, 3, lngFractionRef)} /><b>.</b><input ref={lngFractionRef} aria-label="経度の小数部" inputMode="numeric" value={props.lngFraction} onChange={numberInput(props.setLngFraction, 5)} /><em>{props.lngFraction.length}/5</em></div></div>
  </div>
}

function MapCoordinateDialog({ initialLatitude, initialLongitude, allowedCodes, initialBoundsCodes, cancel, confirm }: {
  initialLatitude: number; initialLongitude: number; allowedCodes: number[]; initialBoundsCodes: number[]
  cancel: () => void; confirm: (latitude: number, longitude: number) => void
}) {
  const initialValid = validateJapanCoordinate(initialLatitude, initialLongitude)
  const [draft, setDraft] = useState<{ latitude: number; longitude: number } | undefined>(initialValid ? { latitude: initialLatitude, longitude: initialLongitude } : undefined)
  const [detectedCode, setDetectedCode] = useState<number>()
  useEffect(() => {
    let cancelled = false
    if (!draft) { setDetectedCode(undefined); return }
    void detectPrefectureCode(draft.latitude, draft.longitude).then((code) => { if (!cancelled) setDetectedCode(code) })
    return () => { cancelled = true }
  }, [draft])
  return <div className="coordinate-map-modal" role="dialog" aria-modal="true" aria-label="地図から座標を入力">
    <header><button type="button" onClick={cancel} aria-label="地図を閉じる"><X /></button><strong>地図から座標を入力</strong><span /></header>
    <p className="coordinate-map-instruction">地図を動かし、中央の照準を訪れた場所に合わせてください。</p>
    <CoordinateMap latitude={initialLatitude} longitude={initialLongitude} allowedCodes={allowedCodes} initialBoundsCodes={initialBoundsCodes} onCenterChange={(latitude, longitude) => setDraft({ latitude, longitude })} />
    <section className="coordinate-map-draft"><div><span>選択中の位置</span><strong>{detectedCode ? prefectureName(detectedCode) : '判定中…'}</strong><small>{draft ? `${toFiveDecimals(draft.latitude)}, ${toFiveDecimals(draft.longitude)}` : '地図を準備しています…'}</small></div></section>
    <div className="coordinate-map-actions"><button type="button" className="cancel" onClick={cancel}>キャンセル</button><button type="button" disabled={!draft} onClick={() => draft && confirm(draft.latitude, draft.longitude)}><Check />この位置を入力欄に反映</button></div>
  </div>
}

function PhotoSelector({ images, mainImageIndex, processing, selectFiles, setMainImageIndex, removeImage, moveImage, required }: {
  images: ProcessedImage[]; mainImageIndex: number; processing: boolean
  selectFiles: (event: React.ChangeEvent<HTMLInputElement>) => void; setMainImageIndex: (index: number) => void
  removeImage: (index: number) => void; moveImage: (index: number, direction: -1 | 1) => void; required: boolean
}) {
  return <section className="photo-editor"><div className="section-heading"><div><span>PHOTOS</span><h2>写真{required ? '（1枚以上）' : '（任意）'}</h2></div><small>{images.length}枚</small></div><label className="photo-input"><Camera /><strong>{processing ? '処理中…' : '写真を選ぶ'}</strong><span>複数選択できます</span><input type="file" accept="image/*" multiple disabled={processing} onChange={selectFiles} /></label>{images.length ? <div className="photo-draft-list">{images.map((image, index) => <article className={mainImageIndex === index ? 'main' : ''} key={`${image.sourceName}-${index}`}><BlobImage blob={image.thumbnailBlob} alt={image.sourceName} /><button className="main-photo" type="button" onClick={() => setMainImageIndex(index)}><Star />{mainImageIndex === index ? 'メイン' : 'メインにする'}</button><div><button type="button" aria-label="前へ移動" disabled={index === 0} onClick={() => moveImage(index, -1)}><ChevronLeft /></button><button type="button" aria-label="後ろへ移動" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}><ChevronRight /></button><button type="button" aria-label="写真を外す" onClick={() => removeImage(index)}><Trash2 /></button></div></article>)}</div> : null}</section>
}

export function SavedSpotDetail({ id, back, edit, removeVisit, openTrip, openPrefecture, openMap }: { id: string; back: () => void; edit: () => void; removeVisit: (visitId: string) => Promise<{ spotDeleted: boolean }>; openTrip: (id: string) => void; openPrefecture: (code: number) => void; openMap: () => void }) {
  type SpotDetails = { categoryName: string; visits: { visit: Visit; trip: Trip | undefined }[]; images: TravelImage[]; representative?: TravelImage }
  type Snapshot = { spot: Spot; details?: SpotDetails; previewImage?: { id?: string; blob?: Blob } }
  const [viewerIndex, setViewerIndex] = useState<number>()
  const snapshot = getNavigationSnapshot<Snapshot>('spot', id)
  const loaded = useLiveQuery(async () => {
    const spot = await db.spots.get(id)
    if (!spot) return undefined
    const visits = await db.visits.where('spotId').equals(id).filter((visit) => !visit.deletedAt).toArray()
    const visitsWithTrips = await Promise.all(visits.map(async (visit) => ({ visit, trip: await db.trips.get(visit.tripId) })))
    const imageGroups = await Promise.all(visits.map(getVisitImages))
    const images = imageGroups.flat()
    const representative = spot.representativeImageId ? images.find((image) => image.id === spot.representativeImageId) : undefined
    const details: SpotDetails = { categoryName: spot.spotCategoryId ? (await db.spotCategories.get(spot.spotCategoryId))?.name ?? '' : '', visits: visitsWithTrips, images, representative }
    return { spot, details }
  }, [id])
  const spot = loaded?.spot ?? snapshot?.spot
  const details = loaded?.details ?? snapshot?.details
  useEffect(() => {
    if (loaded) setNavigationSnapshot<Snapshot>('spot', id, loaded)
  }, [id, loaded])
  if (!spot) return <main className="screen sub-screen"><BackHeader title="スポット" back={back} /><p className="loading-note">スポットを読み込んでいます…</p></main>
  const unlinkVisit = async (visitId: string, tripName: string) => {
    const last = details?.visits.length === 1
    const message = last
      ? `「${tripName}」は最後の関連旅行です。関連を外すと、このスポットもゴミ箱へ移動します。よろしいですか？`
      : `「${tripName}」との関連を外しますか？ほかの旅行の記録には残ります。`
    if (window.confirm(message)) await removeVisit(visitId)
  }
  const heroImage = details?.representative ?? details?.images[0]
  const heroIndex = heroImage && details ? details.images.findIndex((image) => image.id === heroImage.id) : -1
  const makeRepresentative = async (imageId: string) => { await setSpotRepresentativeImage(id, imageId) }
  const removeImage = async (imageId: string) => {
    if (!details || details.images.length <= 1) throw new Error('スポットには写真が1枚以上必要です')
    if (!window.confirm('この写真を完全に削除しますか？バックアップがなければ元に戻せません。')) return false
    await deleteSpotImage(id, imageId)
    setViewerIndex((current) => current === undefined ? undefined : Math.min(current, details.images.length - 2))
    return true
  }
  const previewImage = snapshot?.previewImage
  return <main className={`screen sub-screen saved-spot-detail${details ? '' : ' detail-hydrating'}`}><BackHeader title="スポット" back={back} action={<button className="spot-edit-action" type="button" onClick={edit}><Pencil />編集</button>} />
    <button className="saved-photo-gallery" type="button" disabled={!heroImage} onClick={() => heroIndex >= 0 && setViewerIndex(heroIndex)}>{heroImage ? <BlobImage blob={heroImage.imageBlob} imageKey={`${heroImage.id}:full`} alt={spot.name} /> : previewImage?.blob ? <BlobImage blob={previewImage.blob} imageKey={previewImage.id ? `${previewImage.id}:preview` : undefined} alt={spot.name} /> : <BlobImage alt={spot.name} />}<div className="gallery-count"><Maximize2 />{details ? `${details.images.length}枚を見る` : '写真を準備中'}</div></button>
    <section className="spot-title-block"><button className="spot-prefecture-link" type="button" onClick={() => openPrefecture(spot.effectivePrefectureCode)}>{prefectureName(spot.effectivePrefectureCode)}<ChevronRight /></button>{details?.categoryName && <span> · {details.categoryName}</span>}<h1>{spot.name}</h1><p>{toFiveDecimals(spot.latitude)}, {toFiveDecimals(spot.longitude)}</p></section>
    {details && details.images.length > 1 && <section className="saved-photo-grid">{details.images.map((image, index) => <button type="button" key={image.id} aria-label={`${spot.name}の写真${index + 1}を拡大`} onClick={() => setViewerIndex(index)}><BlobImage blob={image.thumbnailBlob} imageKey={`${image.id}:thumbnail`} alt={`${spot.name} ${index + 1}枚目`} /></button>)}</section>}
    <section className="spot-detail-map"><OfflineJapanMap visitedCodes={[spot.effectivePrefectureCode]} spots={[{ id: spot.id, name: spot.name, latitude: spot.latitude, longitude: spot.longitude, prefectureCode: spot.effectivePrefectureCode }]} selectedSpotId={spot.id} initialCenter={[spot.longitude, spot.latitude]} initialZoom={8} /><button type="button" onClick={openMap}>日本地図で見る<ChevronRight /></button></section>
    <section className="content-section"><div className="section-heading"><div><span>VISITED ON</span><h2>訪れた旅行</h2></div><small>{details ? `${details.visits.length}回` : '読込中'}</small></div>{details?.visits.map(({ visit, trip }) => trip ? <div className="visit-row-group" key={visit.id}><button className="visit-row" type="button" onClick={() => { mergeNavigationSnapshot('trip', trip.id, { trip }); openTrip(trip.id) }}><MapPin /><div><strong>{trip.name}</strong><span>{trip.startDate} — {trip.endDate}</span></div><ChevronRight /></button><button className="visit-unlink" type="button" aria-label={`${trip.name}との関連を外す`} onClick={() => void unlinkVisit(visit.id, trip.name)}><Unlink /></button></div> : null)}</section>
    {details && viewerIndex !== undefined && details.images[viewerIndex] && <PhotoViewer images={details.images} index={viewerIndex} representativeImageId={spot.representativeImageId} name={spot.name} setIndex={setViewerIndex} close={() => setViewerIndex(undefined)} setRepresentative={makeRepresentative} deleteImage={removeImage} />}
  </main>
}

export function photoMotionDirection(currentIndex: number, nextIndex: number) {
  return nextIndex > currentIndex ? 'next' as const : nextIndex < currentIndex ? 'previous' as const : 'none' as const
}

function PhotoViewer({ images, index, representativeImageId, name, setIndex, close, setRepresentative, deleteImage }: { images: { id: string; imageBlob: Blob }[]; index: number; representativeImageId?: string; name: string; setIndex: (index: number) => void; close: () => void; setRepresentative: (imageId: string) => Promise<void>; deleteImage: (imageId: string) => Promise<boolean> }) {
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [photoMotion, setPhotoMotion] = useState<'next' | 'previous' | 'none'>('none')
  const gesture = useRef<{ startX?: number; distance?: number; startScale?: number }>({})
  useEffect(() => setScale(1), [index])
  const moveTo = (nextIndex: number) => {
    if (nextIndex === index || nextIndex < 0 || nextIndex >= images.length) return
    setPhotoMotion(photoMotionDirection(index, nextIndex))
    setIndex(nextIndex)
  }
  const distance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  const touchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) gesture.current = { distance: distance(event.touches), startScale: scale }
    else if (event.touches.length === 1) gesture.current = { startX: event.touches[0].clientX }
  }
  const touchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !gesture.current.distance) return
    event.preventDefault()
    setScale(Math.min(4, Math.max(1, (gesture.current.startScale ?? 1) * distance(event.touches) / gesture.current.distance)))
  }
  const touchEnd = (event: React.TouchEvent) => {
    const startX = gesture.current.startX
    if (startX !== undefined && scale === 1 && event.changedTouches[0]) {
      const delta = event.changedTouches[0].clientX - startX
      if (delta < -55 && index < images.length - 1) moveTo(index + 1)
      if (delta > 55 && index > 0) moveTo(index - 1)
    }
    gesture.current = {}
  }
  const updateRepresentative = async () => { try { setBusy(true); setMessage(''); await setRepresentative(images[index].id); setMessage('メイン画像に設定しました') } catch (error) { setMessage(error instanceof Error ? error.message : '変更できませんでした') } finally { setBusy(false) } }
  const remove = async () => { try { setBusy(true); setMessage(''); await deleteImage(images[index].id) } catch (error) { setMessage(error instanceof Error ? error.message : '削除できませんでした') } finally { setBusy(false) } }
  const isRepresentative = images[index].id === representativeImageId
  return createPortal(<div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${name}の写真`}><header><button type="button" onClick={close} aria-label="写真を閉じる"><X /></button><strong>{index + 1} / {images.length}</strong><button type="button" onClick={() => setScale(1)} disabled={scale === 1}>等倍</button></header><div className="photo-viewer-stage" onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}><div key={images[index].id} className={`photo-viewer-image photo-${photoMotion}`} style={{ transform: `scale(${scale})` }}><BlobImage blob={images[index].imageBlob} imageKey={`${images[index].id}:full`} alt={`${name} ${index + 1}枚目`} /></div></div>{images.length > 1 && <div className="photo-viewer-actions"><button type="button" disabled={busy || isRepresentative} onClick={() => void updateRepresentative()}><Star />{isRepresentative ? 'メイン画像' : 'メインに設定'}</button><button className="delete" type="button" disabled={busy} onClick={() => void remove()}><Trash2 />削除</button></div>}{message && <p className="photo-viewer-message" role="status">{message}</p>}<div className="photo-viewer-controls"><button type="button" aria-label="前の写真" disabled={index === 0 || busy} onClick={() => moveTo(index - 1)}><ChevronLeft /></button><span>{images.length === 1 ? '最後の1枚は削除できません' : '左右にスワイプ・ピンチで拡大'}</span><button type="button" aria-label="次の写真" disabled={index === images.length - 1 || busy} onClick={() => moveTo(index + 1)}><ChevronRight /></button></div></div>, document.body)
}

