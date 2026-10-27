import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Images, MapPin, X } from 'lucide-react'
import type { TravelImage } from '../types'
import { BlobImage } from './BlobImage'

export type GalleryPhoto = {
  image: TravelImage
  spotId: string
  spotName: string
  contextLabel?: string
}

export type PhotoGalleryGroup = {
  spotId: string
  spotName: string
  photos: GalleryPhoto[]
}

export function DetailViewSwitch({ mode, changeMode, disabled = false }: { mode: 'spots' | 'photos'; changeMode: (mode: 'spots' | 'photos') => void; disabled?: boolean }) {
  return <div className="detail-view-switch" aria-label="表示方法">
    <button className={mode === 'spots' ? 'active' : ''} type="button" aria-pressed={mode === 'spots'} onClick={() => changeMode('spots')}>スポット</button>
    <button className={mode === 'photos' ? 'active' : ''} type="button" aria-pressed={mode === 'photos'} disabled={disabled} onClick={() => changeMode('photos')}>写真</button>
  </div>
}

export function ContextPhotoGallery({ groups, loading, openSpot }: { groups: PhotoGalleryGroup[]; loading: boolean; openSpot: (id: string) => void }) {
  const [viewerIndex, setViewerIndex] = useState<number>()
  const photos = groups.flatMap((group) => group.photos)
  if (loading) return <section className="context-photo-gallery"><p className="photo-gallery-status"><Images />写真を準備しています…</p></section>
  if (!photos.length) return <section className="context-photo-gallery"><p className="photo-gallery-status"><Images />表示できる写真はまだありません。</p></section>
  return <section className="context-photo-gallery">
    {groups.filter((group) => group.photos.length).map((group) => <section className="context-photo-group" key={group.spotId}>
      <button className="context-photo-group-heading" type="button" onClick={() => openSpot(group.spotId)}><div><span>SPOT</span><strong>{group.spotName}</strong></div><small>{group.photos.length}枚</small><ChevronRight /></button>
      <div className="context-photo-grid">{group.photos.map((photo) => {
        const index = photos.findIndex((item) => item.image.id === photo.image.id)
        return <button type="button" key={photo.image.id} aria-label={`${photo.spotName}の写真を全画面表示`} onClick={() => setViewerIndex(index)}><BlobImage blob={photo.image.thumbnailBlob} imageKey={`${photo.image.id}:thumbnail`} alt={photo.spotName} />{photo.contextLabel && <span>{photo.contextLabel}</span>}</button>
      })}</div>
    </section>)}
    {viewerIndex !== undefined && photos[viewerIndex] && <ContextPhotoViewer photos={photos} index={viewerIndex} setIndex={setViewerIndex} close={() => setViewerIndex(undefined)} openSpot={(id) => { setViewerIndex(undefined); openSpot(id) }} />}
  </section>
}

function ContextPhotoViewer({ photos, index, setIndex, close, openSpot }: { photos: GalleryPhoto[]; index: number; setIndex: (index: number) => void; close: () => void; openSpot: (id: string) => void }) {
  const [scale, setScale] = useState(1)
  const [direction, setDirection] = useState<'next' | 'previous' | 'none'>('none')
  const gesture = useRef<{ startX?: number; distance?: number; startScale?: number }>({})
  const photo = photos[index]
  useEffect(() => setScale(1), [index])
  const moveTo = (next: number) => {
    if (next < 0 || next >= photos.length || next === index) return
    setDirection(next > index ? 'next' : 'previous')
    setIndex(next)
  }
  const touchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  const touchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) gesture.current = { distance: touchDistance(event.touches), startScale: scale }
    else if (event.touches.length === 1) gesture.current = { startX: event.touches[0].clientX }
  }
  const touchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !gesture.current.distance) return
    event.preventDefault()
    setScale(Math.min(4, Math.max(1, (gesture.current.startScale ?? 1) * touchDistance(event.touches) / gesture.current.distance)))
  }
  const touchEnd = (event: React.TouchEvent) => {
    const startX = gesture.current.startX
    if (startX !== undefined && scale === 1 && event.changedTouches[0]) {
      const delta = event.changedTouches[0].clientX - startX
      if (delta < -55) moveTo(index + 1)
      if (delta > 55) moveTo(index - 1)
    }
    gesture.current = {}
  }
  return createPortal(<div className="photo-viewer context-photo-viewer" role="dialog" aria-modal="true" aria-label="写真を全画面表示">
    <header><button type="button" onClick={close} aria-label="写真を閉じる"><X /></button><strong>{index + 1} / {photos.length}</strong><button type="button" disabled={scale === 1} onClick={() => setScale(1)}>等倍</button></header>
    <div className="photo-viewer-stage" onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}><div key={photo.image.id} className={`photo-viewer-image photo-${direction}`} style={{ transform: `scale(${scale})` }}><BlobImage blob={photo.image.imageBlob} imageKey={`${photo.image.id}:full`} alt={photo.spotName} /></div></div>
    <section className="context-photo-caption"><button type="button" onClick={() => openSpot(photo.spotId)}><MapPin /><div><strong>{photo.spotName}</strong>{photo.contextLabel && <span>{photo.contextLabel}</span>}</div><ChevronRight /></button></section>
    <div className="photo-viewer-controls"><button type="button" aria-label="前の写真" disabled={index === 0} onClick={() => moveTo(index - 1)}><ChevronLeft /></button><span>左右にスワイプ・ピンチで拡大</span><button type="button" aria-label="次の写真" disabled={index === photos.length - 1} onClick={() => moveTo(index + 1)}><ChevronRight /></button></div>
  </div>, document.body)
}
