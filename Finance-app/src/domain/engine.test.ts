import { describe, expect, it } from 'vitest'
import { formatINR, rupeesToPaise } from './money'
import { datesToInsert, occurrenceDates, occurrenceKey, assertCompletable } from './recurrence'
import { summarize } from './engine'
import { personBalance } from './khata'
import type { KhataTransaction, Transaction } from './types'

function tx(partial: Pick<Transaction, 'type' | 'amountPaise' | 'date'> & Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 'tx',
    type: partial.type,
    amountPaise: partial.amountPaise,
    date: partial.date,
    categoryId: null,
    categoryName: null,
    subcategoryId: null,
    subcategoryName: null,
    paymentMode: null,
    description: '',
    attachmentId: null,
    investmentId: null,
    occurrenceId: null,
    recurringIncomeId: null,
    incomeOccurrenceId: null,
    source: 'user',
    createdAt: partial.date,
    updatedAt: partial.date,
  }
}

function khata(partial: Pick<KhataTransaction, 'type' | 'amountPaise'> & Partial<KhataTransaction>): KhataTransaction {
  return {
    id: partial.id ?? 'k',
    personId: 'p',
    type: partial.type,
    amountPaise: partial.amountPaise,
    openingDirection: partial.openingDirection ?? null,
    date: '2026-11-01',
    description: '',
    paymentMode: null,
    attachmentId: null,
    source: 'user',
    createdAt: '2026-11-01',
    updatedAt: '2026-11-01',
  }
}

describe('money', () => {
  it('stores rupees as integer paise', () => {
    expect(rupeesToPaise('10.10')).toBe(1010)
    expect(rupeesToPaise('10.2')).toBe(1020)
    expect(formatINR(1010)).toBe('₹10.10')
    expect(formatINR(-250)).toBe('-₹2.50')
  })
})

describe('reports', () => {
  const rows = [
    tx({ type: 'PERSONAL_EXPENSE', amountPaise: 1000, date: '2026-11-02' }),
    tx({ type: 'HOME_EXPENSE', amountPaise: 2000, date: '2026-11-03' }),
    tx({ type: 'INVESTMENT', amountPaise: 5000, date: '2026-11-05' }),
    tx({ type: 'INCOME', amountPaise: 9000, date: '2026-11-01' }),
    tx({ type: 'TRANSFER', amountPaise: 4000, date: '2026-11-04' }),
    tx({ type: 'PERSONAL_EXPENSE', amountPaise: 9999, date: '2026-10-01' }),
  ]

  it('keeps personal, home, investment, income, and transfers apart', () => {
    const summary = summarize(rows, '2026-11-01', '2026-11-30')
    expect(summary.personalPaise).toBe(1000)
    expect(summary.homePaise).toBe(2000)
    expect(summary.investmentPaise).toBe(5000)
    expect(summary.incomePaise).toBe(9000)
    expect(summary.availablePaise).toBe(1000)
  })
})

describe('khata', () => {
  it('supports partial repayment and a negative balance', () => {
    const entries = [
      khata({ type: 'KHATA_OPENING_BALANCE', amountPaise: 500000, openingDirection: 'they_owe_me' }),
      khata({ type: 'KHATA_GIVEN', amountPaise: 200000 }),
      khata({ type: 'KHATA_RECEIVED', amountPaise: 300000 }),
    ]
    expect(personBalance(entries)).toBe(400000)
    expect(personBalance([khata({ type: 'KHATA_OPENING_BALANCE', amountPaise: 150000, openingDirection: 'i_owe_them' })])).toBe(-150000)
  })
})

describe('recurrence', () => {
  it('does not emit duplicate occurrence dates', () => {
    const generated = occurrenceDates('2026-01-05', 'monthly', new Date('2026-11-07T00:00:00'))
    expect(new Set(generated).size).toBe(generated.length)
    expect(datesToInsert(['2026-11-05'], generated)).not.toContain('2026-11-05')
    expect(occurrenceKey('sip', '2026-11-05')).toBe('sip|2026-11-05')
  })

  it('rejects a second completion', () => {
    expect(() => assertCompletable('completed', 'tx')).toThrow(/already completed/)
    expect(() => assertCompletable('skipped', null)).toThrow(/skipped/)
    expect(() => assertCompletable('pending', null)).not.toThrow()
  })
})
