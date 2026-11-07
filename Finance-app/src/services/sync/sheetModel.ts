import { db } from '../../db/db'
import { replaceAll } from '../../db/repos'
import type { AppSnapshot } from '../../domain/types'
import { rowsToRecords, SHEET_COLUMNS, SHEET_NAMES, type CellValue } from './excelRows'

export const SHEET_LOADERS: Record<string, () => Promise<Record<string, unknown>[]>> = {
  Transactions: () => db.transactions.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Categories: () => db.categories.toArray() as unknown as Promise<Record<string, unknown>[]>,
  People: () => db.people.toArray() as unknown as Promise<Record<string, unknown>[]>,
  KhataTransactions: () => db.khataTransactions.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Investments: () => db.investments.toArray() as unknown as Promise<Record<string, unknown>[]>,
  InvestmentOccurrences: () => db.investmentOccurrences.toArray() as unknown as Promise<Record<string, unknown>[]>,
  RecurringIncome: () => db.recurringIncome.toArray() as unknown as Promise<Record<string, unknown>[]>,
  IncomeOccurrences: () => db.incomeOccurrences.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Budgets: () => db.budgets.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Bills: () => db.bills.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Settings: () => db.settings.toArray() as unknown as Promise<Record<string, unknown>[]>,
  Attachments: () => db.attachments.toArray() as unknown as Promise<Record<string, unknown>[]>,
}

export async function loadAllRecords(): Promise<Record<string, Record<string, unknown>[]>> {
  const all: Record<string, Record<string, unknown>[]> = {}
  for (const name of SHEET_NAMES) all[name] = await SHEET_LOADERS[name]()
  return all
}

/** Build a snapshot from raw sheet rows (first row = header), shared by every sync backend. */
export function snapshotFromSheets(sheetRows: Record<string, CellValue[][] | undefined>): Partial<AppSnapshot> {
  const snapshot: Partial<AppSnapshot> = {}
  for (const name of SHEET_NAMES) {
    const rows = sheetRows[name]
    if (!rows || rows.length < 2) continue
    const columns = SHEET_COLUMNS[name]
    const records = rowsToRecords(rows.slice(1), columns)
    if (records.length === 0) continue
    switch (name) {
      case 'Transactions':
        snapshot.transactions = records as unknown as AppSnapshot['transactions']
        break
      case 'Categories':
        snapshot.categories = records as unknown as AppSnapshot['categories']
        break
      case 'People':
        snapshot.people = records as unknown as AppSnapshot['people']
        break
      case 'KhataTransactions':
        snapshot.khataTransactions = records as unknown as AppSnapshot['khataTransactions']
        break
      case 'Investments':
        snapshot.investments = records as unknown as AppSnapshot['investments']
        break
      case 'InvestmentOccurrences':
        snapshot.investmentOccurrences = records as unknown as AppSnapshot['investmentOccurrences']
        break
      case 'RecurringIncome':
        snapshot.recurringIncome = records as unknown as AppSnapshot['recurringIncome']
        break
      case 'IncomeOccurrences':
        snapshot.incomeOccurrences = records as unknown as AppSnapshot['incomeOccurrences']
        break
      case 'Budgets':
        snapshot.budgets = records as unknown as AppSnapshot['budgets']
        break
      case 'Bills':
        snapshot.bills = records as unknown as AppSnapshot['bills']
        break
      case 'Settings':
        snapshot.settings = records as unknown as AppSnapshot['settings']
        break
      case 'Attachments':
        snapshot.attachments = records as unknown as AppSnapshot['attachments']
        break
      default:
        break
    }
  }
  return snapshot
}

/** Replace all local data from raw sheet rows (first row = header). */
export async function restoreFromSheets(sheetRows: Record<string, CellValue[][] | undefined>): Promise<void> {
  const snapshot = snapshotFromSheets(sheetRows)
  // Backups made before the Bills feature existed have no Bills data; keep current bills
  // instead of wiping them, so restoring an old snapshot never loses bill setup.
  if (!snapshot.bills) snapshot.bills = (await db.bills.toArray()) as AppSnapshot['bills']
  await replaceAll(snapshot as AppSnapshot)
}
