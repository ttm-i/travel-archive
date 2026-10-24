import Dexie, { type EntityTable } from 'dexie'
import type {
  AppLog,
  AppMetadata,
  CoverAsset,
  CompanionCategory,
  Spot,
  SpotCategory,
  TravelImage,
  Trip,
  TripCompanionCategory,
  TripPrefecture,
  Visit,
  PrefectureCover,
} from './types'

export const DATABASE_NAME = 'travel-archive'
export const DATABASE_VERSION = 4

class TravelArchiveDatabase extends Dexie {
  trips!: EntityTable<Trip, 'id'>
  companionCategories!: EntityTable<CompanionCategory, 'id'>
  tripCompanionCategories!: EntityTable<TripCompanionCategory, 'id'>
  tripPrefectures!: EntityTable<TripPrefecture, 'id'>
  spots!: EntityTable<Spot, 'id'>
  visits!: EntityTable<Visit, 'id'>
  images!: EntityTable<TravelImage, 'id'>
  spotCategories!: EntityTable<SpotCategory, 'id'>
  metadata!: EntityTable<AppMetadata, 'key'>
  logs!: EntityTable<AppLog, 'id'>
  coverAssets!: EntityTable<CoverAsset, 'id'>
  prefectureCovers!: EntityTable<PrefectureCover, 'prefectureCode'>

  constructor() {
    super(DATABASE_NAME)
    this.version(DATABASE_VERSION).stores({
      trips: 'id, startDate, endDate, updatedAt, deletedAt, coverImageId, coverAssetId',
      companionCategories: 'id, name, sortOrder',
      tripCompanionCategories: 'id, tripId, categoryId, [tripId+categoryId]',
      tripPrefectures: 'id, tripId, prefectureCode, [tripId+prefectureCode]',
      spots: 'id, name, effectivePrefectureCode, spotCategoryId, updatedAt, deletedAt',
      visits: 'id, tripId, spotId, [tripId+spotId], updatedAt, deletedAt',
      images: 'id, visitId, sortOrder, createdAt',
      spotCategories: 'id, name, sortOrder',
      metadata: 'key, updatedAt',
      logs: '++id, level, createdAt',
      coverAssets: 'id, ownerType, ownerId, [ownerType+ownerId], createdAt',
      prefectureCovers: 'prefectureCode, imageId, assetId, updatedAt',
    }).upgrade(async (transaction) => {
      const visits = await transaction.table('visits').toArray()
      const images = transaction.table('images')
      for (const visit of visits) {
        const ordered = await images.where('visitId').equals(visit.id).sortBy('sortOrder')
        visit.photoOrder = ordered.map((image) => image.id)
        await transaction.table('visits').put(visit)
      }
    })
  }
}

export const db = new TravelArchiveDatabase()

export async function initializeDatabase() {
  await db.open()
  const now = new Date()
  await db.transaction('rw', db.metadata, db.companionCategories, db.spotCategories, async () => {
    if (!await db.metadata.get('databaseCreatedAt')) {
      await db.metadata.put({ key: 'databaseCreatedAt', value: now.toISOString(), updatedAt: now })
    }
    await db.metadata.put({ key: 'databaseVersion', value: DATABASE_VERSION, updatedAt: now })
    await db.metadata.put({ key: 'lastOpenedAt', value: now.toISOString(), updatedAt: now })
    if (!await db.metadata.get('defaultCategoriesInitialized')) {
      await db.companionCategories.bulkAdd(['一人', '家族', '友人', 'パートナー'].map((name, sortOrder) => ({ id: makeId(), name, sortOrder, createdAt: now, updatedAt: now })))
      await db.spotCategories.bulkAdd(['観光', '食事', '宿泊', '買い物', '移動'].map((name, sortOrder) => ({ id: makeId(), name, sortOrder, createdAt: now, updatedAt: now })))
      await db.metadata.put({ key: 'defaultCategoriesInitialized', value: true, updatedAt: now })
    }
  })
  return DATABASE_VERSION
}

export async function recordAppLog(level: AppLog['level'], message: string, detail?: string) {
  try {
    await db.logs.add({ level, message, detail, createdAt: new Date() })
    const oldLogs = await db.logs.orderBy('createdAt').reverse().offset(100).primaryKeys()
    if (oldLogs.length) await db.logs.bulkDelete(oldLogs as number[])
  } catch {
    // Logging must never prevent the app from opening.
  }
}

export const makeId = () => crypto.randomUUID()

