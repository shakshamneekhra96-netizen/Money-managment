import type { KhataTransaction, OpeningDirection } from './types'
import { formatINR } from './money'

export function personBalance(entries: KhataTransaction[]): number {
  return entries.reduce((sum, entry) => sum + signedKhata(entry), 0)
}

export function signedKhata(entry: KhataTransaction): number {
  if (entry.type === 'KHATA_GIVEN') return entry.amountPaise
  if (entry.type === 'KHATA_RECEIVED') return -entry.amountPaise
  return entry.openingDirection === 'i_owe_them' ? -entry.amountPaise : entry.amountPaise
}

export function givenTotal(entries: KhataTransaction[]): number {
  return entries
    .filter((entry) => entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them'))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
}

export function receivedTotal(entries: KhataTransaction[]): number {
  return entries
    .filter((entry) => entry.type === 'KHATA_RECEIVED' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection === 'i_owe_them'))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
}

export function balanceLabel(balance: number): string {
  if (balance > 0) return 'They owe you'
  if (balance < 0) return 'You owe them'
  return 'Settled'
}

export function directionLabel(direction: OpeningDirection): string {
  return direction === 'i_owe_them' ? 'I owe them' : 'They owe me'
}

export function hisaabText(input: {
  name: string
  mobile: string
  entries: KhataTransaction[]
  formatDate: (iso: string) => string
}): string {
  const given = givenTotal(input.entries)
  const received = receivedTotal(input.entries)
  const balance = personBalance(input.entries)
  const pending = balance === 0 ? 'Settled' : balance > 0 ? `${formatINR(balance)} to recover` : `${formatINR(Math.abs(balance))} payable`
  const rows = [...input.entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({
      date: input.formatDate(entry.date),
      label: entry.type === 'KHATA_GIVEN' ? 'Sent' : entry.type === 'KHATA_RECEIVED' ? 'Received' : 'Opening',
      amount: formatINR(entry.amountPaise),
      note: entry.description ?? '',
    }))
  const dateW = Math.max(...rows.map((row) => row.date.length), 10)
  const labelW = Math.max(...rows.map((row) => row.label.length), 8)
  const amountW = Math.max(...rows.map((row) => row.amount.length), 10)
  const pad = (text: string, width: number) => text.padEnd(width)
  const divider = '-'.repeat(dateW + labelW + amountW + 6)
  const table = [
    `${pad('Date', dateW)}  ${pad('Type', labelW)}  ${pad('Amount', amountW)}  Note`,
    divider,
    ...rows.map((row) => `${pad(row.date, dateW)}  ${pad(row.label, labelW)}  ${pad(row.amount, amountW)}  ${row.note}`),
  ]

  return [
    `*Hisaab with ${input.name}*`,
    ...(input.mobile ? [`Mobile: ${input.mobile}`] : []),
    '',
    '```',
    ...table,
    '```',
    '',
    `Total given:     ${formatINR(given)}`,
    `Total received:  ${formatINR(received)}`,
    `Outstanding:     ${formatINR(balance)} (${balanceLabel(balance)})`,
    `Pending: ${pending}`,
    '',
    '_Shared from MyFinance_',
  ].join('\n')
}
