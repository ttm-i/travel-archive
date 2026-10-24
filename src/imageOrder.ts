import { db } from './db'
import type { TravelImage, Visit } from './types'

export function arrangeVisitImages(visit: Pick<Visit, 'photoOrder'>, images: TravelImage[]) {
  const byId = new Map(images.map((image) => [image.id, image]))
  const arranged: TravelImage[] = []
  const seen = new Set<string>()
  for (const imageId of visit.photoOrder ?? []) {
    const image = byId.get(imageId)
    if (!image || seen.has(imageId)) continue
    arranged.push(image)
    seen.add(imageId)
  }
  const remaining = images.filter((image) => !seen.has(image.id)).sort((a, b) => a.sortOrder - b.sortOrder)
  return [...arranged, ...remaining]
}

export async function getVisitImages(visit: Pick<Visit, 'id' | 'photoOrder'>) {
  return arrangeVisitImages(visit, await db.images.where('visitId').equals(visit.id).toArray())
}
