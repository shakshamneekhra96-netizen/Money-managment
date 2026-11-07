import {
  addDays,
  addMonths,
  format,
  getDaysInMonth,
  parseISO,
  setDate,
  startOfDay,
} from 'date-fns'
import type { DateFormat } from './types'

export function todayISO(now = new Date()): string {
  return format(startOfDay(now), 'yyyy-MM-dd')
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function parseDay(iso: string): Date {
  return parseISO(iso)
}

export function formatDay(iso: string, pattern: DateFormat): string {
  return format(parseISO(iso), pattern)
}

export interface Period {
  start: string
  end: string
  label: string
}

export function financialPeriod(anchor: Date, monthStartDay: number): Period {
  const day = Math.min(28, Math.max(1, Math.trunc(monthStartDay) || 1))
  const today = startOfDay(anchor)
  const thisStart = setDate(today, Math.min(day, getDaysInMonth(today)))
  const startDate = today >= thisStart ? thisStart : clampedMonthDate(addMonths(today, -1), day)
  const nextStart = clampedMonthDate(addMonths(startDate, 1), day)
  const endDate = addDays(nextStart, -1)
  return {
    start: toISODate(startDate),
    end: toISODate(endDate),
    label: format(startDate, 'MMMM yyyy'),
  }
}

function clampedMonthDate(date: Date, day: number): Date {
  return setDate(date, Math.min(day, getDaysInMonth(date)))
}

export function previousPeriod(period: Period, monthStartDay: number): Period {
  return financialPeriod(addDays(parseISO(period.start), -1), monthStartDay)
}

export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}
