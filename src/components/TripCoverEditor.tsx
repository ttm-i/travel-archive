import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Check, ChevronRight, Images, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { DEFAULT_CROP, getTripCoverCandidates, type TripCoverDraft } from '../coverRepository'
import { processImageFile } from '../imageProcessing'
import type { ImageCrop } from '../types'
import { BlobImage, CroppedBlobImage } from './BlobImage'

export function TripCoverEditor({ tripId, draft, change, error }: { tripId?: string; draft: TripCoverDraft; change: (draft: TripCoverDraft) => void; error: (message: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const candidates = useLiveQuery(() => tripId ? getTripCoverCandidates(tripId) : Promise.resolve([]), [tripId], [])
  const fallback = candidates[0]
  const preview = draft.previewBlob ?? (draft.kind === 'default' ? fallback?.imageBlob : undefined)
  const selectFile = async (file?: File) => {
    if (!file) return
    try {
      setProcessing(true); error('')
      const processed = await processImageFile(file)
      change({ kind: 'new', processed, previewBlob: processed.imageBlob, thumbnailBlob: processed.thumbnailBlob, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
      setCropOpen(true)
    } catch (cause) { error(cause instanceof Error ? cause.message : '写真を読み込めませんでした') }
    finally { setProcessing(false) }
  }
  const reset = () => change({ kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
  return <section className="trip-cover-field"><div className="trip-cover-heading"><div><span>TRIP COVER</span><h2>旅行の表紙</h2></div><small>任意</small></div><div className="trip-cover-summary">{preview ? <CroppedBlobImage blob={preview} alt="旅行の表紙プレビュー" crop={draft.listCrop} /> : <div className="trip-cover-empty"><Images /><span>表紙未設定</span></div>}<div><strong>{draft.kind === 'registered' ? '登録画像を使用' : draft.kind === 'asset' || draft.kind === 'new' ? 'カメラロールの画像を使用' : fallback ? '最初のスポット画像を自動使用' : '既定の表紙'}</strong><span>一覧と旅行詳細で同じ写真を使います</span>{preview && draft.kind !== 'default' && <button type="button" onClick={() => setCropOpen(true)}><SlidersHorizontal />切り取りを調整</button>}</div></div><div className="trip-cover-actions"><button type="button" disabled={!tripId || !candidates.length} onClick={() => setPickerOpen(true)}><Images />登録画像から</button><label className={processing ? 'disabled' : ''}><Camera />{processing ? '処理中…' : 'カメラロールから'}<input type="file" accept="image/*" disabled={processing} onChange={(event) => void selectFile(event.target.files?.[0])} /></label><button type="button" onClick={reset}><RotateCcw />既定に戻す</button></div>{!tripId && <p>登録画像は、旅行を保存してスポットを追加した後に選べます。</p>}{pickerOpen && <div className="cover-picker-modal" role="dialog" aria-modal="true" aria-label="旅行の登録画像を選択"><header><button type="button" onClick={() => setPickerOpen(false)} aria-label="画像選択を閉じる"><X /></button><strong>登録画像から選択</strong><span /></header><div>{candidates.map((candidate) => <button type="button" key={candidate.imageId} onClick={() => { change({ kind: 'registered', imageId: candidate.imageId, previewBlob: candidate.imageBlob, thumbnailBlob: candidate.thumbnailBlob, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP }); setPickerOpen(false); setCropOpen(true) }}><BlobImage blob={candidate.thumbnailBlob} alt={candidate.spotName} /><span>{candidate.spotName}</span><ChevronRight /></button>)}</div></div>}{cropOpen && preview && <CoverCropModal blob={preview} listCrop={draft.listCrop} heroCrop={draft.heroCrop} update={(kind, crop) => change({ ...draft, [kind === 'list' ? 'listCrop' : 'heroCrop']: crop })} close={() => setCropOpen(false)} />}</section>
}

function CoverCropModal({ blob, listCrop, heroCrop, update, close }: { blob: Blob; listCrop: ImageCrop; heroCrop: ImageCrop; update: (kind: 'list' | 'hero', crop: ImageCrop) => void; close: () => void }) {
  const [kind, setKind] = useState<'list' | 'hero'>('list')
  const drag = useRef<{ x: number; y: number; crop: ImageCrop } | undefined>(undefined)
  const crop = kind === 'list' ? listCrop : heroCrop
  const change = (next: ImageCrop) => update(kind, { x: Math.max(0, Math.min(100, next.x)), y: Math.max(0, Math.min(100, next.y)), zoom: Math.max(1, Math.min(2.5, next.zoom)) })
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, crop } }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!drag.current) return; const rect = event.currentTarget.getBoundingClientRect(); change({ ...crop, x: drag.current.crop.x - (event.clientX - drag.current.x) / rect.width * 100, y: drag.current.crop.y - (event.clientY - drag.current.y) / rect.height * 100 }) }
  return <div className="cover-crop-modal" role="dialog" aria-modal="true" aria-label="表紙の切り取りを調整"><header><button type="button" onClick={close} aria-label="切り取り調整を閉じる"><X /></button><strong>切り取りを調整</strong><button type="button" onClick={close}><Check />完了</button></header><div className="cover-crop-tabs"><button className={kind === 'list' ? 'active' : ''} type="button" onClick={() => setKind('list')}>旅行一覧</button><button className={kind === 'hero' ? 'active' : ''} type="button" onClick={() => setKind('hero')}>旅行詳細</button></div><p>写真をドラッグして位置を合わせ、スライダーで拡大します。</p><div className={`cover-crop-stage ${kind}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = undefined }}><CroppedBlobImage blob={blob} alt={`${kind === 'list' ? '旅行一覧' : '旅行詳細'}の切り取りプレビュー`} crop={crop} /></div><label className="cover-zoom"><span>拡大</span><input type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={(event) => change({ ...crop, zoom: Number(event.target.value) })} /><strong>{crop.zoom.toFixed(1)}×</strong></label><button className="cover-crop-reset" type="button" onClick={() => change(DEFAULT_CROP)}><RotateCcw />この表示を中央に戻す</button></div>
}
