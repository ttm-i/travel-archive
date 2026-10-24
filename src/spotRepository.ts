import { db, makeId } from './db'
import { getVisitImages } from './imageOrder'
import type { ProcessedImage } from './imageProcessing'
import type { TravelImage } from './types'

export interface NewSpotInput {
  tripId: string
  name: string
  latitude: number
  longitude: number
  detectedPrefectureCode?: number
  effectivePrefectureCode: number
  prefectureOverridden?: boolean
  spotCategoryId?: string
  images: ProcessedImage[]
  mainImageIndex: number
}

export type SpotEditPhoto = {
  key: string
  image?: TravelImage
  processed?: ProcessedImage
}

export type SpotEditVisit = {
  visitId: string
  tripId: string
  tripName: string
  tripStartDate: string
  photos: SpotEditPhoto[]
}

export type SpotEditInput = {
  spotId: string
  name: string
  spotCategoryId?: string
  latitude: number
  longitude: number
  representativeKey?: string
  visits: { visitId: string; photos: SpotEditPhoto[] }[]
}

export function validateJapanCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 20 && latitude <= 46 && longitude >= 122 && longitude <= 154
}

export async function createSpotWithVisit(input: NewSpotInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('スポット名を入力してください')
  if (!validateJapanCoordinate(input.latitude, input.longitude)) throw new Error('日本国内の座標を指定してください')
  if (!input.images.length) throw new Error('写真を1枚以上選んでください')
  const allowedPrefectures = await db.tripPrefectures.where('tripId').equals(input.tripId).toArray()
  if (!allowedPrefectures.some((item) => item.prefectureCode === input.effectivePrefectureCode)) throw new Error('旅行で選択した都道府県を指定してください')
  const now = new Date()
  const spotId = makeId()
  const visitId = makeId()
  const imageIds = input.images.map(() => makeId())
  const safeMainIndex = Math.min(Math.max(input.mainImageIndex, 0), input.images.length - 1)
  await db.transaction('rw', db.spots, db.visits, db.images, async () => {
    await db.spots.add({
      id: spotId,
      name,
      latitude: Number(input.latitude.toFixed(5)),
      longitude: Number(input.longitude.toFixed(5)),
      detectedPrefectureCode: input.detectedPrefectureCode,
      effectivePrefectureCode: input.effectivePrefectureCode,
      prefectureOverridden: input.prefectureOverridden ?? input.detectedPrefectureCode !== input.effectivePrefectureCode,
      spotCategoryId: input.spotCategoryId || undefined,
      representativeImageId: imageIds[safeMainIndex],
      createdAt: now,
      updatedAt: now,
    })
    await db.visits.add({ id: visitId, tripId: input.tripId, spotId, coverImageId: imageIds[safeMainIndex], photoOrder: imageIds, createdAt: now, updatedAt: now })
    await db.images.bulkAdd(input.images.map((image, index) => ({
      id: imageIds[index],
      visitId,
      imageBlob: image.imageBlob,
      thumbnailBlob: image.thumbnailBlob,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      sortOrder: index,
      createdAt: now,
    })))
  })
  return { spotId, visitId }
}

export async function addExistingSpotVisit(tripId: string, spotId: string, images: ProcessedImage[] = [], mainImageIndex = 0) {
  const existing = await db.visits.where('[tripId+spotId]').equals([tripId, spotId]).first()
  if (existing && !existing.deletedAt) throw new Error('この旅行にはすでに登録されています')
  const [spot, allowedPrefectures] = await Promise.all([
    db.spots.get(spotId),
    db.tripPrefectures.where('tripId').equals(tripId).toArray(),
  ])
  if (!spot || spot.deletedAt) throw new Error('スポットが見つかりません')
  if (!allowedPrefectures.some((item) => item.prefectureCode === spot.effectivePrefectureCode)) throw new Error('この旅行で選択した都道府県のスポットではありません')
  const now = new Date()
  const visitId = existing?.id ?? makeId()
  const existingImages = existing ? await getVisitImages(existing) : []
  const imageIds = images.map(() => makeId())
  const photoOrder = [...existingImages.map((image) => image.id), ...imageIds]
  const safeMainIndex = images.length ? Math.min(Math.max(mainImageIndex, 0), images.length - 1) : -1
  await db.transaction('rw', db.visits, db.images, async () => {
    const coverImageId = safeMainIndex >= 0 ? imageIds[safeMainIndex] : existing?.coverImageId && photoOrder.includes(existing.coverImageId) ? existing.coverImageId : photoOrder[0]
    await db.visits.put({ id: visitId, tripId, spotId, coverImageId, photoOrder, createdAt: existing?.createdAt ?? now, updatedAt: now })
    if (images.length) await db.images.bulkAdd(images.map((image, index) => ({ id: imageIds[index], visitId, imageBlob: image.imageBlob, thumbnailBlob: image.thumbnailBlob, mimeType: image.mimeType, width: image.width, height: image.height, sortOrder: index, createdAt: now })))
  })
  return visitId
}

export async function setSpotRepresentativeImage(spotId: string, imageId: string) {
  const [spot, image] = await Promise.all([db.spots.get(spotId), db.images.get(imageId)])
  if (!spot || spot.deletedAt || !image) throw new Error('写真が見つかりません')
  const visit = await db.visits.get(image.visitId)
  if (!visit || visit.deletedAt || visit.spotId !== spotId) throw new Error('このスポットの写真ではありません')
  await db.spots.update(spotId, { representativeImageId: imageId, updatedAt: new Date() })
}

export async function deleteSpotImage(spotId: string, imageId: string) {
  const [spot, image] = await Promise.all([db.spots.get(spotId), db.images.get(imageId)])
  if (!spot || spot.deletedAt || !image) throw new Error('写真が見つかりません')
  const sourceVisit = await db.visits.get(image.visitId)
  if (!sourceVisit || sourceVisit.deletedAt || sourceVisit.spotId !== spotId) throw new Error('このスポットの写真ではありません')

  const activeVisits = await db.visits.where('spotId').equals(spotId).filter((visit) => !visit.deletedAt).toArray()
  const imageGroups = await Promise.all(activeVisits.map(getVisitImages))
  const visibleImages = imageGroups.flat()
  if (visibleImages.length <= 1) throw new Error('スポットには写真が1枚以上必要です')

  let nextRepresentativeImageId = spot.representativeImageId
  await db.transaction('rw', db.spots, db.visits, db.images, db.trips, db.prefectureCovers, async () => {
    await db.images.delete(imageId)
    await db.trips.where('coverImageId').equals(imageId).modify({ coverImageId: undefined, coverListCrop: undefined, coverHeroCrop: undefined, updatedAt: new Date() })
    await db.prefectureCovers.where('imageId').equals(imageId).delete()
    const remainingVisible = visibleImages.filter((item) => item.id !== imageId)
    if (spot.representativeImageId === imageId || !remainingVisible.some((item) => item.id === spot.representativeImageId)) {
      nextRepresentativeImageId = remainingVisible[0]?.id
      await db.spots.update(spotId, { representativeImageId: nextRepresentativeImageId, updatedAt: new Date() })
    } else {
      await db.spots.update(spotId, { updatedAt: new Date() })
    }
    const remainingInVisit = imageGroups[activeVisits.findIndex((visit) => visit.id === sourceVisit.id)]?.filter((item) => item.id !== imageId) ?? []
    await db.visits.update(sourceVisit.id, {
      photoOrder: remainingInVisit.map((item) => item.id),
      coverImageId: sourceVisit.coverImageId === imageId ? remainingInVisit[0]?.id : sourceVisit.coverImageId,
      updatedAt: new Date(),
    })
    // Photo order belongs to the visit. Never rewrite a retained record containing
    // Blobs: doing so can invalidate its object URL in iOS Safari until restart.
  })
  return { representativeImageId: nextRepresentativeImageId }
}

export async function getTripSpots(tripId: string) {
  const visits = await db.visits.where('tripId').equals(tripId).filter((visit) => !visit.deletedAt).toArray()
  return Promise.all(visits.map(async (visit) => {
    const spot = await db.spots.get(visit.spotId)
    if (!spot || spot.deletedAt) return undefined
    const imageId = spot.representativeImageId ?? visit.coverImageId
    const image = imageId ? await db.images.get(imageId) : undefined
    return { visit, spot, imageId: image?.id, thumbnailBlob: image?.thumbnailBlob }
  })).then((items) => items.flatMap((item) => item ? [item] : []))
}

export async function getReusableSpots(tripId: string) {
  const [prefectureLinks, visits] = await Promise.all([
    db.tripPrefectures.where('tripId').equals(tripId).toArray(),
    db.visits.where('tripId').equals(tripId).toArray(),
  ])
  const prefectures = new Set(prefectureLinks.map((item) => item.prefectureCode))
  const used = new Set(visits.filter((visit) => !visit.deletedAt).map((visit) => visit.spotId))
  const spots = await db.spots.filter((spot) => !spot.deletedAt && prefectures.has(spot.effectivePrefectureCode) && !used.has(spot.id)).toArray()
  return Promise.all(spots.map(async (spot) => {
    const image = spot.representativeImageId ? await db.images.get(spot.representativeImageId) : undefined
    return { spot, imageId: image?.id, thumbnailBlob: image?.thumbnailBlob }
  }))
}

export async function getSpotEditData(spotId: string) {
  const spot = await db.spots.get(spotId)
  if (!spot || spot.deletedAt) return undefined
  const visits = await db.visits.where('spotId').equals(spotId).filter((visit) => !visit.deletedAt).toArray()
  const rows = await Promise.all(visits.map(async (visit): Promise<SpotEditVisit | undefined> => {
    const trip = await db.trips.get(visit.tripId)
    if (!trip || trip.deletedAt) return undefined
    const images = await getVisitImages(visit)
    return { visitId: visit.id, tripId: trip.id, tripName: trip.name, tripStartDate: trip.startDate, photos: images.map((image) => ({ key: image.id, image })) }
  }))
  return { spot, visits: rows.flatMap((row) => row ? [row] : []).sort((a, b) => b.tripStartDate.localeCompare(a.tripStartDate)) }
}

export async function saveSpotEdits(input: SpotEditInput) {
  const spot = await db.spots.get(input.spotId)
  if (!spot || spot.deletedAt) throw new Error('スポットが見つかりません')
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('スポット名を入力してください')
  if (!validateJapanCoordinate(input.latitude, input.longitude)) throw new Error('日本国内の座標を指定してください')
  if (!input.visits.flatMap((visit) => visit.photos).length) throw new Error('スポットには写真が1枚以上必要です')

  const activeVisits = await db.visits.where('spotId').equals(input.spotId).filter((visit) => !visit.deletedAt).toArray()
  const activeVisitIds = new Set(activeVisits.map((visit) => visit.id))
  if (input.visits.some((visit) => !activeVisitIds.has(visit.visitId))) throw new Error('旅行との関連が変更されています。画面を開き直してください')
  const originalGroups = await Promise.all(activeVisits.map(getVisitImages))
  const originalImages = originalGroups.flat()
  const originalIds = new Set(originalImages.map((image) => image.id))
  const requestedExistingIds = new Set(input.visits.flatMap((visit) => visit.photos).filter((photo) => photo.image).map((photo) => photo.image!.id))
  if ([...requestedExistingIds].some((id) => !originalIds.has(id))) throw new Error('写真の内容が変更されています。画面を開き直してください')
  const deletedIds = [...originalIds].filter((id) => !requestedExistingIds.has(id))
  const newIds = new Map<string, string>()
  for (const photo of input.visits.flatMap((visit) => visit.photos)) if (photo.processed) newIds.set(photo.key, makeId())
  const resolveKey = (key?: string) => key && (originalIds.has(key) ? key : newIds.get(key))
  const now = new Date()

  await db.transaction('rw', db.spots, db.visits, db.images, db.trips, db.prefectureCovers, async () => {
    if (deletedIds.length) {
      await db.images.bulkDelete(deletedIds)
      for (const imageId of deletedIds) {
        await db.trips.where('coverImageId').equals(imageId).modify({ coverImageId: undefined, coverListCrop: undefined, coverHeroCrop: undefined, updatedAt: now })
        await db.prefectureCovers.where('imageId').equals(imageId).delete()
      }
    }
    for (const visitDraft of input.visits) {
      const resolvedIds: string[] = []
      for (let index = 0; index < visitDraft.photos.length; index += 1) {
        const photo = visitDraft.photos[index]
        const id = resolveKey(photo.key)
        if (!id) continue
        resolvedIds.push(id)
        if (photo.processed) await db.images.add({ id, visitId: visitDraft.visitId, imageBlob: photo.processed.imageBlob, thumbnailBlob: photo.processed.thumbnailBlob, mimeType: photo.processed.mimeType, width: photo.processed.width, height: photo.processed.height, sortOrder: index, createdAt: now })
      }
      const visit = activeVisits.find((item) => item.id === visitDraft.visitId)
      const coverImageId = visit?.coverImageId && resolvedIds.includes(visit.coverImageId) ? visit.coverImageId : resolvedIds[0]
      await db.visits.update(visitDraft.visitId, { coverImageId, photoOrder: resolvedIds, updatedAt: now })
    }
    const allResolvedIds = input.visits.flatMap((visit) => visit.photos).map((photo) => resolveKey(photo.key)).flatMap((id) => id ? [id] : [])
    const requestedRepresentativeId = resolveKey(input.representativeKey)
    const representativeImageId = requestedRepresentativeId && allResolvedIds.includes(requestedRepresentativeId)
      ? requestedRepresentativeId
      : spot.representativeImageId && allResolvedIds.includes(spot.representativeImageId) ? spot.representativeImageId : allResolvedIds[0]
    await db.spots.update(input.spotId, {
      name,
      spotCategoryId: input.spotCategoryId || undefined,
      latitude: Number(input.latitude.toFixed(5)),
      longitude: Number(input.longitude.toFixed(5)),
      representativeImageId,
      updatedAt: now,
    })
  })
}

