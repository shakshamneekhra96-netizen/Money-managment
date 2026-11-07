import Dexie, { type Table } from 'dexie'
import type {
  Attachment,
  Budget,
  Category,
  IncomeOccurrence,
  Investment,
  InvestmentOccurrence,
  KhataTransaction,
  Person,
  RecurringBill,
  RecurringIncome,
  SettingRow,
  Transaction,
} from '../domain/types'

export class MyFinanceDB extends Dexie {
  transactions!: Table<Transaction, string>
  categories!: Table<Category, string>
  people!: Table<Person, string>
  khataTransactions!: Table<KhataTransaction, string>
  investments!: Table<Investment, string>
  investmentOccurrences!: Table<InvestmentOccurrence, string>
  recurringIncome!: Table<RecurringIncome, string>
  incomeOccurrences!: Table<IncomeOccurrence, string>
  budgets!: Table<Budget, string>
  bills!: Table<RecurringBill, string>
  settings!: Table<SettingRow, string>
  attachments!: Table<Attachment, string>

  constructor() {
    super('MyFinanceDB')
    // Every version lists the FULL store set — Dexie applies only the differences,
    // so an upgrade always creates any missing store (e.g. bills) and never drops data.
    const v1Stores = {
      transactions: 'id, type, date, categoryId, investmentId, occurrenceId, recurringIncomeId, incomeOccurrenceId, source, updatedAt',
      categories: 'id, section, parentId, archived, source',
      people: 'id, archived, source',
      khataTransactions: 'id, personId, type, date, source',
      investments: 'id, active, oneTime, source',
      investmentOccurrences: 'id, investmentId, scheduledDate, status',
      recurringIncome: 'id, active, source',
      incomeOccurrences: 'id, recurringIncomeId, scheduledDate, status',
      budgets: 'id, categoryId, month',
      settings: 'key',
      attachments: 'id, ownerId',
    }
    this.version(1).stores(v1Stores)
    this.version(2).stores({ ...v1Stores, bills: 'id, archived, source' })
    this.version(3).stores({ ...v1Stores, bills: 'id, archived, source, section' })
    // v4–v10 heal databases created by older builds: every version declares the
    // FULL store set, so opening the app re-creates any missing store without
    // touching the data. The ladder of identical versions guarantees the upgrade
    // fires no matter which version a device is stuck on (e.g. an old build that
    // recorded a version but never created the newer stores).
    for (let version = 4; version <= 10; version += 1) {
      this.version(version).stores({ ...v1Stores, bills: 'id, archived, source, section' })
    }
  }
}

export const db = new MyFinanceDB()

// An upgrade can only run when no other tab holds the old database open. Without
// this warning a blocked upgrade silently keeps the old stores, which later fails
// with "object store was not found". Tell the user exactly what to do instead.
db.on('blocked', () => {
  console.warn('MyFinance update blocked by another open tab. Close other tabs and reload.')
  if (typeof window !== 'undefined') {
    window.alert(
      'A MyFinance update is ready but another open tab is blocking it. Close all MyFinance tabs (and the app if installed), then open it once again.',
    )
  }
})

export function nowISO(): string {
  return new Date().toISOString()
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.get(key)
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const updatedAt = nowISO()
  await db.settings.put({ key, value, updatedAt })
}

export async function getJSONSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
