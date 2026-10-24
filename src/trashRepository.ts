import { db } from './db'
import { getVisitImages } from './imageOrder'

export async function moveTripToTrash(id: string) { const now = new Date(); await db.transaction('rw', db.trips, db.visits, async () => { await db.trips.update(id, { deletedAt: now, updatedAt: now }); await db.visits.where('tripId').equals(id).filter((visit) => !visit.deletedAt).modify({ deletedAt: now, updatedAt: now, deletedWithTrip: true }) }) }
export async function restoreTrip(id: string) { const now = new Date(); await db.transaction('rw', db.trips, db.visits, async () => { await db.trips.update(id, { deletedAt: undefined, updatedAt: now }); await db.visits.where('tripId').equals(id).filter((visit) => Boolean(visit.deletedWithTrip)).modify({ deletedAt: undefined, updatedAt: now, deletedWithTrip: undefined }) }) }
export async function permanentlyDeleteTrip(id: string) { await db.transaction('rw', [db.trips, db.visits, db.images, db.coverAssets, db.prefectureCovers, db.tripCompanionCategories, db.tripPrefectures], async () => { const visits = await db.visits.where('tripId').equals(id).toArray(); for (const visit of visits) { const imageIds = await db.images.where('visitId').equals(visit.id).primaryKeys(); for (const imageId of imageIds) await db.prefectureCovers.where('imageId').equals(imageId as string).delete(); await db.images.where('visitId').equals(visit.id).delete() } await db.coverAssets.where('[ownerType+ownerId]').equals(['trip', id]).delete(); await db.visits.where('tripId').equals(id).delete(); await db.tripCompanionCategories.where('tripId').equals(id).delete(); await db.tripPrefectures.where('tripId').equals(id).delete(); await db.trips.delete(id) }) }
export async function moveSpotToTrash(id: string) { const now = new Date(); await db.transaction('rw', db.spots, db.visits, db.images, db.trips, async () => { const visits = await db.visits.where('spotId').equals(id).toArray(); const imageGroups = await Promise.all(visits.map((visit) => db.images.where('visitId').equals(visit.id).primaryKeys())); for (const imageId of imageGroups.flat()) await db.trips.where('coverImageId').equals(imageId as string).modify({ coverImageId: undefined, coverListCrop: undefined, coverHeroCrop: undefined, updatedAt: now }); await db.spots.update(id, { deletedAt: now, updatedAt: now }); await db.visits.where('spotId').equals(id).modify({ deletedAt: now, updatedAt: now }) }) }
export async function restoreSpot(id: string) { const now = new Date(); await db.transaction('rw', db.spots, db.visits, db.trips, async () => { await db.spots.update(id, { deletedAt: undefined, updatedAt: now }); const visits = await db.visits.where('spotId').equals(id).toArray(); for (const visit of visits) if (!(await db.trips.get(visit.tripId))?.deletedAt) await db.visits.update(visit.id, { deletedAt: undefined, updatedAt: now }) }) }
export async function permanentlyDeleteSpot(id: string) { await db.transaction('rw', db.spots, db.visits, db.images, db.trips, db.prefectureCovers, async () => { const visits = await db.visits.where('spotId').equals(id).toArray(); for (const visit of visits) { const imageIds = await db.images.where('visitId').equals(visit.id).primaryKeys(); for (const imageId of imageIds) { await db.trips.where('coverImageId').equals(imageId as string).modify({ coverImageId: undefined, coverListCrop: undefined, coverHeroCrop: undefined, updatedAt: new Date() }); await db.prefectureCovers.where('imageId').equals(imageId as string).delete() } await db.images.where('visitId').equals(visit.id).delete() } await db.visits.where('spotId').equals(id).delete(); await db.spots.delete(id) }) }

export async function detachVisitFromSpot(visitId: string) {
  const visit = await db.visits.get(visitId)
  if (!visit || visit.deletedAt) return { spotDeleted: false }
  const now = new Date()
  let spotDeleted = false
  await db.transaction('rw', db.visits, db.spots, db.images, db.trips, async () => {
    const detachedImageIds = await db.images.where('visitId').equals(visit.id).primaryKeys()
    const trip = await db.trips.get(visit.tripId)
    if (trip?.coverImageId && detachedImageIds.includes(trip.coverImageId)) await db.trips.update(trip.id, { coverImageId: undefined, coverListCrop: undefined, coverHeroCrop: undefined, updatedAt: now })
    await db.visits.update(visit.id, { deletedAt: now, updatedAt: now, deletedWithTrip: undefined })
    const remaining = await db.visits.where('spotId').equals(visit.spotId).filter((item) => !item.deletedAt).toArray()
    if (!remaining.length) {
      spotDeleted = true
      await db.spots.update(visit.spotId, { deletedAt: now, updatedAt: now })
    } else {
      const spot = await db.spots.get(visit.spotId)
      const imageGroups = await Promise.all(remaining.map(getVisitImages))
      const images = imageGroups.flat()
      const representativeImageId = images.some((image) => image.id === spot?.representativeImageId) ? spot?.representativeImageId : images[0]?.id
      await db.spots.update(visit.spotId, { representativeImageId, updatedAt: now })
    }
  })
  return { spotDeleted }
}

export async function restoreDetachedVisit(id: string) { const visit = await db.visits.get(id); if (!visit) return; const [trip, spot] = await Promise.all([db.trips.get(visit.tripId), db.spots.get(visit.spotId)]); if (!trip || trip.deletedAt || !spot) throw new Error('旅行を先に復元してください'); const now = new Date(); await db.transaction('rw', db.visits, db.spots, async () => { await db.spots.update(spot.id, { deletedAt: undefined, updatedAt: now }); await db.visits.update(id, { deletedAt: undefined, updatedAt: now, deletedWithTrip: undefined }) }) }
export async function permanentlyDeleteVisit(id: string) { const visit = await db.visits.get(id); if (!visit) return; await db.transaction('rw', db.visits, db.images, db.spots, db.prefectureCovers, async () => { const imageIds = await db.images.where('visitId').equals(id).primaryKeys(); for (const imageId of imageIds) await db.prefectureCovers.where('imageId').equals(imageId as string).delete(); await db.images.where('visitId').equals(id).delete(); await db.visits.delete(id); if (!await db.visits.where('spotId').equals(visit.spotId).count()) await db.spots.delete(visit.spotId) }) }
