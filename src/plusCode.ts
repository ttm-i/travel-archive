import { OpenLocationCode } from 'open-location-code'
import { PREFECTURES } from './prefectures'

export type MunicipalityReference = readonly [
  prefectureCode: number,
  prefectureName: string,
  municipalityName: string,
  latitude: number,
  longitude: number,
]

export type PlusCodeResult = {
  enteredCode: string
  fullCode: string
  latitude: number
  longitude: number
  locality?: string
  reference?: {
    prefectureCode: number
    prefectureName: string
    municipalityName: string
  }
}

const CODE_PATTERN = /[23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}/i
const openLocationCode = new OpenLocationCode()
let municipalityPromise: Promise<MunicipalityReference[]> | undefined

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/[，]/g, ',').trim()
}

function compactPlaceName(value: string) {
  return normalizeText(value).replace(/[\s,、・]/g, '')
}

export function parsePlusCodeInput(input: string) {
  const normalized = normalizeText(input).toUpperCase()
  const match = normalized.match(CODE_PATTERN)
  if (!match) throw new Error('Plus Codeを確認できません。例：MMQR+QM 新宿区、東京都')
  const code = match[0]
  if (!openLocationCode.isValid(code)) throw new Error('Plus Codeの形式を確認してください')
  const locality = normalized.replace(match[0], '').replace(/^[\s,、:：-]+|[\s,、:：-]+$/g, '')
  return { code, locality }
}

export function findMunicipalityReference(locality: string, references: MunicipalityReference[], allowedCodes: number[] = []) {
  const compactLocality = compactPlaceName(locality)
  const statedPrefectureCode = PREFECTURES.findIndex((name) => compactLocality.includes(name)) + 1
  const statedPrefectureName = statedPrefectureCode ? PREFECTURES[statedPrefectureCode - 1] : ''
  const localityWithoutPrefecture = statedPrefectureName ? compactLocality.replace(statedPrefectureName, '') : compactLocality
  const scopeCodes = statedPrefectureCode ? [statedPrefectureCode] : [...new Set(allowedCodes)]
  const scoped = scopeCodes.length ? references.filter(([code]) => scopeCodes.includes(code)) : references

  const ranked = scoped.flatMap((reference) => {
    const municipality = compactPlaceName(reference[2])
    const lastPart = compactPlaceName(reference[2].split(/\s+/).at(-1) ?? reference[2])
    const exactShortMatch = localityWithoutPrefecture === lastPart
    const fullMatch = localityWithoutPrefecture.includes(municipality)
    const shortMatch = lastPart !== municipality && localityWithoutPrefecture.includes(lastPart)
    const score = exactShortMatch ? 200 + lastPart.length : fullMatch ? 100 + municipality.length : shortMatch ? lastPart.length : 0
    return score ? [{ reference, score }] : []
  }).sort((a, b) => b.score - a.score || a.reference[2].localeCompare(b.reference[2], 'ja'))

  if (!ranked.length) {
    if (!locality) throw new Error('短縮Plus Codeには「新宿区、東京都」のような地域名も必要です')
    throw new Error('地域名から市区町村を特定できませんでした。フルPlus Codeまたは地図指定をご利用ください')
  }
  if (ranked[1]?.score === ranked[0].score) {
    throw new Error('同名の地域が複数見つかりました。都道府県を含めるか、フルPlus Codeをご利用ください')
  }
  return ranked[0].reference
}

export function decodePlusCodeInput(input: string, references: MunicipalityReference[] = [], allowedCodes: number[] = []): PlusCodeResult {
  const { code, locality } = parsePlusCodeInput(input)
  let fullCode = code
  let reference: MunicipalityReference | undefined
  if (openLocationCode.isShort(code)) {
    reference = findMunicipalityReference(locality, references, allowedCodes)
    fullCode = openLocationCode.recoverNearest(code, reference[3], reference[4])
  } else if (!openLocationCode.isFull(code)) {
    throw new Error('Plus Codeの形式を確認してください')
  }
  const area = openLocationCode.decode(fullCode)
  return {
    enteredCode: code,
    fullCode,
    latitude: area.latitudeCenter,
    longitude: area.longitudeCenter,
    locality: locality || undefined,
    reference: reference ? {
      prefectureCode: reference[0],
      prefectureName: reference[1],
      municipalityName: reference[2],
    } : undefined,
  }
}

export function loadMunicipalityReferences() {
  municipalityPromise ??= fetch(`${import.meta.env.BASE_URL}data/municipalities.json`).then(async (response) => {
    if (!response.ok) throw new Error('市区町村データを読み込めませんでした')
    return response.json() as Promise<MunicipalityReference[]>
  })
  return municipalityPromise
}

export async function resolvePlusCodeInput(input: string, allowedCodes: number[] = []) {
  const parsed = parsePlusCodeInput(input)
  const references = openLocationCode.isShort(parsed.code) ? await loadMunicipalityReferences() : []
  return decodePlusCodeInput(input, references, allowedCodes)
}
