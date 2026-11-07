import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  format,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { DisplayStatus, Frequency, OccurrenceStatus } from './types'
import { toISODate } from './dates'

export function stepDate(date: Date, frequency: Frequency): Date {
  if (frequency === 'daily') return addDays(date, 1)
  if (frequency === 'weekly') return addWeeks(date, 1)
  if (frequency === 'monthly') return addMonths(date, 1)
  return addYears(date, 1)
}

function firstOnOrAfter(debit: Date, min: Date, frequency: Frequency): Date {
  if (debit >= min) return debit
  if (frequency === 'daily') return min
  if (frequency === 'weekly') {
    const steps = Math.floor(differenceInCalendarDays(min, debit) / 7)
    const jumped = addWeeks(debit, Math.max(0, steps))
    return jumped < min ? addWeeks(jumped, 1) : jumped
  }
  if (frequency === 'monthly') {
    const jumped = addMonths(debit, Math.max(0, differenceInCalendarMonths(min, debit) - 1))
    let cursor = jumped < debit ? debit : jumped
    while (cursor < min) cursor = addMonths(cursor, 1)
    return cursor
  }
  const jumped = addYears(debit, Math.max(0, differenceInCalendarYears(min, debit) - 1))
  let cursor = jumped < debit ? debit : jumped
  while (cursor < min) cursor = addYears(cursor, 1)
  return cursor
}

export function occurrenceDates(debitDate: string, frequency: Frequency, today = new Date()): string[] {
  const debit = startOfDay(parseISO(debitDate))
  const min = addMonths(startOfDay(today), -14)
  const end = toISODate(addMonths(startOfDay(today), 14))
  let cursor = firstOnOrAfter(debit, min, frequency)
  const dates: string[] = []
  let guard = 0
  while (guard < 900) {
    const iso = format(cursor, 'yyyy-MM-dd')
    if (iso > end) break
    dates.push(iso)
    cursor = stepDate(cursor, frequency)
    guard += 1
  }
  return dates
}

export function datesToInsert(existing: string[], generated: string[]): string[] {
  const have = new Set(existing)
  return generated.filter((date) => !have.has(date))
}

export function occurrenceKey(templateId: string, scheduledDate: string): string {
  return `${templateId}|${scheduledDate}`
}

export function displayStatus(status: OccurrenceStatus, scheduledDate: string, today = todayISO()): DisplayStatus {
  if (status === 'pending' && scheduledDate < today) return 'overdue'
  return status
}

function todayISO(): string {
  return toISODate(new Date())
}

export function assertCompletable(status: OccurrenceStatus, transactionId: string | null): void {
  if (status === 'completed' || transactionId) {
    throw new Error('This occurrence is already completed.')
  }
  if (status === 'skipped') {
    throw new Error('This occurrence was skipped.')
  }
}
