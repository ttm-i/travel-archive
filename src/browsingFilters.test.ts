import { describe, expect, it } from 'vitest'
import { filterTripsForMap, normalizeSearchText, spotMatchesTripSearch, UNCATEGORIZED, type MapFilter } from './browsingFilters'
import type { Spot, Trip } from './types'

const now = new Date('2026-10-24T12:00:00')
const trip = (id: string, startDate: string, endDate: string): Trip => ({ id, name: id, startDate, endDate, createdAt: now, updatedAt: now })
const spot = (name: string, spotCategoryId?: string): Spot => ({ id: name, name, latitude: 35, longitude: 139, effectivePrefectureCode: 13, prefectureOverridden: false, spotCategoryId, createdAt: now, updatedAt: now })

describe('browsing filters', () => {
  it('includes trips that overlap the selected period at either boundary', () => {
    const filter: MapFilter = { period: 'custom', startDate: '2026-05-10', endDate: '2026-05-20', companionCategoryIds: [] }
    const result = filterTripsForMap([trip('left', '2026-05-01', '2026-05-10'), trip('right', '2026-05-20', '2026-05-22'), trip('outside', '2026-05-21', '2026-05-23')], [], filter, now)
    expect(result.map((item) => item.id)).toEqual(['left', 'right'])
  })

  it('uses OR within companion choices and AND between companion and period', () => {
    const trips = [trip('family', '2026-05-12', '2026-05-13'), trip('friend', '2025-05-12', '2025-05-13'), trip('solo', '2026-05-12', '2026-05-13')]
    const links = [{ id: '1', tripId: 'family', categoryId: 'family' }, { id: '2', tripId: 'friend', categoryId: 'friend' }, { id: '3', tripId: 'solo', categoryId: 'solo' }]
    const filter: MapFilter = { period: 'custom', startDate: '2026-01-01', endDate: '2026-12-31', companionCategoryIds: ['family', 'friend'] }
    expect(filterTripsForMap(trips, links, filter, now).map((item) => item.id)).toEqual(['family'])
  })

  it('normalizes width, case and surrounding spaces for spot names', () => {
    expect(normalizeSearchText('  ＣＡＦＥ  ')).toBe('cafe')
    expect(spotMatchesTripSearch(spot('Cafe Terrace', 'food'), { query: 'ＣＡＦＥ', spotCategoryIds: ['food'] })).toBe(true)
  })

  it('requires name and category to match the same spot and supports uncategorized spots', () => {
    expect(spotMatchesTripSearch(spot('箱根神社', 'sightseeing'), { query: '箱根', spotCategoryIds: ['lodging'] })).toBe(false)
    expect(spotMatchesTripSearch(spot('箱根の散歩道'), { query: '箱根', spotCategoryIds: [UNCATEGORIZED] })).toBe(true)
  })
})
