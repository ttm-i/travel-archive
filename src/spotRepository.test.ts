import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from './db'
import type { ProcessedImage } from './imageProcessing'
import { getVisitImages } from './imageOrder'
import { addExistingSpotVisit, createSpotWithVisit, deleteSpotImage, getReusableSpots, getSpotEditData, getTripSpots, saveSpotEdits, saveTripSpotOrder, setSpotRepresentativeImage, validateJapanCoordinate } from './spotRepository'
import { saveTrip } from './travelRepository'

const testImage = (label: string): ProcessedImage => ({
  imageBlob: new Blob([`full-${label}`], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob([`thumb-${label}`], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  width: 1200,
  height: 800,
  sourceName: `${label}.jpg`,
})

describe('phase 3 spot, visit and photo storage', () => {
  beforeEach(async () => {
    db.close(); await deleteDatabase(DATABASE_NAME); await initializeDatabase()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    db.close(); await deleteDatabase(DATABASE_NAME)
  })

  async function makeTrip(name: string, prefectures = [26]) {
    const categoryId = (await db.companionCategories.toArray())[0].id
    return saveTrip({ name, companionCategoryIds: [categoryId], startDate: '2026-10-01', endDate: '2026-10-02', prefectureCodes: prefectures })
  }

  it('stores one spot, one visit and ordered photos with a selected main image', async () => {
    const tripId = await makeTrip('京都旅行')
    const result = await createSpotWithVisit({ tripId, name: '南禅寺 水路閣', latitude: 35.011274, longitude: 135.793154, effectivePrefectureCode: 26, images: [testImage('a'), testImage('b')], mainImageIndex: 1 })
    const spot = await db.spots.get(result.spotId)
    const visit = await db.visits.get(result.visitId)
    const images = await db.images.where('visitId').equals(result.visitId).sortBy('sortOrder')
    expect(spot?.latitude).toBe(35.01127)
    expect(spot?.longitude).toBe(135.79315)
    expect(images).toHaveLength(2)
    expect(spot?.representativeImageId).toBe(images[1].id)
    expect(visit?.coverImageId).toBe(images[1].id)
  })

  it('reuses the same spot in another trip without duplicating it', async () => {
    const firstTrip = await makeTrip('最初の京都')
    const secondTrip = await makeTrip('再訪の京都')
    const { spotId } = await createSpotWithVisit({ tripId: firstTrip, name: '南禅寺', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first')], mainImageIndex: 0 })
    expect((await getReusableSpots(secondTrip)).map(({ spot }) => spot.id)).toContain(spotId)
    await addExistingSpotVisit(secondTrip, spotId)
    expect(await db.spots.count()).toBe(1)
    expect(await db.visits.where('spotId').equals(spotId).count()).toBe(2)
  })

  it('stores a trip-specific spot order and appends newly added spots', async () => {
    const tripId = await makeTrip('順番を決める旅行')
    const first = await createSpotWithVisit({ tripId, name: '最初', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first')], mainImageIndex: 0 })
    const second = await createSpotWithVisit({ tripId, name: '二番目', latitude: 35.02127, longitude: 135.80315, effectivePrefectureCode: 26, images: [testImage('second')], mainImageIndex: 0 })
    await saveTripSpotOrder(tripId, [second.visitId, first.visitId])
    expect((await getTripSpots(tripId)).map(({ spot }) => spot.name)).toEqual(['二番目', '最初'])

    await createSpotWithVisit({ tripId, name: '後から追加', latitude: 35.03127, longitude: 135.81315, effectivePrefectureCode: 26, images: [testImage('third')], mainImageIndex: 0 })
    expect((await getTripSpots(tripId)).map(({ spot }) => spot.name)).toEqual(['二番目', '最初', '後から追加'])
  })

  it('rejects saving an order that omits a current visit', async () => {
    const tripId = await makeTrip('変更を検知する旅行')
    const first = await createSpotWithVisit({ tripId, name: '最初', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first')], mainImageIndex: 0 })
    await createSpotWithVisit({ tripId, name: '二番目', latitude: 35.02127, longitude: 135.80315, effectivePrefectureCode: 26, images: [testImage('second')], mainImageIndex: 0 })
    await expect(saveTripSpotOrder(tripId, [first.visitId])).rejects.toThrow('スポットの内容が変更されています')
  })

  it('changes the representative image and uses it for trip thumbnails', async () => {
    const tripId = await makeTrip('表紙を選ぶ旅行')
    const { spotId, visitId } = await createSpotWithVisit({ tripId, name: '表紙の場所', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first'), testImage('second')], mainImageIndex: 0 })
    const images = await db.images.where('visitId').equals(visitId).sortBy('sortOrder')
    await setSpotRepresentativeImage(spotId, images[1].id)
    expect((await db.spots.get(spotId))?.representativeImageId).toBe(images[1].id)
  })

  it('deletes a photo while preserving one required photo and repairing image references', async () => {
    const tripId = await makeTrip('写真を整理する旅行')
    const { spotId, visitId } = await createSpotWithVisit({ tripId, name: '写真の場所', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first'), testImage('second')], mainImageIndex: 1 })
    const images = await db.images.where('visitId').equals(visitId).sortBy('sortOrder')
    await db.trips.update(tripId, { coverImageId: images[1].id, coverListCrop: { x: 30, y: 40, zoom: 1.2 }, coverHeroCrop: { x: 60, y: 50, zoom: 1.1 } })
    await db.prefectureCovers.put({ prefectureCode: 26, imageId: images[1].id, listCrop: { x: 30, y: 40, zoom: 1.2 }, heroCrop: { x: 60, y: 50, zoom: 1.1 }, updatedAt: new Date() })
    await deleteSpotImage(spotId, images[1].id)
    expect(await db.images.get(images[1].id)).toBeUndefined()
    expect((await db.spots.get(spotId))?.representativeImageId).toBe(images[0].id)
    expect((await db.visits.get(visitId))?.coverImageId).toBe(images[0].id)
    expect((await db.trips.get(tripId))?.coverImageId).toBeUndefined()
    expect(await db.prefectureCovers.get(26)).toBeUndefined()
    await expect(deleteSpotImage(spotId, images[0].id)).rejects.toThrow('写真が1枚以上必要')
  })

  it('does not rewrite remaining photo records when deleting from the middle', async () => {
    const tripId = await makeTrip('途中の写真を消す旅行')
    const { spotId, visitId } = await createSpotWithVisit({ tripId, name: '写真の順序', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first'), testImage('middle'), testImage('last')], mainImageIndex: 0 })
    const images = await db.images.where('visitId').equals(visitId).sortBy('sortOrder')
    await deleteSpotImage(spotId, images[1].id)
    const remaining = await db.images.where('visitId').equals(visitId).sortBy('sortOrder')
    expect(remaining.map((image) => image.id)).toEqual([images[0].id, images[2].id])
    expect(remaining.map((image) => image.sortOrder)).toEqual([0, 2])
  })

  it('edits shared spot information and manages photos by selected trip', async () => {
    const firstTrip = await makeTrip('最初の旅行')
    const secondTrip = await makeTrip('再訪の旅行')
    const { spotId, visitId: firstVisitId } = await createSpotWithVisit({ tripId: firstTrip, name: '編集前', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('first-a'), testImage('first-b')], mainImageIndex: 0 })
    const secondVisitId = await addExistingSpotVisit(secondTrip, spotId, [testImage('second')], 0)
    const secondImage = (await db.images.where('visitId').equals(secondVisitId).first())!
    await db.trips.update(secondTrip, { coverImageId: secondImage.id })
    await db.prefectureCovers.put({ prefectureCode: 26, imageId: secondImage.id, listCrop: { x: 50, y: 50, zoom: 1 }, heroCrop: { x: 50, y: 50, zoom: 1 }, updatedAt: new Date() })
    const edit = (await getSpotEditData(spotId))!
    const firstVisit = edit.visits.find((visit) => visit.visitId === firstVisitId)!
    const newPhoto = { key: 'draft-new', processed: testImage('new') }
    const imageUpdate = vi.spyOn(db.images, 'update')
    await saveSpotEdits({
      spotId,
      name: '編集後の名称',
      latitude: 35.01234,
      longitude: 135.79876,
      representativeKey: newPhoto.key,
      visits: [
        { visitId: firstVisitId, photos: [firstVisit.photos[1], firstVisit.photos[0], newPhoto] },
        { visitId: secondVisitId, photos: [] },
      ],
    })
    const spot = await db.spots.get(spotId)
    const firstImages = await getVisitImages((await db.visits.get(firstVisitId))!)
    expect(spot?.name).toBe('編集後の名称')
    expect(spot?.effectivePrefectureCode).toBe(26)
    expect(spot?.latitude).toBe(35.01234)
    expect(firstImages.map((image) => image.id).slice(0, 2)).toEqual([firstVisit.photos[1].image?.id, firstVisit.photos[0].image?.id])
    expect((await db.visits.get(firstVisitId))?.photoOrder).toEqual(firstImages.map((image) => image.id))
    expect(imageUpdate).not.toHaveBeenCalled()
    expect(firstImages).toHaveLength(3)
    expect(await db.images.where('visitId').equals(secondVisitId).count()).toBe(0)
    expect(spot?.representativeImageId).toBe(firstImages[2].id)
    expect((await db.visits.get(secondVisitId))?.coverImageId).toBeUndefined()
    expect((await db.trips.get(secondTrip))?.coverImageId).toBeUndefined()
    expect(await db.prefectureCovers.get(26)).toBeUndefined()
  })

  it('does not save a spot edit without any visible photo', async () => {
    const tripId = await makeTrip('写真必須の旅行')
    const { spotId, visitId } = await createSpotWithVisit({ tripId, name: '写真の場所', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('only')], mainImageIndex: 0 })
    await expect(saveSpotEdits({ spotId, name: '写真の場所', latitude: 35.01127, longitude: 135.79315, visits: [{ visitId, photos: [] }] })).rejects.toThrow('写真が1枚以上必要')
  })

  it('requires the spot prefecture to be selected on the trip', async () => {
    const tripId = await makeTrip('東京旅行', [13])
    await expect(createSpotWithVisit({ tripId, name: '京都の場所', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('a')], mainImageIndex: 0 })).rejects.toThrow('旅行で選択した都道府県')
  })

  it('does not allow an edit to remove a prefecture used by a saved spot', async () => {
    const tripId = await makeTrip('京都旅行', [13, 26])
    await createSpotWithVisit({ tripId, name: '南禅寺', latitude: 35.01127, longitude: 135.79315, effectivePrefectureCode: 26, images: [testImage('a')], mainImageIndex: 0 })
    const categoryId = (await db.companionCategories.toArray())[0].id
    await expect(saveTrip({ tripId, name: '京都旅行', companionCategoryIds: [categoryId], startDate: '2026-10-01', endDate: '2026-10-02', prefectureCodes: [13] })).rejects.toThrow('都道府県を旅行から外すことはできません')
  })

  it('rejects coordinates outside the Japan bounding box', () => {
    expect(validateJapanCoordinate(35.68124, 139.76712)).toBe(true)
    expect(validateJapanCoordinate(51.50722, -0.1275)).toBe(false)
  })
})

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
