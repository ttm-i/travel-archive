import { ArrowLeft, ChevronRight, Compass, Image as ImageIcon, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { prefectureName } from '../prefectures'
import { resolvePrefectureCover } from '../prefectureCoverRepository'
import { getNavigationSnapshot, mergeNavigationSnapshot, setNavigationSnapshot } from '../navigationSnapshots'
import { BlobImage, CroppedBlobImage } from './BlobImage'
import { PrefectureCoverEditor } from './PrefectureCoverEditor'
import type { Spot } from '../types'

function BackHeader({ title, back, action }: { title: string; back: () => void; action?: React.ReactNode }) {
  return <header className="back-header"><button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button><strong>{title}</strong><div>{action}</div></header>
}

export function SavedPrefecturesHome({ openPrefecture }: { openPrefecture: (code: number) => void }) {
  const prefectures = useLiveQuery(async () => {
    const spots = await db.spots.filter((spot) => !spot.deletedAt).toArray()
    const codes = [...new Set(spots.map((spot) => spot.effectivePrefectureCode))].sort((a, b) => a - b)
    return Promise.all(codes.map(async (code) => {
      const prefectureSpots = spots.filter((spot) => spot.effectivePrefectureCode === code)
      const representative = prefectureSpots.find((spot) => spot.representativeImageId) ?? prefectureSpots[0]
      const [image, cover] = await Promise.all([
        representative?.representativeImageId ? db.images.get(representative.representativeImageId) : undefined,
        resolvePrefectureCover(code),
      ])
      return { code, count: prefectureSpots.length, imageId: image?.id, thumbnailBlob: image?.thumbnailBlob, cover }
    }))
  }, [], [])

  return <main className="screen">
    <header className="app-header"><div><span>PREFECTURES</span><h1>都道府県</h1></div></header>
    {prefectures.length ? <div className="prefecture-grid">{prefectures.map((item) => <button key={item.code} className="prefecture-card saved-prefecture-card" type="button" onClick={() => { setNavigationSnapshot('prefecture', item.code, { cover: item.cover, count: item.count }); openPrefecture(item.code) }}>{item.cover ? <CroppedBlobImage blob={item.cover.thumbnailBlob ?? item.cover.imageBlob} crop={item.cover.listCrop} alt={prefectureName(item.code)} /> : <BlobImage blob={item.thumbnailBlob} imageKey={item.imageId ? `${item.imageId}:thumbnail` : undefined} alt={prefectureName(item.code)} />}<div><strong>{prefectureName(item.code)}</strong><span>{item.count}スポット</span></div></button>)}</div> : <section className="empty-prefectures"><Compass /><div><strong>都道府県の記録はまだありません</strong><span>スポットを登録すると、ここから振り返れます。</span></div></section>}
    {prefectures.length ? <section className="empty-prefectures"><Compass /><div><strong>まだ見ぬ{47 - prefectures.length}都道府県</strong><span>次の旅で、地図に新しい色を。</span></div></section> : null}
  </main>
}

export function PrefectureDetail({ code, back, openSpot }: { code: number; back: () => void; openSpot: (id: string) => void }) {
  type SpotRow = { spot: Spot; imageId?: string; thumbnailBlob?: Blob; visitCount: number }
  type Snapshot = { cover?: Awaited<ReturnType<typeof resolvePrefectureCover>>; count: number; spots?: SpotRow[] }
  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const snapshot = getNavigationSnapshot<Snapshot>('prefecture', code)
  const coverResult = useLiveQuery(async () => ({ cover: await resolvePrefectureCover(code) }), [code])
  const spotsResult = useLiveQuery(async () => {
    const rows = await db.spots.where('effectivePrefectureCode').equals(code).filter((spot) => !spot.deletedAt).toArray()
    return Promise.all(rows.map(async (spot) => {
      const [image, visitCount] = await Promise.all([
        spot.representativeImageId ? db.images.get(spot.representativeImageId) : undefined,
        db.visits.where('spotId').equals(spot.id).filter((visit) => !visit.deletedAt).count(),
      ])
      return { spot, imageId: image?.id, thumbnailBlob: image?.thumbnailBlob, visitCount }
    }))
  }, [code]) as SpotRow[] | undefined
  const cover = coverResult ? coverResult.cover : snapshot?.cover
  const spots = spotsResult ?? snapshot?.spots ?? []
  const count = spotsResult?.length ?? snapshot?.count ?? 0
  useEffect(() => {
    if (!coverResult || !spotsResult) return
    setNavigationSnapshot<Snapshot>('prefecture', code, { cover: coverResult.cover, count: spotsResult.length, spots: spotsResult })
  }, [code, coverResult, spotsResult])

  return <main className="screen sub-screen prefecture-detail-screen">
    <BackHeader title="都道府県の記録" back={back} action={<button className="prefecture-cover-edit" type="button" aria-label={`${prefectureName(code)}のタイトル画像を編集`} onClick={() => setCoverEditorOpen(true)}><ImageIcon /><span>表紙</span></button>} />
    <section className={`prefecture-detail-hero${cover ? ' has-cover' : ''}`}>{cover && <CroppedBlobImage blob={cover.imageBlob} crop={cover.heroCrop} alt="" />}<div><span>PREFECTURE</span><h1>{prefectureName(code)}</h1><p>{count}スポットを記録しています</p></div></section>
    <section className="content-section"><div className="section-heading"><div><span>PLACES</span><h2>訪れたスポット</h2></div><small>{spots.length}件</small></div>
      {spots.length ? <div className="spot-list">{spots.map(({ spot, imageId, thumbnailBlob, visitCount }) => <button type="button" key={spot.id} onClick={() => { mergeNavigationSnapshot('spot', spot.id, { spot, previewImage: { id: imageId, blob: thumbnailBlob } }); openSpot(spot.id) }}><BlobImage blob={thumbnailBlob} imageKey={imageId ? `${imageId}:thumbnail` : undefined} alt={spot.name} /><div><strong>{spot.name}</strong><span><MapPin />{visitCount}回の旅行で訪問</span></div><ChevronRight /></button>)}</div> : <p className="loading-note">{spotsResult ? 'この都道府県のスポットはありません。' : '記録を読み込んでいます…'}</p>}
    </section>
    {coverEditorOpen && <PrefectureCoverEditor code={code} close={() => setCoverEditorOpen(false)} />}
  </main>
}
