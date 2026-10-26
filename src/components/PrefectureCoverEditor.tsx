import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Check, ChevronRight, Images, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { DEFAULT_CROP } from '../coverRepository'
import { processImageFile } from '../imageProcessing'
import { prefectureName } from '../prefectures'
import { getPrefectureCoverCandidates, loadPrefectureCoverDraft, savePrefectureCover, type PrefectureCoverDraft } from '../prefectureCoverRepository'
import type { ImageCrop } from '../types'
import { BlobImage, CroppedBlobImage } from './BlobImage'

export function PrefectureCoverEditor({ code, close }: { code: number; close: () => void }) {
  const loaded = useLiveQuery(() => loadPrefectureCoverDraft(code), [code])
  const candidates = useLiveQuery(() => getPrefectureCoverCandidates(code), [code], [])
  const [draft, setDraft] = useState<PrefectureCoverDraft>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (loaded && !draft) setDraft(loaded) }, [loaded, draft])
  if (!draft) return <div className="prefecture-cover-editor" role="dialog" aria-modal="true"><header><button type="button" onClick={close} aria-label="表紙編集を閉じる"><X /></button><strong>表紙を編集</strong><span /></header><p className="loading-note">表紙を読み込んでいます…</p></div>
  const selectFile = async (file?: File) => {
    if (!file) return
    try {
      setProcessing(true); setMessage('')
      const processed = await processImageFile(file)
      setDraft({ kind: 'new', processed, previewBlob: processed.imageBlob, thumbnailBlob: processed.thumbnailBlob, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })
      setCropOpen(true)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '写真を読み込めませんでした') }
    finally { setProcessing(false) }
  }
  const save = async () => {
    try { setSaving(true); setMessage(''); await savePrefectureCover(code, draft); close() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '表紙を保存できませんでした') }
    finally { setSaving(false) }
  }
  return <div className="prefecture-cover-editor" role="dialog" aria-modal="true" aria-label={`${prefectureName(code)}の表紙を編集`}>
    <header><button type="button" onClick={close} aria-label="表紙編集を閉じる"><X /></button><strong>表紙を編集</strong><span /></header>
    <section className="prefecture-cover-editor-body"><div className="trip-cover-heading"><div><span>PREFECTURE COVER</span><h2>{prefectureName(code)}の表紙</h2></div><small>任意</small></div>
      {draft.previewBlob ? <CroppedBlobImage blob={draft.previewBlob} alt="都道府県詳細の表紙プレビュー" crop={draft.heroCrop} /> : <div className="prefecture-cover-empty"><Images /><span>現在は既定の表示です</span></div>}
      <p>{draft.kind === 'registered' ? '登録済みスポットの写真を一覧と詳細で共通使用します。' : draft.kind === 'asset' || draft.kind === 'new' ? 'カメラロールの写真を一覧と詳細で共通使用します。' : '画像を設定しない場合は、これまでと同じ既定表示になります。'}</p>
      {draft.previewBlob && draft.kind !== 'default' && <button className="prefecture-crop-trigger" type="button" onClick={() => setCropOpen(true)}><SlidersHorizontal />表示位置を調整</button>}
      <div className="trip-cover-actions"><button type="button" disabled={!candidates.length} onClick={() => setPickerOpen(true)}><Images />登録画像から</button><label className={processing ? 'disabled' : ''}><Camera />{processing ? '処理中…' : 'カメラロールから'}<input type="file" accept="image/*" disabled={processing} onChange={(event) => void selectFile(event.target.files?.[0])} /></label><button type="button" onClick={() => setDraft({ kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP })}><RotateCcw />既定に戻す</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
    <div className="prefecture-cover-save"><button type="button" disabled={processing || saving} onClick={() => void save()}><Check />{saving ? '保存中…' : 'この表紙を保存'}</button></div>
    {pickerOpen && <div className="cover-picker-modal" role="dialog" aria-modal="true" aria-label="都道府県の登録画像を選択"><header><button type="button" onClick={() => setPickerOpen(false)} aria-label="画像選択を閉じる"><X /></button><strong>登録画像から選択</strong><span /></header><div>{candidates.map((candidate) => <button type="button" key={candidate.imageId} onClick={() => { setDraft({ kind: 'registered', imageId: candidate.imageId, previewBlob: candidate.imageBlob, thumbnailBlob: candidate.thumbnailBlob, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP }); setPickerOpen(false); setCropOpen(true) }}><BlobImage blob={candidate.thumbnailBlob} imageKey={`${candidate.imageId}:thumbnail`} alt={candidate.spotName} /><span>{candidate.spotName}</span><ChevronRight /></button>)}</div></div>}
    {cropOpen && draft.previewBlob && <PrefectureCropModal blob={draft.previewBlob} listCrop={draft.listCrop} heroCrop={draft.heroCrop} update={(kind, crop) => setDraft({ ...draft, [kind === 'list' ? 'listCrop' : 'heroCrop']: crop })} close={() => setCropOpen(false)} />}
  </div>
}

function PrefectureCropModal({ blob, listCrop, heroCrop, update, close }: { blob: Blob; listCrop: ImageCrop; heroCrop: ImageCrop; update: (kind: 'list' | 'hero', crop: ImageCrop) => void; close: () => void }) {
  const [kind, setKind] = useState<'list' | 'hero'>('hero')
  const drag = useRef<{ x: number; y: number; crop: ImageCrop } | undefined>(undefined)
  const crop = kind === 'list' ? listCrop : heroCrop
  const change = (next: ImageCrop) => update(kind, { x: Math.max(0, Math.min(100, next.x)), y: Math.max(0, Math.min(100, next.y)), zoom: Math.max(1, Math.min(2.5, next.zoom)) })
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, crop } }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!drag.current) return; const rect = event.currentTarget.getBoundingClientRect(); change({ ...crop, x: drag.current.crop.x - (event.clientX - drag.current.x) / rect.width * 100, y: drag.current.crop.y - (event.clientY - drag.current.y) / rect.height * 100 }) }
  return <div className="cover-crop-modal" role="dialog" aria-modal="true" aria-label="都道府県表紙の切り取りを調整"><header><button type="button" onClick={close} aria-label="切り取り調整を閉じる"><X /></button><strong>表示位置を調整</strong><button type="button" onClick={close}><Check />完了</button></header><div className="cover-crop-tabs"><button className={kind === 'list' ? 'active' : ''} type="button" onClick={() => setKind('list')}>都道府県一覧</button><button className={kind === 'hero' ? 'active' : ''} type="button" onClick={() => setKind('hero')}>都道府県詳細</button></div><p>枠内をドラッグして位置を合わせ、スライダーで拡大します。</p><div className={`cover-crop-stage prefecture-${kind}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = undefined }}><CroppedBlobImage blob={blob} alt={`${kind === 'list' ? '都道府県一覧' : '都道府県詳細'}の切り取りプレビュー`} crop={crop} /></div><label className="cover-zoom"><span>拡大</span><input type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={(event) => change({ ...crop, zoom: Number(event.target.value) })} /><strong>{crop.zoom.toFixed(1)}×</strong></label><button className="cover-crop-reset" type="button" onClick={() => change(DEFAULT_CROP)}><RotateCcw />この表示を中央に戻す</button></div>
}
