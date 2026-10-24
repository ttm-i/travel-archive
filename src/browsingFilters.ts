import type { Spot, Trip, TripCompanionCategory } from './types'

export type MapPeriod = 'all' | 'year' | 'past-year' | 'custom'
export type MapFilter = { period: MapPeriod; startDate: string; endDate: string; companionCategoryIds: string[] }
export type TripSearchFilter = { query: string; spotCategoryIds: string[] }

export const UNCATEGORIZED = '__uncategorized__'
export const DEFAULT_MAP_FILTER: MapFilter = { period: 'all', startDate: '', endDate: '', companionCategoryIds: [] }
export const DEFAULT_TRIP_SEARCH: TripSearchFilter = { query: '', spotCategoryIds: [] }

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function mapFilterRange(filter: MapFilter, today = new Date()) {
  if (filter.period === 'all') return undefined
  if (filter.period === 'custom') return filter.startDate && filter.endDate ? { start: filter.startDate, end: filter.endDate } : undefined
  if (filter.period === 'year') return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` }
  const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  return { start: dateKey(start), end: dateKey(today) }
}

export function filterTripsForMap(trips: Trip[], links: TripCompanionCategory[], filter: MapFilter, today = new Date()) {
  const range = mapFilterRange(filter, today)
  const companionsByTrip = new Map<string, Set<string>>()
  for (const link of links) {
    const current = companionsByTrip.get(link.tripId) ?? new Set<string>()
    current.add(link.categoryId)
    companionsByTrip.set(link.tripId, current)
  }
  return trips.filter((trip) => {
    if (trip.deletedAt) return false
    if (range && (trip.startDate > range.end || trip.endDate < range.start)) return false
    if (filter.companionCategoryIds.length && !filter.companionCategoryIds.some((id) => companionsByTrip.get(trip.id)?.has(id))) return false
    return true
  })
}

export function normalizeSearchText(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja').replace(/\s+/g, ' ')
}

export function spotMatchesTripSearch(spot: Spot, filter: TripSearchFilter) {
  if (spot.deletedAt) return false
  const query = normalizeSearchText(filter.query)
  if (query && !normalizeSearchText(spot.name).includes(query)) return false
  if (!filter.spotCategoryIds.length) return true
  return filter.spotCategoryIds.some((id) => id === UNCATEGORIZED ? !spot.spotCategoryId : spot.spotCategoryId === id)
}

export function mapFilterCount(filter: MapFilter) {
  return (filter.period === 'all' ? 0 : 1) + filter.companionCategoryIds.length
}

export function tripSearchCount(filter: TripSearchFilter) {
  return (normalizeSearchText(filter.query) ? 1 : 0) + filter.spotCategoryIds.length
}
