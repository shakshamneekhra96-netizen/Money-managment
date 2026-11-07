import { db, newId, nowISO } from './db'
import { assertCompletable, datesToInsert, occurrenceDates, occurrenceKey } from '../domain/recurrence'
import { todayISO } from '../domain/dates'
import type {
  AppSnapshot,
  Attachment,
  Frequency,
  Investment,
  InvestmentKind,
  InvestmentPay,
  KhataTransaction,
  OpeningDirection,
  Person,
  RecurringIncome,
  Section,
  Transaction,
} from '../domain/types'

// ---------- expenses ----------

export interface AddExpenseInput {
  section: Section
  amountPaise: number
  date: string
  categoryId: string | null
  subcategoryId: string | null
  paymentMode: string | null
  description: string
  attachment?: { filename: string; mimeType: string; dataBase64: string }
}

export async function addExpense(input: AddExpenseInput): Promise<void> {
  const now = nowISO()
  let attachmentId: string | null = null
  if (input.attachment) {
    attachmentId = newId()
    const attachment: Attachment = {
      id: attachmentId,
      ownerId: '',
      filename: input.attachment.filename,
      mimeType: input.attachment.mimeType,
      dataBase64: input.attachment.dataBase64,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    }
    await db.attachments.add(attachment)
  }
  const category = input.categoryId ? await db.categories.get(input.categoryId) : null
  const sub = input.subcategoryId ? await db.categories.get(input.subcategoryId) : null
  const tx: Transaction = {
    id: newId(),
    type: input.section === 'personal' ? 'PERSONAL_EXPENSE' : 'HOME_EXPENSE',
    amountPaise: input.amountPaise,
    date: input.date,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    subcategoryId: sub?.id ?? null,
    subcategoryName: sub?.name ?? null,
    paymentMode: input.paymentMode,
    description: input.description,
    attachmentId,
    investmentId: null,
    occurrenceId: null,
    recurringIncomeId: null,
    incomeOccurrenceId: null,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  await db.transactions.add(tx)
  if (attachmentId) await db.attachments.update(attachmentId, { ownerId: tx.id })
}

export async function updateTransaction(id: string, patch: Partial<Pick<Transaction, 'date' | 'amountPaise' | 'description' | 'paymentMode' | 'categoryId' | 'categoryName' | 'subcategoryId' | 'subcategoryName'>>): Promise<void> {
  if (patch.categoryId !== undefined) {
    const category = patch.categoryId ? await db.categories.get(patch.categoryId) : null
    patch.categoryName = category?.name ?? null
  }
  if (patch.subcategoryId !== undefined) {
    const sub = patch.subcategoryId ? await db.categories.get(patch.subcategoryId) : null
    patch.subcategoryName = sub?.name ?? null
  }
  await db.transactions.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteTransaction(id: string): Promise<void> {
  const tx = await db.transactions.get(id)
  if (!tx) return
  if (tx.occurrenceId || tx.incomeOccurrenceId) {
    throw new Error('Investment and salary records are managed from their occurrence cards. Delete them there.')
  }
  await db.transactions.delete(id)
}

// ---------- income ----------

export async function addOneOffIncome(input: { source: string; amountPaise: number; date: string; description?: string; paymentMode?: string | null }): Promise<void> {
  const now = nowISO()
  await db.transactions.add({
    id: newId(),
    type: 'INCOME',
    amountPaise: input.amountPaise,
    date: input.date,
    categoryId: null,
    categoryName: input.source,
    subcategoryId: null,
    subcategoryName: null,
    paymentMode: input.paymentMode ?? null,
    description: input.description?.trim() || input.source,
    attachmentId: null,
    investmentId: null,
    occurrenceId: null,
    recurringIncomeId: null,
    incomeOccurrenceId: null,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  })
}

export interface SalaryTemplateInput {
  name: string
  expectedAmountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMode: string
}

export async function createSalaryTemplate(input: SalaryTemplateInput): Promise<void> {
  const now = nowISO()
  const template: RecurringIncome = {
    id: newId(),
    name: input.name,
    expectedAmountPaise: input.expectedAmountPaise,
    startDate: input.startDate,
    debitDate: input.debitDate,
    frequency: input.frequency,
    paymentMode: input.paymentMode,
    active: true,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  await db.recurringIncome.add(template)
  await generateIncomeOccurrences(template)
}

async function generateIncomeOccurrences(template: RecurringIncome, today = new Date()): Promise<void> {
  const dates = occurrenceDates(template.debitDate, template.frequency, today)
  const existing = await db.incomeOccurrences.where('recurringIncomeId').equals(template.id).toArray()
  const have = existing.map((occurrence) => occurrence.scheduledDate)
  const toAdd = datesToInsert(have, dates).map((date) => {
    const now = nowISO()
    return {
      id: occurrenceKey(template.id, date),
      recurringIncomeId: template.id,
      scheduledDate: date,
      status: 'pending' as const,
      actualDate: null,
      actualAmountPaise: null,
      transactionId: null,
      source: template.source,
      createdAt: now,
      updatedAt: now,
    }
  })
  if (toAdd.length > 0) await db.incomeOccurrences.bulkAdd(toAdd)
}

export async function markIncomeReceived(occurrenceId: string, actualDate: string, actualPaise: number): Promise<void> {
  await db.transaction('rw', db.incomeOccurrences, db.transactions, async () => {
    const occ = await db.incomeOccurrences.get(occurrenceId)
    if (!occ) throw new Error('Income occurrence not found.')
    if (occ.status === 'received' || occ.transactionId) throw new Error('This salary is already marked received.')
    const template = await db.recurringIncome.get(occ.recurringIncomeId)
    if (!template) throw new Error('Income template not found.')
    const now = nowISO()
    const txId = newId()
    await db.transactions.add({
      id: txId,
      type: 'INCOME',
      amountPaise: actualPaise,
      date: actualDate,
      categoryId: null,
      categoryName: template.name,
      subcategoryId: null,
      subcategoryName: null,
      paymentMode: template.paymentMode,
      description: template.name,
      attachmentId: null,
      investmentId: null,
      occurrenceId: null,
      recurringIncomeId: template.id,
      incomeOccurrenceId: occurrenceId,
      source: occ.source,
      createdAt: now,
      updatedAt: now,
    })
    await db.incomeOccurrences.update(occurrenceId, { status: 'received', actualDate, actualAmountPaise: actualPaise, transactionId: txId, updatedAt: now })
  })
}

// ---------- investments ----------

export interface InvestmentTemplateInput {
  name: string
  type: InvestmentKind
  amountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMethod: InvestmentPay
  notes: string
}

export async function createInvestmentTemplate(input: InvestmentTemplateInput): Promise<void> {
  const now = nowISO()
  const investment: Investment = {
    id: newId(),
    name: input.name,
    type: input.type,
    amountPaise: input.amountPaise,
    startDate: input.startDate,
    debitDate: input.debitDate,
    frequency: input.frequency,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    active: true,
    oneTime: false,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  await db.investments.add(investment)
  await generateInvestmentOccurrences(investment)
}

async function generateInvestmentOccurrences(investment: Investment, today = new Date()): Promise<void> {
  const dates = occurrenceDates(investment.debitDate, investment.frequency, today)
  const existing = await db.investmentOccurrences.where('investmentId').equals(investment.id).toArray()
  const have = existing.map((occurrence) => occurrence.scheduledDate)
  const toAdd = datesToInsert(have, dates).map((date) => {
    const now = nowISO()
    return {
      id: occurrenceKey(investment.id, date),
      investmentId: investment.id,
      scheduledDate: date,
      status: 'pending' as const,
      actualDate: null,
      actualAmountPaise: null,
      transactionId: null,
      source: investment.source,
      createdAt: now,
      updatedAt: now,
    }
  })
  if (toAdd.length > 0) await db.investmentOccurrences.bulkAdd(toAdd)
}

export async function recordOneOffInvestment(input: { name: string; type: InvestmentKind; amountPaise: number; date: string; notes: string }): Promise<void> {
  const now = nowISO()
  const investment: Investment = {
    id: newId(),
    name: input.name,
    type: input.type,
    amountPaise: input.amountPaise,
    startDate: input.date,
    debitDate: input.date,
    frequency: 'yearly',
    paymentMethod: 'Self Transaction',
    notes: input.notes,
    active: true,
    oneTime: true,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  const occurrenceId = occurrenceKey(investment.id, input.date)
  const txId = newId()
  await db.transaction('rw', db.investments, db.investmentOccurrences, db.transactions, async () => {
    await db.investments.add(investment)
    await db.investmentOccurrences.add({
      id: occurrenceId,
      investmentId: investment.id,
      scheduledDate: input.date,
      status: 'completed',
      actualDate: input.date,
      actualAmountPaise: input.amountPaise,
      transactionId: txId,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    })
    await db.transactions.add({
      id: txId,
      type: 'INVESTMENT',
      amountPaise: input.amountPaise,
      date: input.date,
      categoryId: null,
      categoryName: investment.type,
      subcategoryId: null,
      subcategoryName: null,
      paymentMode: null,
      description: investment.name,
      attachmentId: null,
      investmentId: investment.id,
      occurrenceId,
      recurringIncomeId: null,
      incomeOccurrenceId: null,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    })
  })
}

export async function completeInvestmentOccurrence(occurrenceId: string, actualDate: string, actualPaise: number): Promise<void> {
  await db.transaction('rw', db.investmentOccurrences, db.transactions, async () => {
    const occ = await db.investmentOccurrences.get(occurrenceId)
    if (!occ) throw new Error('Occurrence not found.')
    assertCompletable(occ.status, occ.transactionId)
    const investment = await db.investments.get(occ.investmentId)
    if (!investment) throw new Error('Investment not found.')
    const now = nowISO()
    const txId = newId()
    await db.transactions.add({
      id: txId,
      type: 'INVESTMENT',
      amountPaise: actualPaise,
      date: actualDate,
      categoryId: null,
      categoryName: investment.type,
      subcategoryId: null,
      subcategoryName: null,
      paymentMode: null,
      description: investment.name,
      attachmentId: null,
      investmentId: investment.id,
      occurrenceId,
      recurringIncomeId: null,
      incomeOccurrenceId: null,
      source: occ.source,
      createdAt: now,
      updatedAt: now,
    })
    await db.investmentOccurrences.update(occurrenceId, { status: 'completed', actualDate, actualAmountPaise: actualPaise, transactionId: txId, updatedAt: now })
  })
}

export async function skipInvestmentOccurrence(occurrenceId: string): Promise<void> {
  const occ = await db.investmentOccurrences.get(occurrenceId)
  if (!occ) return
  if (occ.status === 'completed' || occ.transactionId) {
    throw new Error('This occurrence is already completed.')
  }
  await db.investmentOccurrences.update(occurrenceId, { status: 'skipped', updatedAt: nowISO() })
}

export async function generateAllOccurrences(today = new Date()): Promise<void> {
  const investments = await db.investments.toArray()
  for (const investment of investments) {
    if (investment.active && !investment.oneTime) await generateInvestmentOccurrences(investment, today)
  }
  const templates = await db.recurringIncome.toArray()
  for (const template of templates) {
    if (template.active) await generateIncomeOccurrences(template, today)
  }
}

// ---------- khata ----------

export async function addPerson(input: { name: string; mobile: string; notes: string; openingPaise: number; openingDirection: OpeningDirection }): Promise<string> {
  const now = nowISO()
  const person: Person = {
    id: newId(),
    name: input.name,
    mobile: input.mobile,
    notes: input.notes,
    archived: false,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  await db.people.add(person)
  if (input.openingPaise > 0) {
    await db.khataTransactions.add({
      id: newId(),
      personId: person.id,
      type: 'KHATA_OPENING_BALANCE',
      amountPaise: input.openingPaise,
      openingDirection: input.openingDirection,
      date: todayISO(),
      description: 'Opening balance',
      paymentMode: null,
      attachmentId: null,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    })
  }
  return person.id
}

export async function updatePerson(id: string, patch: { name?: string; mobile?: string; notes?: string }): Promise<void> {
  await db.people.update(id, { ...patch, updatedAt: nowISO() })
}

export async function setPersonArchived(id: string, archived: boolean): Promise<void> {
  await db.people.update(id, { archived, updatedAt: nowISO() })
}

export async function deletePersonAndHistory(id: string): Promise<void> {
  await db.transaction('rw', db.people, db.khataTransactions, async () => {
    await db.khataTransactions.where('personId').equals(id).delete()
    await db.people.delete(id)
  })
}

export async function addKhataEntry(input: { personId: string; type: 'KHATA_GIVEN' | 'KHATA_RECEIVED'; amountPaise: number; date: string; description: string; paymentMode: string | null }): Promise<void> {
  const now = nowISO()
  const entry: KhataTransaction = {
    id: newId(),
    personId: input.personId,
    type: input.type,
    amountPaise: input.amountPaise,
    openingDirection: null,
    date: input.date,
    description: input.description,
    paymentMode: input.paymentMode,
    attachmentId: null,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
  await db.khataTransactions.add(entry)
}

// ---------- categories & budgets ----------

export interface CategoryInput {
  id?: string
  name: string
  section: Section
  parentId: string | null
  icon: string
  color: string
  archived: boolean
}

export async function upsertCategory(input: CategoryInput): Promise<string> {
  const now = nowISO()
  if (input.id) {
    await db.categories.update(input.id, {
      name: input.name,
      section: input.section,
      parentId: input.parentId,
      icon: input.icon,
      color: input.color,
      archived: input.archived,
      updatedAt: now,
    })
    return input.id
  }
  const id = newId()
  await db.categories.add({
    id,
    name: input.name,
    section: input.section,
    parentId: input.parentId,
    icon: input.icon,
    color: input.color,
    archived: input.archived,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<void> {
  await db.categories.update(id, { archived, updatedAt: nowISO() })
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await db.categories.where('parentId').equals(id).delete()
    await db.categories.delete(id)
  })
}

export async function upsertBudget(categoryId: string, month: string, amountPaise: number): Promise<void> {
  const now = nowISO()
  const existing = await db.budgets.where('month').equals(month).toArray()
  const match = existing.find((budget) => budget.categoryId === categoryId)
  if (match) {
    await db.budgets.update(match.id, { amountPaise, updatedAt: now })
    return
  }
  await db.budgets.add({ id: newId(), categoryId, month, amountPaise, source: 'user', createdAt: now, updatedAt: now })
}

// ---------- recurring bills ----------

export interface BillInput {
  id?: string
  name: string
  amountPaise: number
  dayOfMonth: number
  section?: Section
  archived: boolean
}

export async function upsertBill(input: BillInput): Promise<string> {
  const now = nowISO()
  if (input.id) {
    await db.bills.update(input.id, {
      name: input.name,
      amountPaise: input.amountPaise,
      dayOfMonth: input.dayOfMonth,
      section: input.section,
      archived: input.archived,
      updatedAt: now,
    })
    return input.id
  }
  const id = newId()
  await db.bills.add({
    id,
    name: input.name,
    amountPaise: input.amountPaise,
    dayOfMonth: input.dayOfMonth,
    section: input.section,
    archived: input.archived,
    lastAction: null,
    lastActionCycle: null,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function setBillArchived(id: string, archived: boolean): Promise<void> {
  await db.bills.update(id, { archived, updatedAt: nowISO() })
}

export async function deleteBill(id: string): Promise<void> {
  await db.bills.delete(id)
}

// ---------- recurring templates: edit & delete (Settings) ----------

export interface SalaryTemplateUpdateInput {
  name: string
  expectedAmountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMode: string
  active: boolean
}

export async function updateSalaryTemplate(id: string, input: SalaryTemplateUpdateInput): Promise<void> {
  const template = await db.recurringIncome.get(id)
  if (!template) throw new Error('Recurring income not found.')
  const updated: RecurringIncome = { ...template, ...input, updatedAt: nowISO() }
  await db.recurringIncome.put(updated)
  await generateIncomeOccurrences(updated)
}

export async function deleteSalaryTemplate(id: string): Promise<void> {
  await db.transaction('rw', db.recurringIncome, db.incomeOccurrences, async () => {
    await db.incomeOccurrences.where('recurringIncomeId').equals(id).delete()
    await db.recurringIncome.delete(id)
  })
}

export interface InvestmentTemplateUpdateInput {
  name: string
  type: InvestmentKind
  amountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMethod: InvestmentPay
  notes: string
  active: boolean
}

export async function updateInvestmentTemplate(id: string, input: InvestmentTemplateUpdateInput): Promise<void> {
  const investment = await db.investments.get(id)
  if (!investment) throw new Error('Investment not found.')
  const updated: Investment = { ...investment, ...input, updatedAt: nowISO() }
  await db.investments.put(updated)
  if (!updated.oneTime) await generateInvestmentOccurrences(updated)
}

export async function deleteInvestmentTemplate(id: string): Promise<void> {
  await db.transaction('rw', db.investments, db.investmentOccurrences, async () => {
    await db.investmentOccurrences.where('investmentId').equals(id).delete()
    await db.investments.delete(id)
  })
}

export async function payBill(billId: string, cycleLabel: string, actual: { date: string; amountPaise: number; paymentMode: string | null; section?: Section }): Promise<void> {
  await db.transaction('rw', db.bills, db.transactions, async () => {
    const bill = await db.bills.get(billId)
    if (!bill) throw new Error('Bill not found.')
    if (bill.lastActionCycle === cycleLabel) {
      throw new Error(`${bill.name} is already handled for ${cycleLabel}.`)
    }
    const now = nowISO()
    const txId = newId()
    await db.transactions.add({
      id: txId,
      type: actual.section === 'personal' ? 'PERSONAL_EXPENSE' : 'HOME_EXPENSE',
      amountPaise: actual.amountPaise,
      date: actual.date,
      categoryId: null,
      categoryName: 'Bills',
      subcategoryId: null,
      subcategoryName: bill.name,
      paymentMode: actual.paymentMode,
      description: `${bill.name} bill payment`,
      attachmentId: null,
      investmentId: null,
      occurrenceId: null,
      recurringIncomeId: null,
      incomeOccurrenceId: null,
      source: bill.source,
      createdAt: now,
      updatedAt: now,
    })
    await db.bills.update(billId, { lastAction: 'paid', lastActionCycle: cycleLabel, updatedAt: now })
  })
}

export async function skipBill(billId: string, cycleLabel: string): Promise<void> {
  const bill = await db.bills.get(billId)
  if (!bill) return
  if (bill.lastActionCycle === cycleLabel) {
    throw new Error(`${bill.name} is already handled for ${cycleLabel}.`)
  }
  await db.bills.update(billId, { lastAction: 'skipped', lastActionCycle: cycleLabel, updatedAt: nowISO() })
}

// ---------- maintenance ----------

export async function clearDemoData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.categories, db.people, db.khataTransactions, db.investments, db.investmentOccurrences, db.recurringIncome, db.incomeOccurrences, db.budgets, db.bills, db.attachments],
    async () => {
      await db.transactions.filter((row) => row.source === 'demo').delete()
      await db.categories.filter((row) => row.source === 'demo').delete()
      await db.people.filter((row) => row.source === 'demo').delete()
      await db.khataTransactions.filter((row) => row.source === 'demo').delete()
      await db.investments.filter((row) => row.source === 'demo').delete()
      await db.investmentOccurrences.filter((row) => row.source === 'demo').delete()
      await db.recurringIncome.filter((row) => row.source === 'demo').delete()
      await db.incomeOccurrences.filter((row) => row.source === 'demo').delete()
      await db.budgets.filter((row) => row.source === 'demo').delete()
      await db.bills.filter((row) => row.source === 'demo').delete()
      await db.attachments.filter((row) => row.source === 'demo').delete()
    },
  )
}

export async function exportSnapshot(): Promise<AppSnapshot> {
  const [transactions, categories, people, khataTransactions, investments, investmentOccurrences, recurringIncome, incomeOccurrences, budgets, bills, settings, attachments] =
    await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.people.toArray(),
      db.khataTransactions.toArray(),
      db.investments.toArray(),
      db.investmentOccurrences.toArray(),
      db.recurringIncome.toArray(),
      db.incomeOccurrences.toArray(),
      db.budgets.toArray(),
      db.bills.toArray(),
      db.settings.toArray(),
      db.attachments.toArray(),
    ])
  return { transactions, categories, people, khataTransactions, investments, investmentOccurrences, recurringIncome, incomeOccurrences, budgets, bills, settings, attachments }
}

export async function replaceAll(snapshot: AppSnapshot): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.categories, db.people, db.khataTransactions, db.investments, db.investmentOccurrences, db.recurringIncome, db.incomeOccurrences, db.budgets, db.bills, db.settings, db.attachments],
    async () => {
      await db.transactions.clear()
      await db.categories.clear()
      await db.people.clear()
      await db.khataTransactions.clear()
      await db.investments.clear()
      await db.investmentOccurrences.clear()
      await db.recurringIncome.clear()
      await db.incomeOccurrences.clear()
      await db.budgets.clear()
      await db.bills.clear()
      await db.settings.clear()
      await db.attachments.clear()
      if (snapshot.transactions?.length) await db.transactions.bulkPut(snapshot.transactions)
      if (snapshot.categories?.length) await db.categories.bulkPut(snapshot.categories)
      if (snapshot.people?.length) await db.people.bulkPut(snapshot.people)
      if (snapshot.khataTransactions?.length) await db.khataTransactions.bulkPut(snapshot.khataTransactions)
      if (snapshot.investments?.length) await db.investments.bulkPut(snapshot.investments)
      if (snapshot.investmentOccurrences?.length) await db.investmentOccurrences.bulkPut(snapshot.investmentOccurrences)
      if (snapshot.recurringIncome?.length) await db.recurringIncome.bulkPut(snapshot.recurringIncome)
      if (snapshot.incomeOccurrences?.length) await db.incomeOccurrences.bulkPut(snapshot.incomeOccurrences)
      if (snapshot.budgets?.length) await db.budgets.bulkPut(snapshot.budgets)
      if (snapshot.bills?.length) await db.bills.bulkPut(snapshot.bills)
      if (snapshot.settings?.length) await db.settings.bulkPut(snapshot.settings)
      if (snapshot.attachments?.length) await db.attachments.bulkPut(snapshot.attachments)
    },
  )
}
