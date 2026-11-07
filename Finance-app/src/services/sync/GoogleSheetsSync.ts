import { getSetting, nowISO, setSetting } from '../../db/db'
import { recordsToRows, SHEET_COLUMNS, SHEET_NAMES, type CellValue } from './excelRows'
import { loadAllRecords, restoreFromSheets } from './sheetModel'

interface NamedSheet {
  name: string
  values: CellValue[][]
}

export const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzgguSGEPyHQRVQCoq6TeBnbAJ37DEJQtkpBPU7W7SccC2TiLLTfJz_5p9-m0SwnKgp/exec'

async function callScript(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = (await getSetting('sheetsScriptUrl')) ?? DEFAULT_SHEETS_URL
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Sync failed (${response.status}). Redeploy the web app with access set to "Anyone".`)
  }
  return (await response.json()) as Record<string, unknown>
}

async function buildSheets(): Promise<NamedSheet[]> {
  const records = await loadAllRecords()
  return SHEET_NAMES.map((name) => {
    let rows = records[name] ?? []
    if (name === 'Settings') {
      // Internal sync keys (like the last payload snapshot) are huge JSON strings
      // that would break Sheets' 50,000-characters-per-cell limit — never push them.
      rows = rows.filter((row) => !String(row.key ?? '').startsWith('sheets'))
    }
    if (name === 'Attachments') {
      // Image payloads over the cell limit can't be pushed to Sheets; they stay local.
      rows = rows.filter((row) => String(row.dataBase64 ?? '').length <= 45000)
    }
    return {
      name,
      values: [SHEET_COLUMNS[name], ...recordsToRows(rows, SHEET_COLUMNS[name])],
    }
  })
}

function checkOk(data: Record<string, unknown>): void {
  if (data.ok === false) throw new Error(String(data.message ?? 'Sync failed.'))
}

/** Send the app's data to the spreadsheet. Returns false when nothing changed since the last sync. */
export async function syncToGoogle(): Promise<boolean> {
  const sheets = await buildSheets()
  const payload = JSON.stringify(sheets)
  if (payload === (await getSetting('sheetsLastPayload'))) return false
  checkOk(await callScript({ action: 'push', sheets }))
  await setSetting('sheetsLastPayload', payload)
  await setSetting('sheetsSyncedAt', nowISO())
  return true
}

/** Load everything from the spreadsheet, replacing local data. */
export async function loadFromGoogle(): Promise<void> {
  const data = await callScript({ action: 'pull' })
  checkOk(data)
  await restoreFromSheets((data.sheets ?? {}) as Record<string, CellValue[][]>)
  await setSetting('sheetsLastPayload', JSON.stringify(await buildSheets()))
  await setSetting('sheetsSyncedAt', nowISO())
}

/** The one Sync button: sends your data to the sheet, or restores from it when the app is empty. */
export async function syncNow(): Promise<string> {
  const records = await loadAllRecords()
  if (SHEET_NAMES.some((name) => (records[name] ?? []).length > 0)) {
    return (await syncToGoogle()) ? 'Sent to Google Sheets ✓' : 'Already up to date ✓'
  }
  await loadFromGoogle()
  return 'Restored from Google Sheets ✓'
}

/** Syncs right away and then every minute while the app is open.
 *  Nothing is uploaded when nothing changed; turn it off in Settings → Google Sheets sync. */
export async function startAutoSync(): Promise<void> {
  const run = async () => {
    try {
      if ((await getSetting('sheetsAutoSync')) === 'off') return
      await syncNow()
    } catch (error) {
      console.error('Google Sheets auto-sync failed', error)
    }
  }
  void run()
  window.setInterval(() => void run(), 60000)
}
