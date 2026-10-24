import { DEFAULT_CROP } from './coverRepository'
import { db, makeId } from './db'
import { getVisitImages } from './imageOrder'
import type { ProcessedImage } from './imageProcessing'
import type { ImageCrop } from './types'

export type PrefectureCoverCandidate = {
  imageId: string
  imageBlob: Blob
  thumbnailBlob: Blob
  spotName: string
}

export type PrefectureCoverDraft = {
  kind: 'default' | 'registered' | 'asset' | 'new'
  imageId?: string
  assetId?: string
  previewBlob?: Blob
  thumbnailBlob?: Blob
  processed?: ProcessedImage
  listCrop: ImageCrop
  heroCrop: ImageCrop
}

export async function getPrefectureCoverCandidates(prefectureCode: number): Promise<PrefectureCoverCandidate[]> {
  const spots = await db.spots.where('effectivePrefectureCode').equals(prefectureCode).filter((spot) => !spot.deletedAt).toArray()
  const rows = await Promise.all(spots.map(async (spot) => {
    const visits = await db.visits.where('spotId').equals(spot.id).filter((visit) => !visit.deletedAt).toArray()
    const groups = await Promise.all(visits.map(getVisitImages))
    return groups.flat().map((image) => ({ imageId: image.id, imageBlob: image.imageBlob, thumbnailBlob: image.thumbnailBlob, spotName: spot.name }))
  }))
  return rows.flat()
}

export async function loadPrefectureCoverDraft(prefectureCode: number): Promise<PrefectureCoverDraft> {
  const cover = await db.prefectureCovers.get(prefectureCode)
  if (cover?.imageId) {
    const candidate = (await getPrefectureCoverCandidates(prefectureCode)).find((item) => item.imageId === cover.imageId)
    if (candidate) return { kind: 'registered', imageId: candidate.imageId, previewBlob: candidate.imageBlob, thumbnailBlob: candidate.thumbnailBlob, listCrop: cover.listCrop ?? DEFAULT_CROP, heroCrop: cover.heroCrop ?? DEFAULT_CROP }
  }
  if (cover?.assetId) {
    const asset = await db.coverAssets.get(cover.assetId)
    if (asset?.ownerType === 'prefecture' && asset.ownerId === String(prefectureCode)) return { kind: 'asset', assetId: asset.id, previewBlob: asset.imageBlob, thumbnailBlob: asset.thumbnailBlob, listCrop: cover.listCrop ?? DEFAULT_CROP, heroCrop: cover.heroCrop ?? DEFAULT_CROP }
  }
  return { kind: 'default', listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP }
}

export async function resolvePrefectureCover(prefectureCode: number) {
  const draft = await loadPrefectureCoverDraft(prefectureCode)
  return draft.kind === 'default' || !draft.previewBlob ? undefined : { imageBlob: draft.previewBlob, thumbnailBlob: draft.thumbnailBlob, listCrop: draft.listCrop, heroCrop: draft.heroCrop }
}

export async function savePrefectureCover(prefectureCode: number, draft: PrefectureCoverDraft) {
  const existing = await db.prefectureCovers.get(prefectureCode)
  if (draft.kind === 'registered' && draft.imageId && !(await getPrefectureCoverCandidates(prefectureCode)).some((item) => item.imageId === draft.imageId)) throw new Error('選択した写真が見つかりません')
  const now = new Date()
  await db.transaction('rw', db.prefectureCovers, db.coverAssets, async () => {
    let imageId: string | undefined
    let assetId: string | undefined
    if (draft.kind === 'registered' && draft.imageId) {
      imageId = draft.imageId
    } else if (draft.kind === 'asset' && draft.assetId) {
      const asset = await db.coverAssets.get(draft.assetId)
      if (!asset || asset.ownerType !== 'prefecture' || asset.ownerId !== String(prefectureCode)) throw new Error('表紙画像が見つかりません')
      assetId = asset.id
    } else if (draft.kind === 'new' && draft.processed) {
      assetId = makeId()
      await db.coverAssets.add({ id: assetId, ownerType: 'prefecture', ownerId: String(prefectureCode), imageBlob: draft.processed.imageBlob, thumbnailBlob: draft.processed.thumbnailBlob, mimeType: draft.processed.mimeType, width: draft.processed.width, height: draft.processed.height, createdAt: now })
    }
    if (draft.kind === 'default') await db.prefectureCovers.delete(prefectureCode)
    else await db.prefectureCovers.put({ prefectureCode, imageId, assetId, listCrop: draft.listCrop, heroCrop: draft.heroCrop, updatedAt: now })
    if (existing?.assetId && existing.assetId !== assetId) await db.coverAssets.delete(existing.assetId)
  })
}

export async function clearPrefectureCoversUsingImages(imageIds: string[]) {
  if (!imageIds.length) return
  const now = new Date()
  for (const imageId of imageIds) await db.prefectureCovers.where('imageId').equals(imageId).modify({ imageId: undefined, updatedAt: now })
}
