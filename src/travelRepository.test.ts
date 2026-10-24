import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, db, initializeDatabase } from './db'
import {
  addCompanionCategory,
  clearTripDraft,
  deleteCompanionCategory,
  loadTripDraft,
  saveTrip,
  saveTripDraft,
  validateTrip,
} from './travelRepository'

describe('phase 2 local travel storage', () => {
  beforeEach(async () => {
    db.close()
    await deleteDatabase(DATABASE_NAME)
    await initializeDatabase()
  })

  afterEach(async () => {
    db.close()
    await deleteDatabase(DATABASE_NAME)
  })

  it('seeds editable default categories only once', async () => {
    expect(await db.companionCategories.count()).toBe(4)
    expect(await db.spotCategories.count()).toBe(5)
    await initializeDatabase()
    expect(await db.companionCategories.count()).toBe(4)
  })

  it('saves a multi-day trip with multiple categories and prefectures', async () => {
    const categoryIds = (await db.companionCategories.toArray()).slice(0, 2).map((category) => category.id)
    const id = await saveTrip({
      name: '  瀬戸内の旅  ',
      companionCategoryIds: categoryIds,
      startDate: '2026-05-02',
      endDate: '2026-05-05',
      prefectureCodes: [33, 37],
    })
    expect((await db.trips.get(id))?.name).toBe('瀬戸内の旅')
    expect(await db.tripCompanionCategories.where('tripId').equals(id).count()).toBe(2)
    expect(await db.tripPrefectures.where('tripId').equals(id).count()).toBe(2)
  })

  it('accepts a day trip and rejects reversed dates', async () => {
    const categoryId = (await db.companionCategories.toArray())[0].id
    const input = { name: '日帰り旅', companionCategoryIds: [categoryId], startDate: '2026-08-01', endDate: '2026-08-01', prefectureCodes: [13] }
    expect(validateTrip(input)).toBeNull()
    expect(validateTrip({ ...input, endDate: '2026-07-31' })).toContain('出発日以降')
  })

  it('restores and clears an unfinished draft', async () => {
    const draft = { name: '入力途中', companionCategoryIds: [], startDate: '', endDate: '', prefectureCodes: [] }
    await saveTripDraft(draft)
    expect((await loadTripDraft())?.name).toBe('入力途中')
    await clearTripDraft()
    expect(await loadTripDraft()).toBeUndefined()
  })

  it('deleting a used companion category keeps the trip', async () => {
    const category = await addCompanionCategory('写真仲間')
    const tripId = await saveTrip({ name: '撮影旅行', companionCategoryIds: [category.id], startDate: '2026-09-01', endDate: '2026-09-02', prefectureCodes: [20] })
    await deleteCompanionCategory(category.id)
    expect(await db.trips.get(tripId)).toBeDefined()
    expect(await db.tripCompanionCategories.where('tripId').equals(tripId).count()).toBe(0)
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
