type SnapshotKind = 'trip' | 'spot' | 'prefecture'

import { resolveTripCover } from './coverRepository'
import { db } from './db'
import { getVisitImages } from './imageOrder'
import { resolvePrefectureCover } from './prefectureCoverRepository'
import { getTripSpots } from './spotRepository'

const snapshots = new Map<string, unknown>()
const MAX_SNAPSHOTS = 40

function key(kind: SnapshotKind, id: string | number) {
  return `${kind}:${id}`
}

export function getNavigationSnapshot<T>(kind: SnapshotKind, id: string | number) {
  const snapshotKey = key(kind, id)
  const value = snapshots.get(snapshotKey) as T | undefined
  if (value !== undefined) {
    snapshots.delete(snapshotKey)
    snapshots.set(snapshotKey, value)
  }
  return value
}

export function setNavigationSnapshot<T>(kind: SnapshotKind, id: string | number, value: T) {
  const snapshotKey = key(kind, id)
  snapshots.delete(snapshotKey)
  snapshots.set(snapshotKey, value)
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value as string | undefined
    if (!oldest) break
    snapshots.delete(oldest)
  }
}

export function mergeNavigationSnapshot<T extends object>(kind: SnapshotKind, id: string | number, value: Partial<T>) {
  const current = getNavigationSnapshot<T>(kind, id)
  setNavigationSnapshot(kind, id, { ...current, ...value } as T)
}

export function clearNavigationSnapshots() {
  snapshots.clear()
}

export async function prepareTripNavigationSnapshot(id: string) {
  const trip = await db.trips.get(id)
  if (!trip) return
  const [companionLinks, prefectureLinks, tripSpots, cover] = await Promise.all([
    db.tripCompanionCategories.where('tripId').equals(id).toArray(),
    db.tripPrefectures.where('tripId').equals(id).toArray(),
    getTripSpots(id),
    resolveTripCover(trip),
  ])
  const companionNames = (await db.companionCategories.bulkGet(companionLinks.map((link) => link.categoryId))).flatMap((category) => category ? [category.name] : [])
  mergeNavigationSnapshot('trip', id, {
    trip,
    details: { companionNames, prefectureCodes: prefectureLinks.map((link) => link.prefectureCode) },
    tripSpots,
    cover,
  })
}

export async function prepareSpotNavigationSnapshot(id: string) {
  const spot = await db.spots.get(id)
  if (!spot) return
  const visits = await db.visits.where('spotId').equals(id).filter((visit) => !visit.deletedAt).toArray()
  const [visitsWithTrips, imageGroups, category] = await Promise.all([
    Promise.all(visits.map(async (visit) => ({ visit, trip: await db.trips.get(visit.tripId) }))),
    Promise.all(visits.map(getVisitImages)),
    spot.spotCategoryId ? db.spotCategories.get(spot.spotCategoryId) : undefined,
  ])
  const images = imageGroups.flat()
  setNavigationSnapshot('spot', id, {
    spot,
    details: {
      categoryName: category?.name ?? '',
      visits: visitsWithTrips,
      images,
      representative: spot.representativeImageId ? images.find((image) => image.id === spot.representativeImageId) : undefined,
    },
  })
}

export async function preparePrefectureNavigationSnapshot(code: number) {
  const [cover, rows] = await Promise.all([
    resolvePrefectureCover(code),
    db.spots.where('effectivePrefectureCode').equals(code).filter((spot) => !spot.deletedAt).toArray(),
  ])
  const spots = await Promise.all(rows.map(async (spot) => {
    const [image, visitCount] = await Promise.all([
      spot.representativeImageId ? db.images.get(spot.representativeImageId) : undefined,
      db.visits.where('spotId').equals(spot.id).filter((visit) => !visit.deletedAt).count(),
    ])
    return { spot, imageId: image?.id, thumbnailBlob: image?.thumbnailBlob, visitCount }
  }))
  mergeNavigationSnapshot('prefecture', code, { cover, count: spots.length, spots })
}
