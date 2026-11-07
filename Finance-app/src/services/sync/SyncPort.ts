import { getSetting } from '../../db/db'
import { exportWorkbook as localExport, importWorkbook as localImport } from './LocalExcelSync'

export interface SyncBackend {
  exportWorkbook(): Promise<void>
  importWorkbook(file: File): Promise<void>
}

export async function exportWorkbook(): Promise<void> {
  return localExport()
}

export async function importWorkbook(file: File): Promise<void> {
  return localImport(file)
}

export async function lastBackupAt(): Promise<string | null> {
  return getSetting('lastBackupAt')
}

export { googleDriveSync } from './GoogleDriveSync'
