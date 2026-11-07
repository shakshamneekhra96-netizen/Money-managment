import type { SyncBackend } from './SyncPort'

export const googleDriveSync: SyncBackend = {
  async exportWorkbook(): Promise<void> {
    throw new Error('Google Drive is not connected in this version. Use the local Excel backup instead.')
  },
  async importWorkbook(_file: File): Promise<void> {
    throw new Error('Google Drive is not connected in this version. Use the local Excel restore instead.')
  },
}
