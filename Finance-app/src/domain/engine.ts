import { format, parseISO } from 'date-fns'
import type {
  Budget,
  Category,
  Investment,
  KhataTransaction,
  Person,
  Transaction,
} from './types'
import { inRange, monthKey } from './dates'
import { personBalance } from './khata'

export interface PeriodSummary {
  personalPaise: number
  homePaise: number
  investmentPaise: number
  incomePaise: number
  consumptionPaise: number
  availablePaise: number
  netCashFlowPaise: number
}

export function summarize(transactions: Transaction[], start: string, end: string): PeriodSummary {
  let personalPaise = 0
  let homePaise = 0
  let investmentPaise = 0
  let incomePaise = 0
  for (const tx of transactions) {
    if (!inRange(tx.date, start, end)) continue
    if (tx.type === 'PERSONAL_EXPENSE') personalPaise += tx.amountPaise
    else if (tx.type === 'HOME_EXPENSE') homePaise += tx.amountPaise
    else if (tx.type === 'INVESTMENT') investmentPaise += tx.amountPaise
    else if (tx.type === 'INCOME') incomePaise += tx.amountPaise
  }
  const consumptionPaise = personalPaise + homePaise
  const availablePaise = incomePaise - consumptionPaise - investmentPaise
  return {
    personalPaise,
    homePaise,
    investmentPaise,
    incomePaise,
    consumptionPaise,
    availablePaise,
    netCashFlowPaise: availablePaise,
  }
}

export function sumAmount(transactions: Transaction[]): number {
  return transactions.reduce((sum, tx) => sum + tx.amountPaise, 0)
}

export interface CategoryTotal {
  id: string
  name: string
  color: string
  amountPaise: number
}

export function categoryTotals(transactions: Transaction[], categories: Category[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const tx of transactions) {
    if (tx.type !== 'PERSONAL_EXPENSE' && tx.type !== 'HOME_EXPENSE') continue
    const name = tx.subcategoryName || tx.categoryName || 'Uncategorised'
    const id = tx.subcategoryId || tx.categoryId || name
    const category = categories.find((item) => item.id === (tx.subcategoryId || tx.categoryId))
    const current = map.get(id) ?? { id, name, color: category?.color ?? '#3B82F6', amountPaise: 0 }
    current.amountPaise += tx.amountPaise
    map.set(id, current)
  }
  return [...map.values()].sort((a, b) => b.amountPaise - a.amountPaise)
}

export function highestSpendingDay(transactions: Transaction[]): { date: string; amountPaise: number } | null {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'PERSONAL_EXPENSE' && tx.type !== 'HOME_EXPENSE') continue
    map.set(tx.date, (map.get(tx.date) ?? 0) + tx.amountPaise)
  }
  let best: { date: string; amountPaise: number } | null = null
  for (const [date, amountPaise] of map) {
    if (!best || amountPaise > best.amountPaise) best = { date, amountPaise }
  }
  return best
}

export function averageDaily(consumptionPaise: number, start: string, end: string): number {
  const startDate = parseISO(start).getTime()
  const endDate = parseISO(end).getTime()
  const days = Math.max(1, Math.round((endDate - startDate) / 86_400_000) + 1)
  return Math.round(consumptionPaise / days)
}

export interface NamedTotal {
  name: string
  amountPaise: number
}

export function groupBy(transactions: Transaction[], keyFn: (tx: Transaction) => string): NamedTotal[] {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    const key = keyFn(tx)
    map.set(key, (map.get(key) ?? 0) + tx.amountPaise)
  }
  return [...map.entries()].map(([name, amountPaise]) => ({ name, amountPaise })).sort((a, b) => a.name.localeCompare(b.name))
}

export function householdSplit(transactions: Transaction[]): { bills: number; groceries: number; other: number } {
  let bills = 0
  let groceries = 0
  let other = 0
  for (const tx of transactions) {
    if (tx.type !== 'HOME_EXPENSE') continue
    const name = tx.categoryName ?? ''
    if (name.startsWith('Bill')) bills += tx.amountPaise
    else if (name.startsWith('Grocer') || name === 'Grocery') groceries += tx.amountPaise
    else other += tx.amountPaise
  }
  return { bills, groceries, other }
}

export function investmentByName(transactions: Transaction[], investments: Investment[]): NamedTotal[] {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'INVESTMENT') continue
    const investment = investments.find((item) => item.id === tx.investmentId)
    const name = investment?.name || tx.description || 'Investment'
    map.set(name, (map.get(name) ?? 0) + tx.amountPaise)
  }
  return [...map.entries()].map(([name, amountPaise]) => ({ name, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise)
}

export interface KhataInsight {
  givenPaise: number
  receivedPaise: number
  recoverablePaise: number
  payablePaise: number
  activeAccounts: number
  lentThisRange: number
  recoveredThisRange: number
  largest: { name: string; balancePaise: number } | null
  oweMe: { name: string; balancePaise: number }[]
  iOwe: { name: string; balancePaise: number }[]
}

export function khataInsight(
  people: Person[],
  entries: KhataTransaction[],
  start?: string,
  end?: string,
): KhataInsight {
  const active = people.filter((person) => !person.archived)
  let recoverablePaise = 0
  let payablePaise = 0
  let largest: KhataInsight['largest'] = null
  const oweMe: KhataInsight['oweMe'] = []
  const iOwe: KhataInsight['iOwe'] = []
  for (const person of active) {
    const balance = personBalance(entries.filter((entry) => entry.personId === person.id))
    if (balance > 0) {
      recoverablePaise += balance
      oweMe.push({ name: person.name, balancePaise: balance })
    } else if (balance < 0) {
      payablePaise += Math.abs(balance)
      iOwe.push({ name: person.name, balancePaise: balance })
    }
    if (!largest || Math.abs(balance) > Math.abs(largest.balancePaise)) {
      largest = { name: person.name, balancePaise: balance }
    }
  }
  oweMe.sort((a, b) => b.balancePaise - a.balancePaise)
  iOwe.sort((a, b) => a.balancePaise - b.balancePaise)
  const ranged = start && end ? entries.filter((entry) => inRange(entry.date, start, end)) : entries
  const givenPaise = ranged
    .filter((entry) => entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them'))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const receivedPaise = ranged
    .filter((entry) => entry.type === 'KHATA_RECEIVED' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection === 'i_owe_them'))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const lentThisRange = entries
    .filter((entry) => entry.type === 'KHATA_GIVEN' && (!start || !end || inRange(entry.date, start, end)))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const recoveredThisRange = entries
    .filter((entry) => entry.type === 'KHATA_RECEIVED' && (!start || !end || inRange(entry.date, start, end)))
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  return {
    givenPaise,
    receivedPaise,
    recoverablePaise,
    payablePaise,
    activeAccounts: active.length,
    lentThisRange,
    recoveredThisRange,
    largest: largest && largest.balancePaise !== 0 ? largest : null,
    oweMe,
    iOwe,
  }
}

export function budgetUsage(budgets: Budget[], totals: CategoryTotal[], month: string): { name: string; spent: number; budget: number }[] {
  return budgets
    .filter((budget) => budget.month === month)
    .map((budget) => {
      const match = totals.find((total) => total.id === budget.categoryId)
      return { name: match?.name ?? 'Category', spent: match?.amountPaise ?? 0, budget: budget.amountPaise }
    })
}

export function weekKey(date: string): string {
  return format(parseISO(date), "RRRR-'W'II")
}

export function monthLabel(key: string): string {
  return format(parseISO(`${key}-01`), 'MMM yy')
}

export { monthKey }
