import ExcelJS from 'exceljs'
import { nowISO, setSetting } from '../../db/db'
import { recordsToRows, SHEET_COLUMNS, SHEET_NAMES, type CellValue } from './excelRows'
import { loadAllRecords, restoreFromSheets } from './sheetModel'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

export async function exportWorkbook(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MyFinance'
  workbook.created = new Date()
  const allRecords = await loadAllRecords()
  for (const name of SHEET_NAMES) {
    const columns = SHEET_COLUMNS[name]
    const worksheet = workbook.addWorksheet(name)
    worksheet.addRow(columns)
    for (const row of recordsToRows(allRecords[name] ?? [], columns)) worksheet.addRow(row)
  }
  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'MyFinance.xlsx',
  )
  await setSetting('lastBackupAt', nowISO())
}

export async function importWorkbook(file: File): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheetRows: Record<string, CellValue[][]> = {}
  for (const name of SHEET_NAMES) {
    const worksheet = workbook.getWorksheet(name)
    if (!worksheet) continue
    const columns = SHEET_COLUMNS[name]
    const rows: CellValue[][] = []
    worksheet.eachRow((row) => {
      const values = columns.map((_, index) => {
        const cell = row.getCell(index + 1).value
        if (cell === null || cell === undefined) return ''
        if (cell instanceof Date) return cell.toISOString().slice(0, 10)
        if (typeof cell === 'object') {
          const rich = cell as { text?: unknown; result?: unknown }
          if (typeof rich.text === 'string') return rich.text
          if (typeof rich.result === 'string' || typeof rich.result === 'number') return rich.result
          return ''
        }
        return cell as CellValue
      })
      rows.push(values)
    })
    sheetRows[name] = rows
  }
  await restoreFromSheets(sheetRows)
}
