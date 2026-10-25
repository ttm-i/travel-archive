import { describe, expect, it } from 'vitest'
import { decodePlusCodeInput, findMunicipalityReference, parsePlusCodeInput, type MunicipalityReference } from './plusCode'

const references: MunicipalityReference[] = [
  [13, '東京都', '新宿区', 35.69388889, 139.7036111],
  [13, '東京都', '中央区', 35.67083333, 139.7722222],
  [1, '北海道', '札幌市 中央区', 43.0553865, 141.3409671],
]

describe('Plus Code input', () => {
  it('decodes a full code without a locality reference', () => {
    const result = decodePlusCodeInput('8Q7XMMQR+QM')
    expect(result.fullCode).toBe('8Q7XMMQR+QM')
    expect(result.latitude).toBeCloseTo(35.68944, 5)
    expect(result.longitude).toBeCloseTo(139.69169, 5)
  })

  it('recovers the Tokyo Metropolitan Government short code offline', () => {
    const result = decodePlusCodeInput('MMQR+QM 新宿区、東京都', references)
    expect(result.fullCode).toBe('8Q7XMMQR+QM')
    expect(result.reference?.municipalityName).toBe('新宿区')
    expect(result.latitude).toBeCloseTo(35.68944, 5)
    expect(result.longitude).toBeCloseTo(139.69169, 5)
  })

  it('accepts full-width characters and punctuation around copied text', () => {
    expect(parsePlusCodeInput('ＭＭＱＲ＋ＱＭ，新宿区、東京都')).toEqual({ code: 'MMQR+QM', locality: '新宿区、東京都' })
  })

  it('uses trip prefectures when a short code has no prefecture name', () => {
    expect(findMunicipalityReference('中央区', references, [1])[2]).toBe('札幌市 中央区')
  })

  it('does not guess when a locality is ambiguous', () => {
    expect(() => findMunicipalityReference('中央区', references)).toThrow('同名の地域が複数')
  })
})
