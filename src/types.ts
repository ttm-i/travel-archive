export type EntityId = string

export interface ImageCrop {
  x: number
  y: number
  zoom: number
}

export interface Trip {
  id: EntityId
  name: string
  startDate: string
  endDate: string
  coverImageId?: EntityId
  coverAssetId?: EntityId
  coverListCrop?: ImageCrop
  coverHeroCrop?: ImageCrop
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export interface CoverAsset {
  id: EntityId
  ownerType: 'trip' | 'prefecture'
  ownerId: string
  imageBlob: Blob
  thumbnailBlob: Blob
  mimeType: string
  width: number
  height: number
  createdAt: Date
}

export interface PrefectureCover {
  prefectureCode: number
  imageId?: EntityId
  assetId?: EntityId
  listCrop: ImageCrop
  heroCrop: ImageCrop
  updatedAt: Date
}

export interface CompanionCategory {
  id: EntityId
  name: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface TripCompanionCategory {
  id: EntityId
  tripId: EntityId
  categoryId: EntityId
}

export interface TripPrefecture {
  id: EntityId
  tripId: EntityId
  prefectureCode: number
}

export interface SpotCategory {
  id: EntityId
  name: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface Spot {
  id: EntityId
  name: string
  latitude: number
  longitude: number
  detectedPrefectureCode?: number
  effectivePrefectureCode: number
  prefectureOverridden: boolean
  spotCategoryId?: EntityId
  representativeImageId?: EntityId
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export interface Visit {
  id: EntityId
  tripId: EntityId
  spotId: EntityId
  spotOrder?: number
  coverImageId?: EntityId
  photoOrder?: EntityId[]
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
  deletedWithTrip?: boolean
}

export interface TravelImage {
  id: EntityId
  visitId: EntityId
  imageBlob: Blob
  thumbnailBlob: Blob
  mimeType: string
  width: number
  height: number
  sortOrder: number
  createdAt: Date
}

export interface AppMetadata {
  key: string
  value: unknown
  updatedAt: Date
}

export interface AppLog {
  id?: number
  level: 'error' | 'warning' | 'info'
  message: string
  detail?: string
  createdAt: Date
}

