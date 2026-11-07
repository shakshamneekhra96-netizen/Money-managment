const MAX_PAISE = 100_00_00_000 * 100

export function rupeesToPaise(input: string, allowZero = false): number {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid amount in rupees')
  }
  const [rupees, fraction = ''] = trimmed.split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) {
    throw new Error('Amount is too large')
  }
  if (paise < 0 || (!allowZero && paise === 0)) {
    throw new Error('Enter an amount greater than zero')
  }
  return paise
}

export function formatINR(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(paise))
  const rupees = Math.trunc(abs / 100)
  const rem = abs % 100
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${String(rem).padStart(2, '0')}`
}

export function paiseToInput(paise: number): string {
  const abs = Math.abs(Math.trunc(paise))
  const rupees = Math.trunc(abs / 100)
  const rem = abs % 100
  return rem === 0 ? String(rupees) : `${rupees}.${String(rem).padStart(2, '0')}`
}
