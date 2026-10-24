import { db, makeId } from './db'
import { getVisitImages } from './imageOrder'
import type { ProcessedImage } from './imageProcessing'
import type { ImageCrop, Trip } from './types'

export const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 }

export type TripCoverDraft = {
  kind: 'default' | 'registered' | 'asset' | 'new'
  imageId?: string
  assetId?: string
  previewBlob?: Blob
  thumbnailBlob?: Blob
  processed?: ProcessedImage
  listCrop: ImageCrop
  heroCrop: ImageCrop
}

export type TripCoverCandidate = { imageId: string; imageBlob: Blob; thumbnailBlob: Blob; spotName: string }

export async function getTripCoverCandidates(tripId: string): Promise<TripCoverCandidate[]> {
  const visits = await db.visits.where('tripId').equals(tripId).filter((visit) => !visit.deletedAt).toArray()
  const rows = await Promise.all(visits.map(async (visit) => {
    const spot = await db.spots.get(visit.spotId)
    if (!spot || spot.deletedAt) return []
    const images = await getVisitImages(visit)
    return images.map((image) => ({ imageId: image.id, imageBlob: image.imageBlob, thumbnailBlob: image.thumbnailBlob, spotName: spot.name }))
  }))
  return rows.flat()
}

export async function loadTripCoverDraft(tripId: string): Promise<TripCoverDraft> {
  const trip = await db.trips.get(tripId)
  const crops = { listCrop: trip?.coverListCrop ?? DEFAULT_CROP, heroCrop: trip?.coverHeroCrop ?? DEFAULT_CROP }
  if (trip?.coverImageId) {
    const candidate = (await getTripCoverCandidates(tripId)).find((item) => item.imageId === trip.coverImageId)
    if (candidate) return { kind: 'registered', imageId: candidate.imageId, previewBlob: candidate.imageBlob, thumbnailBlob: candidate.thumbnailBlob, ...crops }
  }
  if (trip?.coverAssetId) {
    const asset = await db.coverAssets.get(trip.coverAssetId)
    if (asset?.ownerType === 'trip' && asset.ownerId === tripId) return { kind: 'asset', assetId: asset.id, previewBlob: asset.imageBlob, thumbnailBlob: asset.thumbnailBlob, ...crops }
  }
  return { kind: 'default', ...crops }
}

export async function resolveTripCover(trip: Trip) {
  const candidates = await getTripCoverCandidates(trip.id)
  if (trip.coverImageId) {
    const candidate = candidates.find((item) => item.imageId === trip.coverImageId)
    if (candidate) return { imageBlob: candidate.imageBlob, thumbnailBlob: candidate.thumbnailBlob, listCrop: trip.coverListCrop ?? DEFAULT_CROP, heroCrop: trip.coverHeroCrop ?? DEFAULT_CROP, explicit: true }
  }
  if (trip.coverAssetId) {
    const asset = await db.coverAssets.get(trip.coverAssetId)
    if (asset?.ownerType === 'trip' && asset.ownerId === trip.id) return { imageBlob: asset.imageBlob, thumbnailBlob: asset.thumbnailBlob, listCrop: trip.coverListCrop ?? DEFAULT_CROP, heroCrop: trip.coverHeroCrop ?? DEFAULT_CROP, explicit: true }
  }
  const fallback = candidates[0]
  return fallback ? { imageBlob: fallback.imageBlob, thumbnailBlob: fallback.thumbnailBlob, listCrop: DEFAULT_CROP, heroCrop: DEFAULT_CROP, explicit: false } : undefined
}

export async function saveTripCover(tripId: string, draft: TripCoverDraft) {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error('旅行が見つかりません')
  if (draft.kind === 'registered' && draft.imageId && !(await getTripCoverCandidates(tripId)).some((item) => item.imageId === draft.imageId)) throw new Error('選択した写真が見つかりません')
  const now = new Date()
  await db.transaction('rw', db.trips, db.coverAssets, async () => {
    let coverImageId: string | undefined
    let coverAssetId: string | undefined
    if (draft.kind === 'registered' && draft.imageId) {
      coverImageId = draft.imageId
    } else if (draft.kind === 'asset' && draft.assetId) {
      const asset = await db.coverAssets.get(draft.assetId)
      if (!asset || asset.ownerId !== tripId) throw new Error('表紙画像が見つかりません')
      coverAssetId = asset.id
    } else if (draft.kind === 'new' && draft.processed) {
      coverAssetId = makeId()
      await db.coverAssets.add({ id: coverAssetId, ownerType: 'trip', ownerId: tripId, imageBlob: draft.processed.imageBlob, thumbnailBlob: draft.processed.thumbnailBlob, mimeType: draft.processed.mimeType, width: draft.processed.width, height: draft.processed.height, createdAt: now })
    }
    await db.trips.update(tripId, { coverImageId, coverAssetId, coverListCrop: draft.listCrop, coverHeroCrop: draft.heroCrop, updatedAt: now })
    if (trip.coverAssetId && trip.coverAssetId !== coverAssetId) await db.coverAssets.delete(trip.coverAssetId)
  })
}
