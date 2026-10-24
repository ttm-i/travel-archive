export const normalizeDigits = (value: string) =>
  value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))

export const toFiveDecimals = (value: number) => value.toFixed(5)

