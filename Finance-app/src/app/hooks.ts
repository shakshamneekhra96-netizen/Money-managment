import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { getJSONSetting, getSetting, setSetting } from '../db/db'
import {
  defaultPaymentMethods,
  defaultProfile,
  type DateFormat,
  type PaymentMethod,
  type ProfileSettings,
  type ThemeMode,
} from '../domain/types'

export function useProfile(): ProfileSettings {
  return useLiveQuery(() => getJSONSetting<ProfileSettings>('profile', defaultProfile), [], defaultProfile) ?? defaultProfile
}

export function usePaymentMethods(): PaymentMethod[] {
  return (
    useLiveQuery(() => getJSONSetting<PaymentMethod[]>('paymentMethods', defaultPaymentMethods), [], defaultPaymentMethods) ?? defaultPaymentMethods
  )
}

export function useThemeMode(): ThemeMode {
  const stored = useLiveQuery(() => getSetting('theme'), [], 'system') ?? 'system'
  return stored as ThemeMode
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  await setSetting('theme', mode)
}

export async function saveProfile(profile: ProfileSettings): Promise<void> {
  await setSetting('profile', JSON.stringify(profile))
}

export async function savePaymentMethods(methods: PaymentMethod[]): Promise<void> {
  await setSetting('paymentMethods', JSON.stringify(methods))
}

export function useTheme(): void {
  const mode = useThemeMode()
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode])
}

export function useDateFormat(): (iso: string) => string {
  const profile = useProfile()
  return (iso: string) => {
    const pattern = profile.dateFormat as DateFormat
    const [y, m, d] = iso.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dd = String(d).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const monthName = months[m - 1] ?? ''
    if (pattern === 'dd/MM/yyyy') return `${dd}/${mm}/${y}`
    if (pattern === 'yyyy-MM-dd') return `${y}-${mm}-${dd}`
    return `${dd} ${monthName} ${y}`
  }
}
