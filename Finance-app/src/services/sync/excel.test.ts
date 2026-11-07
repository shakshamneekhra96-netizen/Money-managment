import { describe, expect, it } from 'vitest'
import { recordsToRows, rowsToRecords, SHEET_COLUMNS, SHEET_NAMES } from './excelRows'

describe('excel backup rows', () => {
  it('covers every workbook sheet with the expected columns', () => {
    expect(SHEET_NAMES).toEqual([
      'Transactions',
      'Categories',
      'People',
      'KhataTransactions',
      'Investments',
      'InvestmentOccurrences',
      'RecurringIncome',
      'IncomeOccurrences',
      'Budgets',
      'Settings',
      'Attachments',
    ])
    for (const name of SHEET_NAMES) {
      expect(SHEET_COLUMNS[name].length).toBeGreaterThan(0)
      expect(SHEET_COLUMNS[name]).toContain('id')
    }
  })

  it('round trips a transaction record without losing paise or ids', () => {
    const tx = {
      id: 'tx-1',
      type: 'PERSONAL_EXPENSE',
      amountPaise: 1010,
      date: '2026-11-02',
      categoryId: 'c1',
      categoryName: 'Food',
      subcategoryId: null,
      subcategoryName: null,
      paymentMode: 'UPI',
      description: 'Lunch',
      attachmentId: null,
      investmentId: null,
      occurrenceId: null,
      recurringIncomeId: null,
      incomeOccurrenceId: null,
      source: 'user',
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
    }
    const columns = SHEET_COLUMNS.Transactions
    const rows = recordsToRows([tx], columns)
    expect(rows[0][columns.indexOf('amountPaise')]).toBe(1010)
    expect(rows[0][columns.indexOf('paymentMode')]).toBe('UPI')
    expect(rows[0][columns.indexOf('categoryId')]).toBe('c1')
    const back = rowsToRecords(rows, columns)
    expect(back[0]).toEqual(tx)
  })

  it('round trips a khata record with an opening direction', () => {
    const entry = {
      id: 'k-1',
      personId: 'p-1',
      type: 'KHATA_OPENING_BALANCE',
      amountPaise: 150000,
      openingDirection: 'i_owe_them',
      date: '2026-11-01',
      description: 'Opening balance',
      paymentMode: null,
      attachmentId: null,
      source: 'demo',
      createdAt: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z',
    }
    const columns = SHEET_COLUMNS.KhataTransactions
    const back = rowsToRecords(recordsToRows([entry], columns), columns)
    expect(back[0]).toEqual(entry)
  })

  it('round trips an attachment with base64 receipt data', () => {
    const attachment = {
      id: 'a-1',
      ownerId: 'tx-9',
      filename: 'receipt.png',
      mimeType: 'image/png',
      dataBase64: 'aGVsbG8=',
      source: 'user',
      createdAt: '2026-11-02T08:00:00.000Z',
      updatedAt: '2026-11-02T08:00:00.000Z',
    }
    const columns = SHEET_COLUMNS.Attachments
    const back = rowsToRecords(recordsToRows([attachment], columns), columns)
    expect(back[0]).toEqual(attachment)
  })

  it('skips fully empty rows when restoring', () => {
    const columns = SHEET_COLUMNS.Settings
    const rows = [['lastBackupAt', '2026-11-07T09:00:00.000Z', '2026-11-07T09:00:00.000Z'], ['', '', '']]
    const back = rowsToRecords(rows, columns)
    expect(back.length).toBe(1)
    expect(back[0].key).toBe('lastBackupAt')
  })
})
