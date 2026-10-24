import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Check, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { COMPLETE_BACKUP_SCOPE, createBackup, downloadBackup, estimateBackupBytes, inspectBackup, isFilteredBackup, markBackupSaved, restoreBackup, type BackupScope, type PreparedRestore } from '../backupRepository'
import { DEFAULT_MAP_FILTER, filterTripsForMap, mapFilterCount, type MapFilter } from '../browsingFilters'
import { db } from '../db'
import { permanentlyDeleteSpot, permanentlyDeleteTrip, permanentlyDeleteVisit, restoreDetachedVisit, restoreSpot, restoreTrip } from '../trashRepository'
import { DateRangeField } from './Phase2Screens'

function BackHeader({ title, back }: { title: string; back: () => void }) { return <header className="back-header"><button type="button" onClick={back} aria-label="戻る"><ArrowLeft /></button><strong>{title}</strong><div /></header> }

export function BackupScreen({ back }: { back: () => void }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'complete' | 'filtered'>('complete')
  const [filter, setFilter] = useState<MapFilter>(DEFAULT_MAP_FILTER)
  const lastBackupAt = useLiveQuery(async () => (await db.metadata.get('lastBackupSavedAt'))?.value as string | undefined)
  const companionCategories = useLiveQuery(() => db.companionCategories.orderBy('sortOrder').toArray(), [], [])
  const matchingTripCount = useLiveQuery(async () => {
    const [trips, links] = await Promise.all([db.trips.toArray(), db.tripCompanionCategories.toArray()])
    return filterTripsForMap(trips, links, filter).length
  }, [filter], 0)
  const invalidCustomRange = filter.period === 'custom' && (!filter.startDate || !filter.endDate)
  const hasFilter = mapFilterCount(filter) > 0
  const toggleCompanion = (id: string) => setFilter((current) => ({ ...current, companionCategoryIds: current.companionCategoryIds.includes(id) ? current.companionCategoryIds.filter((value) => value !== id) : [...current.companionCategoryIds, id] }))
  const create = async () => {
    try {
      setBusy(true); setStatus('')
      const scope: BackupScope = kind === 'filtered' ? { type: 'filtered', filter } : COMPLETE_BACKUP_SCOPE
      const bytes = await estimateBackupBytes(scope)
      if (bytes > 250 * 1024 * 1024 && !window.confirm(`写真が約${Math.ceil(bytes / 1024 / 1024)}MBあります。バックアップ作成を続けますか？`)) return
      const result = await createBackup(setStatus, scope)
      const file = new File([result.blob], result.filename, { type: 'application/zip' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Travel Archive バックアップ' })
      else downloadBackup(result.blob, result.filename)
      if (kind === 'complete') await markBackupSaved(result.manifest.createdAt)
      setStatus(kind === 'complete' ? '完全バックアップを作成しました。「ファイル」またはiCloud Driveへ保存してください。' : '条件付きバックアップを作成しました。前回の完全バックアップ日時は変更していません。')
    } catch (error) { setStatus(error instanceof DOMException && error.name === 'AbortError' ? '保存をキャンセルしました。バックアップ日時は更新していません。' : error instanceof Error ? `作成できませんでした。${error.message}` : 'バックアップを作成できませんでした。') }
    finally { setBusy(false) }
  }
  return <main className="screen sub-screen phase6-screen"><BackHeader title="バックアップ" back={back} /><section className="phase6-intro"><Download /><span>LOCAL BACKUP</span><h1>旅の記録をZIPに</h1><p>すべての記録、または条件に合う旅行だけを端末内でまとめます。外部サーバーへ送信しません。</p></section><section className="backup-summary"><span>前回の完全バックアップ</span><strong>{lastBackupAt ? new Date(lastBackupAt).toLocaleString('ja-JP') : 'まだありません'}</strong><p>条件付きバックアップでは、この日時と未バックアップの案内は更新されません。</p></section><section className="backup-kind-picker" aria-label="バックアップ範囲"><button type="button" className={kind === 'complete' ? 'selected' : ''} aria-pressed={kind === 'complete'} onClick={() => setKind('complete')}><strong>すべて</strong><span>災害復旧用の完全バックアップ</span></button><button type="button" className={kind === 'filtered' ? 'selected' : ''} aria-pressed={kind === 'filtered'} onClick={() => setKind('filtered')}><strong>条件を指定</strong><span>一部の旅行を書き出す</span></button></section>{kind === 'filtered' && <section className="backup-filter-panel"><header><span>EXPORT FILTER</span><strong>書き出す旅行</strong>{hasFilter ? <button type="button" onClick={() => setFilter(DEFAULT_MAP_FILTER)}>条件を解除</button> : null}</header><div><h2>期間</h2><div className="filter-option-list period-options">{([['all', 'すべて'], ['year', '今年'], ['past-year', '過去1年'], ['custom', '期間を指定']] as const).map(([value, label]) => <button className={filter.period === value ? 'selected' : ''} type="button" aria-pressed={filter.period === value} key={value} onClick={() => setFilter({ ...filter, period: value })}>{label}</button>)}</div>{filter.period === 'custom' && <DateRangeField startDate={filter.startDate} endDate={filter.endDate} ariaLabel="バックアップ期間を選択" hintLabel="開始日と終了日" emptyLabel="期間をカレンダーから選ぶ" onChange={(startDate, endDate) => setFilter({ ...filter, startDate, endDate })} />}</div><div><h2>誰と行ったか</h2><p>複数選んだ場合は、いずれかに当てはまる旅行を書き出します。</p><div className="filter-option-list">{companionCategories.map((category) => <button className={filter.companionCategoryIds.includes(category.id) ? 'selected' : ''} type="button" aria-pressed={filter.companionCategoryIds.includes(category.id)} key={category.id} onClick={() => toggleCompanion(category.id)}>{category.name}</button>)}</div></div><footer><span>条件に合う旅行</span><strong>{!hasFilter ? '条件を指定してください' : invalidCustomRange ? '期間を決定してください' : `${matchingTripCount}件`}</strong></footer></section>}{status && <p className="phase6-status" role="status">{status}</p>}<div className="phase6-primary"><button type="button" disabled={busy || (kind === 'filtered' && (!hasFilter || invalidCustomRange || matchingTripCount === 0))} onClick={() => void create()}><Download />{busy ? '作成中…' : kind === 'complete' ? '完全バックアップを作成' : !hasFilter ? '期間または同行者を指定' : `条件付きバックアップを作成（${matchingTripCount}件）`}</button></div></main>
}

export function RestoreScreen({ back }: { back: () => void }) {
  const [prepared, setPrepared] = useState<PreparedRestore>()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const select = async (file?: File) => { if (!file) return; try { setBusy(true); setPrepared(undefined); setStatus(''); setPrepared(await inspectBackup(file, setStatus)); setStatus('内容を確認してから復元してください。') } catch (error) { setStatus(error instanceof Error ? error.message : 'バックアップを読み込めませんでした') } finally { setBusy(false) } }
  const restore = async () => { if (!prepared) return; const filtered = isFilteredBackup(prepared.manifest); if (!window.confirm(filtered ? '条件付きバックアップを追加・更新します。現在の他の記録は残ります。復元しますか？' : '現在の記録をすべて置き換えます。復元を実行しますか？')) return; try { setBusy(true); setStatus(filtered ? '既存の記録を残して追加・更新しています…' : '安全にデータを置き換えています…'); await restoreBackup(prepared); setStatus(filtered ? '条件付きバックアップを追加・更新しました。' : '復元が完了しました。'); setPrepared(undefined) } catch { setStatus('復元できませんでした。現在の記録は変更されていません。') } finally { setBusy(false) } }
  const filtered = prepared ? isFilteredBackup(prepared.manifest) : false
  return <main className="screen sub-screen phase6-screen"><BackHeader title="バックアップから復元" back={back} /><section className="phase6-intro"><Upload /><span>RESTORE</span><h1>保存した記録を戻す</h1><p>完全バックアップは全置換し、条件付きバックアップは他の記録を残して追加・更新します。</p></section><label className="restore-file"><Upload /><strong>{busy ? '確認中…' : 'バックアップZIPを選ぶ'}</strong><input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => void select(event.target.files?.[0])} /></label>{prepared && <section className={`restore-preview ${filtered ? 'filtered' : ''}`}><Check /><div><span>{filtered ? '条件付きバックアップ' : '完全バックアップ'} · {new Date(prepared.manifest.createdAt).toLocaleString('ja-JP')} 作成</span><strong>旅行 {prepared.manifest.counts.trips}件・スポット {prepared.manifest.counts.spots}件</strong><small>訪問 {prepared.manifest.counts.visits}件・写真 {prepared.manifest.counts.images}枚</small></div></section>}{status && <p className="phase6-status" role="status">{status}</p>}{prepared && <div className={`phase6-primary ${filtered ? '' : 'danger'}`}><button type="button" disabled={busy} onClick={() => void restore()}><RotateCcw />{filtered ? '既存データを残して追加・更新' : '現在のデータを置き換えて復元'}</button></div>}</main>
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
