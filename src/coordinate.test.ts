import { describe, expect, it } from 'vitest'
import { normalizeDigits, toFiveDecimals } from './coordinate'

describe('coordinate helpers', () => {
  it('normalizes full-width digits', () => {
    expect(normalizeDigits('３５.６８１２４')).toBe('35.68124')
  })

  it('formats five decimal places', () => {
    expect(toFiveDecimals(35.68)).toBe('35.68000')
  })
})

