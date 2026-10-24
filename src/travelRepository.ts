import { db, makeId } from './db'
import type { CompanionCategory, SpotCategory, Trip } from './types'

export interface TripDraft {
  tripId?: string
  name: string
  companionCategoryIds: string[]
  startDate: string
  endDate: string
  prefectureCodes: number[]
}

export interface TripInput extends TripDraft {
  name: string
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')

export async function addCompanionCategory(name: string) {
  const normalized = cleanName(name)
  if (!normalized) throw new Error('カテゴリ名を入力してください')
  if (await db.companionCategories.where('name').equalsIgnoreCase(normalized).first()) throw new Error('同じ名前のカテゴリがあります')
  const now = new Date()
  const sortOrder = await db.companionCategories.count()
  const category: CompanionCategory = { id: makeId(), name: normalized, sortOrder, createdAt: now, updatedAt: now }
  await db.companionCategories.add(category)
  return category
}

export async function addSpotCategory(name: string) {
  const normalized = cleanName(name)
  if (!normalized) throw new Error('カテゴリ名を入力してください')
  if (await db.spotCategories.where('name').equalsIgnoreCase(normalized).first()) throw new Error('同じ名前のカテゴリがあります')
  const now = new Date()
  const sortOrder = await db.spotCategories.count()
  const category: SpotCategory = { id: makeId(), name: normalized, sortOrder, createdAt: now, updatedAt: now }
  await db.spotCategories.add(category)
  return category
}

export async function renameCompanionCategory(id: string, name: string) {
  const normalized = cleanName(name)
  if (!normalized) throw new Error('カテゴリ名を入力してください')
  const duplicate = await db.companionCategories.where('name').equalsIgnoreCase(normalized).first()
  if (duplicate && duplicate.id !== id) throw new Error('同じ名前のカテゴリがあります')
  await db.companionCategories.update(id, { name: normalized, updatedAt: new Date() })
}

export async function renameSpotCategory(id: string, name: string) {
  const normalized = cleanName(name)
  if (!normalized) throw new Error('カテゴリ名を入力してください')
  const duplicate = await db.spotCategories.where('name').equalsIgnoreCase(normalized).first()
  if (duplicate && duplicate.id !== id) throw new Error('同じ名前のカテゴリがあります')
  await db.spotCategories.update(id, { name: normalized, updatedAt: new Date() })
}

export async function deleteCompanionCategory(id: string) {
  await db.transaction('rw', db.companionCategories, db.tripCompanionCategories, async () => {
    await db.tripCompanionCategories.where('categoryId').equals(id).delete()
    await db.companionCategories.delete(id)
  })
}

export async function deleteSpotCategory(id: string, replacementId?: string) {
  await db.transaction('rw', db.spotCategories, db.spots, async () => {
    await db.spots.where('spotCategoryId').equals(id).modify({ spotCategoryId: replacementId, updatedAt: new Date() })
    await db.spotCategories.delete(id)
  })
}

export async function moveCategory(kind: 'companion' | 'spot', id: string, direction: -1 | 1) {
  const table = kind === 'companion' ? db.companionCategories : db.spotCategories
  const categories = await table.orderBy('sortOrder').toArray()
  const index = categories.findIndex((category) => category.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= categories.length) return
  const current = categories[index]
  const other = categories[target]
  await db.transaction('rw', table, async () => {
    await table.update(current.id, { sortOrder: other.sortOrder })
    await table.update(other.id, { sortOrder: current.sortOrder })
  })
}

export function validateTrip(input: TripInput) {
  if (!cleanName(input.name)) return '旅行名を入力してください'
  if (!input.companionCategoryIds.length) return '同行カテゴリを1件以上選んでください'
  if (!input.startDate || !input.endDate) return '出発日と帰宅日を入力してください'
  if (input.endDate < input.startDate) return '帰宅日は出発日以降にしてください'
  if (!input.prefectureCodes.length) return '都道府県を1件以上選んでください'
  return null
}

export async function saveTrip(input: TripInput) {
  const validation = validateTrip(input)
  if (validation) throw new Error(validation)
  if (input.tripId) {
    const visits = await db.visits.where('tripId').equals(input.tripId).filter((visit) => !visit.deletedAt).toArray()
    const spots = await db.spots.bulkGet(visits.map((visit) => visit.spotId))
    const missingPrefecture = spots.find((spot) => spot && !spot.deletedAt && !input.prefectureCodes.includes(spot.effectivePrefectureCode))
    if (missingPrefecture) throw new Error(`登録済みスポット「${missingPrefecture.name}」の都道府県を旅行から外すことはできません`)
  }
  const now = new Date()
  const id = input.tripId ?? makeId()
  const existing = await db.trips.get(id)
  const trip: Trip = {
    ...existing,
    id,
    name: cleanName(input.name),
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db.transaction('rw', db.trips, db.tripCompanionCategories, db.tripPrefectures, async () => {
    await db.trips.put(trip)
    await db.tripCompanionCategories.where('tripId').equals(id).delete()
    await db.tripPrefectures.where('tripId').equals(id).delete()
    await db.tripCompanionCategories.bulkAdd(input.companionCategoryIds.map((categoryId) => ({ id: makeId(), tripId: id, categoryId })))
    await db.tripPrefectures.bulkAdd(input.prefectureCodes.map((prefectureCode) => ({ id: makeId(), tripId: id, prefectureCode })))
  })
  await clearTripDraft()
  return id
}

export async function loadTripDraft(): Promise<TripDraft | undefined> {
  return (await db.metadata.get('tripDraft'))?.value as TripDraft | undefined
}

export async function saveTripDraft(draft: TripDraft) {
  await db.metadata.put({ key: 'tripDraft', value: draft, updatedAt: new Date() })
}

export async function clearTripDraft() {
  await db.metadata.delete('tripDraft')
}

export async function getTripInput(id: string): Promise<TripDraft | undefined> {
  const trip = await db.trips.get(id)
  if (!trip) return undefined
  const [companionLinks, prefectureLinks] = await Promise.all([
    db.tripCompanionCategories.where('tripId').equals(id).toArray(),
    db.tripPrefectures.where('tripId').equals(id).toArray(),
  ])
  return {
    tripId: id,
    name: trip.name,
    companionCategoryIds: companionLinks.map((link) => link.categoryId),
    startDate: trip.startDate,
    endDate: trip.endDate,
    prefectureCodes: prefectureLinks.map((link) => link.prefectureCode),
  }
}

