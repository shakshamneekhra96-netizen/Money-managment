import { format, setDate, startOfDay, subDays, subMonths } from 'date-fns'
import { db, newId, nowISO } from './db'
import { occurrenceDates, occurrenceKey } from '../domain/recurrence'
import { todayISO } from '../domain/dates'
import {
  defaultPaymentMethods,
  defaultProfile,
  type Budget,
  type Category,
  type IncomeOccurrence,
  type Investment,
  type InvestmentOccurrence,
  type KhataTransaction,
  type Person,
  type RecurringBill,
  type RecurringIncome,
  type Transaction,
} from '../domain/types'

const iso = (date: Date) => format(date, 'yyyy-MM-dd')

function mkCategory(rows: Category[], name: string, section: 'personal' | 'home', icon: string, color: string, parentId: string | null = null): string {
  const now = nowISO()
  const id = newId()
  rows.push({ id, name, section, parentId, icon, color, archived: false, source: 'demo', createdAt: now, updatedAt: now })
  return id
}

function mkTx(rows: Transaction[], type: Transaction['type'], amountPaise: number, date: string, category: Category | null, paymentMode: string, description = ''): void {
  const now = nowISO()
  rows.push({
    id: newId(),
    type,
    amountPaise,
    date,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    subcategoryId: null,
    subcategoryName: null,
    paymentMode,
    description,
    attachmentId: null,
    investmentId: null,
    occurrenceId: null,
    recurringIncomeId: null,
    incomeOccurrenceId: null,
    source: 'demo',
    createdAt: now,
    updatedAt: now,
  })
}

export async function ensureSeed(): Promise<void> {
  const seeded = await db.settings.get('demoSeeded')
  if (seeded) return

  const today = startOfDay(new Date())
  const now = nowISO()
  const todayStr = todayISO()

  const categories: Category[] = []
  const catFood = mkCategory(categories, 'Food', 'personal', 'UtensilsCrossed', '#f97316')
  mkCategory(categories, 'Transport', 'personal', 'Bus', '#3b82f6')
  mkCategory(categories, 'Shopping', 'personal', 'ShoppingBag', '#ec4899')
  mkCategory(categories, 'Entertainment', 'personal', 'Film', '#8b5cf6')
  mkCategory(categories, 'Health', 'personal', 'HeartPulse', '#ef4444')
  mkCategory(categories, 'Education', 'personal', 'GraduationCap', '#10b981')
  const catGroceries = mkCategory(categories, 'Groceries', 'home', 'Package', '#22c55e')
  const catBills = mkCategory(categories, 'Bills', 'home', 'Zap', '#f59e0b')
  mkCategory(categories, 'Rent', 'home', 'Home', '#6366f1')
  mkCategory(categories, 'Maintenance', 'home', 'Wrench', '#64748b')
  mkCategory(categories, 'Household', 'home', 'Sparkles', '#14b8a6')
  const byName = (name: string) => categories.find((c) => c.name === name) ?? null

  const people: Person[] = []
  const rameshId = newId()
  people.push({ id: rameshId, name: 'Ramesh Gupta', mobile: '+919812345678', notes: 'Colleague, lunch club', archived: false, source: 'demo', createdAt: now, updatedAt: now })
  const sureshId = newId()
  people.push({ id: sureshId, name: 'Suresh Kumar', mobile: '+919876543210', notes: 'Neighbour', archived: false, source: 'demo', createdAt: now, updatedAt: now })

  const khata: KhataTransaction[] = []
  const mkKhata = (personId: string, type: KhataTransaction['type'], amountPaise: number, date: string, openingDirection: KhataTransaction['openingDirection'] = null, description = '') => {
    khata.push({ id: newId(), personId, type, amountPaise, openingDirection, date, description, paymentMode: null, attachmentId: null, source: 'demo', createdAt: now, updatedAt: now })
  }
  mkKhata(rameshId, 'KHATA_OPENING_BALANCE', 500000, iso(subDays(today, 75)), 'they_owe_me', 'Opening balance')
  mkKhata(rameshId, 'KHATA_GIVEN', 200000, iso(subDays(today, 40)), null, 'Movie tickets')
  mkKhata(rameshId, 'KHATA_RECEIVED', 150000, iso(subDays(today, 20)), null, 'Part repayment')
  mkKhata(sureshId, 'KHATA_OPENING_BALANCE', 100000, iso(subDays(today, 70)), 'i_owe_them', 'Opening balance')
  mkKhata(sureshId, 'KHATA_GIVEN', 50000, iso(subDays(today, 35)), null, 'Groceries split')
  mkKhata(sureshId, 'KHATA_RECEIVED', 80000, iso(subDays(today, 15)), null, 'Settled share')

  const transactions: Transaction[] = []
  const modes = ['UPI', 'UPI', 'Credit Card', 'Cash']
  for (let i = 75; i >= 0; i -= 1) {
    const d = subDays(today, i)
    const date = iso(d)
    const mode = modes[i % modes.length]
    if (i % 6 === 3) mkTx(transactions, 'HOME_EXPENSE', 130000 + ((i * 700) % 40000), date, byName('Groceries'), 'UPI', 'Monthly stock-up')
    if (i % 14 === 5) mkTx(transactions, 'HOME_EXPENSE', 90000 + ((i * 1300) % 30000), date, byName('Bills'), 'Bank Transfer', 'Utility bill')
    if (i % 30 === 9) mkTx(transactions, 'HOME_EXPENSE', 4500000, date, byName('Rent'), 'Bank Transfer', 'House rent')
    if (i % 2 === 0) mkTx(transactions, 'PERSONAL_EXPENSE', 25000 + ((i * 97) % 20000), date, catFood ? byName('Food') : null, mode, 'Lunch and snacks')
    if (i % 5 === 1) mkTx(transactions, 'PERSONAL_EXPENSE', 6000 + ((i * 53) % 8000), date, byName('Transport'), mode, 'Commute')
    if (i % 7 === 6) mkTx(transactions, 'PERSONAL_EXPENSE', 20000 + ((i * 37) % 30000), date, byName('Entertainment'), mode, 'Weekend outing')
    if (i === 55) mkTx(transactions, 'PERSONAL_EXPENSE', 300000, date, byName('Shopping'), 'Credit Card', 'Kurta')
    if (i === 40) mkTx(transactions, 'HOME_EXPENSE', 250000, date, byName('Maintenance'), 'UPI', 'Plumber visit')
    if (i % 30 === 11) mkTx(transactions, 'INCOME', 2500000, date, null, 'Bank Transfer', 'Freelance project')
  }

  const investments: Investment[] = []
  const investmentOccurrences: InvestmentOccurrence[] = []
  const invTxIds = new Map<string, string>()
  const mkInvestment = (name: string, type: Investment['type'], amountPaise: number, debitDate: string, frequency: Investment['frequency'], paymentMethod: Investment['paymentMethod'], oneTime: boolean, notes: string): Investment => {
    const inv: Investment = { id: newId(), name, type, amountPaise, startDate: debitDate, debitDate, frequency, paymentMethod, notes, active: true, oneTime, source: 'demo', createdAt: now, updatedAt: now }
    investments.push(inv)
    return inv
  }
  const sip = mkInvestment('Index Fund SIP', 'SIP', 500000, iso(setDate(subMonths(today, 5), 5)), 'monthly', 'Autopay', false, 'Nifty 50 index fund')
  const etf = mkInvestment('Nifty ETF', 'Stocks', 300000, iso(setDate(subMonths(today, 2), 15)), 'monthly', 'Self Transaction', false, '')
  for (const inv of [sip, etf]) {
    const dates = occurrenceDates(inv.debitDate, inv.frequency, today)
    for (const date of dates) {
      const occId = occurrenceKey(inv.id, date)
      const isPast = date <= todayStr
      const skipThis = inv === sip && date === iso(setDate(subMonths(today, 2), 5))
      const txId = isPast && !skipThis ? newId() : null
      investmentOccurrences.push({ id: occId, investmentId: inv.id, scheduledDate: date, status: skipThis ? 'skipped' : isPast ? 'completed' : 'pending', actualDate: isPast && !skipThis ? date : null, actualAmountPaise: isPast && !skipThis ? inv.amountPaise : null, transactionId: txId, source: 'demo', createdAt: now, updatedAt: now })
      if (txId) {
        invTxIds.set(occId, txId)
        transactions.push({ id: txId, type: 'INVESTMENT', amountPaise: inv.amountPaise, date, categoryId: null, categoryName: inv.type, subcategoryId: null, subcategoryName: null, paymentMode: null, description: inv.name, attachmentId: null, investmentId: inv.id, occurrenceId: occId, recurringIncomeId: null, incomeOccurrenceId: null, source: 'demo', createdAt: now, updatedAt: now })
      }
    }
  }
  const lumpsum = mkInvestment('Bluechip Lumpsum', 'Mutual Fund', 2500000, iso(subDays(today, 30)), 'yearly', 'Self Transaction', true, 'One-time investment')
  const lumpOcc = occurrenceKey(lumpsum.id, lumpsum.debitDate)
  const lumpTxId = newId()
  investmentOccurrences.push({ id: lumpOcc, investmentId: lumpsum.id, scheduledDate: lumpsum.debitDate, status: 'completed', actualDate: lumpsum.debitDate, actualAmountPaise: lumpsum.amountPaise, transactionId: lumpTxId, source: 'demo', createdAt: now, updatedAt: now })
  transactions.push({ id: lumpTxId, type: 'INVESTMENT', amountPaise: lumpsum.amountPaise, date: lumpsum.debitDate, categoryId: null, categoryName: lumpsum.type, subcategoryId: null, subcategoryName: null, paymentMode: null, description: lumpsum.name, attachmentId: null, investmentId: lumpsum.id, occurrenceId: lumpOcc, recurringIncomeId: null, incomeOccurrenceId: null, source: 'demo', createdAt: now, updatedAt: now })

  const recurringIncome: RecurringIncome[] = []
  const incomeOccurrences: IncomeOccurrence[] = []
  const salary: RecurringIncome = { id: newId(), name: 'Salary', expectedAmountPaise: 8500000, startDate: iso(setDate(subMonths(today, 4), 1)), debitDate: iso(setDate(subMonths(today, 4), 1)), frequency: 'monthly', paymentMode: 'Bank Transfer', active: true, source: 'demo', createdAt: now, updatedAt: now }
  recurringIncome.push(salary)
  for (const date of occurrenceDates(salary.debitDate, salary.frequency, today)) {
    const occId = occurrenceKey(salary.id, date)
    const isPast = date < todayStr
    const txId = isPast ? newId() : null
    incomeOccurrences.push({ id: occId, recurringIncomeId: salary.id, scheduledDate: date, status: isPast ? 'received' : 'pending', actualDate: isPast ? date : null, actualAmountPaise: isPast ? salary.expectedAmountPaise : null, transactionId: txId, source: 'demo', createdAt: now, updatedAt: now })
    if (txId) {
      transactions.push({ id: txId, type: 'INCOME', amountPaise: salary.expectedAmountPaise, date, categoryId: null, categoryName: 'Salary', subcategoryId: null, subcategoryName: null, paymentMode: salary.paymentMode, description: 'Monthly salary', attachmentId: null, investmentId: null, occurrenceId: null, recurringIncomeId: salary.id, incomeOccurrenceId: occId, source: 'demo', createdAt: now, updatedAt: now })
    }
  }

  const budgets: Budget[] = []
  budgets.push({ id: newId(), categoryId: catGroceries, month: todayStr.slice(0, 7), amountPaise: 2000000, source: 'demo', createdAt: now, updatedAt: now })
  budgets.push({ id: newId(), categoryId: catFood, month: todayStr.slice(0, 7), amountPaise: 1500000, source: 'demo', createdAt: now, updatedAt: now })
  budgets.push({ id: newId(), categoryId: catBills, month: todayStr.slice(0, 7), amountPaise: 1000000, source: 'demo', createdAt: now, updatedAt: now })

  const bills: RecurringBill[] = [
    { id: newId(), name: 'WiFi bill', amountPaise: 79900, dayOfMonth: 5, section: 'home', archived: false, lastAction: null, lastActionCycle: null, source: 'demo', createdAt: now, updatedAt: now },
    { id: newId(), name: 'Water bill', amountPaise: 35000, dayOfMonth: 10, section: 'home', archived: false, lastAction: null, lastActionCycle: null, source: 'demo', createdAt: now, updatedAt: now },
    { id: newId(), name: 'Electricity bill', amountPaise: 125000, dayOfMonth: 15, section: 'home', archived: false, lastAction: null, lastActionCycle: null, source: 'demo', createdAt: now, updatedAt: now },
  ]

  await db.transaction(
    'rw',
    [db.transactions, db.categories, db.people, db.khataTransactions, db.investments, db.investmentOccurrences, db.recurringIncome, db.incomeOccurrences, db.budgets, db.bills, db.settings],
    async () => {
      await db.categories.bulkPut(categories)
      await db.people.bulkPut(people)
      await db.khataTransactions.bulkPut(khata)
      await db.transactions.bulkPut(transactions)
      await db.investments.bulkPut(investments)
      await db.investmentOccurrences.bulkPut(investmentOccurrences)
      await db.recurringIncome.bulkPut(recurringIncome)
      await db.incomeOccurrences.bulkPut(incomeOccurrences)
      await db.budgets.bulkPut(budgets)
      await db.bills.bulkPut(bills)
      await db.settings.bulkPut([
        { key: 'demoSeeded', value: 'true', updatedAt: now },
        { key: 'profile', value: JSON.stringify(defaultProfile), updatedAt: now },
        { key: 'paymentMethods', value: JSON.stringify(defaultPaymentMethods), updatedAt: now },
        { key: 'theme', value: 'system', updatedAt: now },
      ])
    },
  )
}
