import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { getSetting, setSetting } from './db/db'
import { clearDemoData, generateAllOccurrences } from './db/repos'
import { startAutoSync } from './services/sync/GoogleSheetsSync'
import { HomePage } from './features/home/HomePage'
import { HistoryPage } from './features/history/HistoryPage'
import { InsightsPage } from './features/insights/InsightsPage'
import { KhataPage } from './features/khata/KhataPage'
import { PersonPage } from './features/khata/PersonPage'
import { SettingsPage } from './features/settings/SettingsPage'

async function bootstrap(): Promise<void> {
  try {
    // Demo data is retired: remove it once from existing installs.
    // Only records with source 'demo' are deleted — your own data is untouched.
    if ((await getSetting('demoPurged')) !== '1') {
      await clearDemoData()
      await setSetting('demoPurged', '1')
    }
    await generateAllOccurrences()
    await startAutoSync()
  } catch (error) {
    console.error('MyFinance bootstrap failed', error)
  }
}

export default function App() {
  useEffect(() => {
    void bootstrap()
  }, [])
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/khata" element={<KhataPage />} />
          <Route path="/khata/:personId" element={<PersonPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
