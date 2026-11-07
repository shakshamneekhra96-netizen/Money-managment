export type CellValue = string | number | boolean

export const SHEET_COLUMNS: Record<string, string[]> = {
  Transactions: [
    'id', 'type', 'amountPaise', 'date', 'categoryId', 'categoryName', 'subcategoryId', 'subcategoryName',
    'paymentMode', 'description', 'attachmentId', 'investmentId', 'occurrenceId', 'recurringIncomeId',
    'incomeOccurrenceId', 'source', 'createdAt', 'updatedAt',
  ],
  Categories: ['id', 'name', 'section', 'parentId', 'icon', 'color', 'archived', 'source', 'createdAt', 'updatedAt'],
  People: ['id', 'name', 'mobile', 'notes', 'archived', 'source', 'createdAt', 'updatedAt'],
  KhataTransactions: ['id', 'personId', 'type', 'amountPaise', 'openingDirection', 'date', 'description', 'paymentMode', 'attachmentId', 'source', 'createdAt', 'updatedAt'],
  Investments: ['id', 'name', 'type', 'amountPaise', 'startDate', 'debitDate', 'frequency', 'paymentMethod', 'notes', 'active', 'oneTime', 'source', 'createdAt', 'updatedAt'],
  InvestmentOccurrences: ['id', 'investmentId', 'scheduledDate', 'status', 'actualDate', 'actualAmountPaise', 'transactionId', 'source', 'createdAt', 'updatedAt'],
  RecurringIncome: ['id', 'name', 'expectedAmountPaise', 'startDate', 'debitDate', 'frequency', 'paymentMode', 'active', 'source', 'createdAt', 'updatedAt'],
  IncomeOccurrences: ['id', 'recurringIncomeId', 'scheduledDate', 'status', 'actualDate', 'actualAmountPaise', 'transactionId', 'source', 'createdAt', 'updatedAt'],
  Budgets: ['id', 'categoryId', 'month', 'amountPaise', 'source', 'createdAt', 'updatedAt'],
  Bills: ['id', 'name', 'section', 'amountPaise', 'dayOfMonth', 'archived', 'lastAction', 'lastActionCycle', 'source', 'createdAt', 'updatedAt'],
  Settings: ['key', 'value', 'updatedAt'],
  Attachments: ['id', 'ownerId', 'filename', 'mimeType', 'dataBase64', 'source', 'createdAt', 'updatedAt'],
}

export const SHEET_NAMES = Object.keys(SHEET_COLUMNS)

export function recordsToRows(records: Record<string, unknown>[], columns: string[]): CellValue[][] {
  return records.map((record) =>
    columns.map((column) => {
      const value = record[column]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
      return String(value)
    }),
  )
}

export function rowsToRecords(rows: CellValue[][], columns: string[]): Record<string, unknown>[] {
  return rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
    .map((row) => {
      const record: Record<string, unknown> = {}
      columns.forEach((column, index) => {
        const value = row[index]
        record[column] = value === '' || value === null || value === undefined ? null : value
      })
      return record
    })
}
