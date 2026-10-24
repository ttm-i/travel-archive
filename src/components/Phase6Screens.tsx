import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Check, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { createBackup, downloadBackup, estimateBackupBytes, inspectBackup, markBackupSaved, restoreBackup, type PreparedRestore } from '../backupRepository'
import { db } from '../db'
import { permanentlyDeleteSpot, permanentlyDeleteTrip, permanentlyDeleteVisit, restoreDetachedVisit, restoreSpot, restoreTrip } from '../trashRepository'

function BackHeader({ title, back }: { title: string; back: () => void }) { return <header className="back-header"><button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button><strong>{title}</strong><div /></header> }

export function BackupScreen({ back }: { back: () => void }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const lastBackupAt = useLiveQuery(async () => (await db.metadata.get('lastBackupSavedAt'))?.value as string | undefined)
  const create = async () => {
    try {
      setBusy(true); setStatus('')
      const bytes = await estimateBackupBytes()
      if (bytes > 250 * 1024 * 1024 && !window.confirm(`写真が約${Math.ceil(bytes / 1024 / 1024)}MBあります。バックアップ作成を続けますか？`)) return
      const result = await createBackup(setStatus)
      const file = new File([result.blob], result.filename, { type: 'application/zip' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Travel Archive バックアップ' })
      else downloadBackup(result.blob, result.filename)
      await markBackupSaved(result.manifest.createdAt)
      setStatus('バックアップを作成しました。「ファイル」またはiCloud Driveへ保存してください。')
    } catch (error) { setStatus(error instanceof DOMException && error.name === 'AbortError' ? '保存をキャンセルしました。バックアップ日時は更新していません。' : error instanceof Error ? `作成できませんでした。${error.message}` : 'バックアップを作成できませんでした。') }
    finally { setBusy(false) }
  }
  return <main className="screen sub-screen phase6-screen"><BackHeader title="バックアップ" back={back} /><section className="phase6-intro"><Download /><span>COMPLETE BACKUP</span><h1>旅の記録を、一つのZIPに</h1><p>旅行・スポット・カテゴリ・写真をすべて端末内でまとめます。外部サーバーへ送信しません。</p></section><section className="backup-summary"><span>前回のバックアップ</span><strong>{lastBackupAt ? new Date(lastBackupAt).toLocaleString('ja-JP') : 'まだありません'}</strong><p>iPhoneのWebサイトデータを削除すると記録も消えます。定期的に保存してください。</p></section>{status && <p className="phase6-status" role="status">{status}</p>}<div className="phase6-primary"><button type="button" disabled={busy} onClick={() => void create()}><Download />{busy ? '作成中…' : '完全バックアップを作成'}</button></div></main>
}

export function RestoreScreen({ back }: { back: () => void }) {
  const [prepared, setPrepared] = useState<PreparedRestore>()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const select = async (file?: File) => { if (!file) return; try { setBusy(true); setPrepared(undefined); setStatus(''); setPrepared(await inspectBackup(file, setStatus)); setStatus('内容を確認してから復元してください。') } catch (error) { setStatus(error instanceof Error ? error.message : 'バックアップを読み込めませんでした') } finally { setBusy(false) } }
  const restore = async () => { if (!prepared || !window.confirm('現在の記録をすべて置き換えます。復元を実行しますか？')) return; try { setBusy(true); setStatus('安全にデータを置き換えています…'); await restoreBackup(prepared); setStatus('復元が完了しました。'); setPrepared(undefined) } catch { setStatus('復元できませんでした。現在の記録は変更されていません。') } finally { setBusy(false) } }
  return <main className="screen sub-screen phase6-screen"><BackHeader title="バックアップから復元" back={back} /><section className="phase6-intro"><Upload /><span>RESTORE</span><h1>保存した記録を戻す</h1><p>ZIPを検証したあと、現在の端末内データを完全に置き換えます。</p></section><label className="restore-file"><Upload /><strong>{busy ? '確認中…' : 'バックアップZIPを選ぶ'}</strong><input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => void select(event.target.files?.[0])} /></label>{prepared && <section className="restore-preview"><Check /><div><span>{new Date(prepared.manifest.createdAt).toLocaleString('ja-JP')} 作成</span><strong>旅行 {prepared.manifest.counts.trips}件・スポット {prepared.manifest.counts.spots}件</strong><small>訪問 {prepared.manifest.counts.visits}件・写真 {prepared.manifest.counts.images}枚</small></div></section>}{status && <p className="phase6-status" role="status">{status}</p>}{prepared && <div className="phase6-primary danger"><button type="button" disabled={busy} onClick={() => void restore()}><RotateCcw />現在のデータを置き換えて復元</button></div>}</main>
}

export function TrashScreen({ back }: { back: () => void }) {
  const rows = useLiveQuery(async () => {
    const [trips, spots, deletedVisits] = await Promise.all([db.trips.filter((item) => Boolean(item.deletedAt)).toArray(), db.spots.filter((item) => Boolean(item.deletedAt)).toArray(), db.visits.filter((item) => Boolean(item.deletedAt)).toArray()])
    const detached = (await Promise.all(deletedVisits.map(async (visit) => ({ visit, trip: await db.trips.get(visit.tripId), spot: await db.spots.get(visit.spotId) })))).filter(({ trip, spot }) => trip && !trip.deletedAt && spot)
    const detachedSpotIds = new Set(detached.map(({ visit }) => visit.spotId))
    return { trips, spots: spots.filter((spot) => !detachedSpotIds.has(spot.id)), detached }
  }, [], { trips: [], spots: [], detached: [] })
  const permanent = async (kind: 'trip' | 'spot', id: string, name: string) => { if (!window.confirm(`「${name}」を完全に削除しますか？バックアップがなければ元に戻せません。`)) return; if (kind === 'trip') await permanentlyDeleteTrip(id); else await permanentlyDeleteSpot(id) }
  const permanentVisit = async (id: string, name: string) => { if (!window.confirm(`「${name}」のこの旅行での記録を完全に削除しますか？`)) return; await permanentlyDeleteVisit(id) }
  return <main className="screen sub-screen phase6-screen"><BackHeader title="ゴミ箱" back={back} /><section className="phase6-intro compact"><Trash2 /><span>TRASH</span><h1>削除した記録</h1><p>復元するか、端末から完全に削除できます。</p></section>{!rows.trips.length && !rows.spots.length && !rows.detached.length ? <section className="trash-empty"><Trash2 /><strong>ゴミ箱は空です</strong></section> : <section className="trash-list">{rows.trips.map((trip) => <article key={trip.id}><div><span>旅行</span><strong>{trip.name}</strong></div><button type="button" onClick={() => void restoreTrip(trip.id)}><RotateCcw />復元</button><button className="permanent" type="button" onClick={() => void permanent('trip', trip.id, trip.name)}><Trash2 />完全削除</button></article>)}{rows.detached.map(({ visit, trip, spot }) => <article key={visit.id}><div><span>{trip?.name}から外したスポット</span><strong>{spot?.name}</strong></div><button type="button" onClick={() => void restoreDetachedVisit(visit.id)}><RotateCcw />復元</button><button className="permanent" type="button" onClick={() => void permanentVisit(visit.id, spot?.name ?? 'スポット')}><Trash2 />完全削除</button></article>)}{rows.spots.map((spot) => <article key={spot.id}><div><span>以前削除したスポット</span><strong>{spot.name}</strong></div><button type="button" onClick={() => void restoreSpot(spot.id)}><RotateCcw />復元</button><button className="permanent" type="button" onClick={() => void permanent('spot', spot.id, spot.name)}><Trash2 />完全削除</button></article>)}</section>}<p className="trash-warning"><AlertTriangle />完全削除した記録は、バックアップからのみ復旧できます。</p></main>
}
