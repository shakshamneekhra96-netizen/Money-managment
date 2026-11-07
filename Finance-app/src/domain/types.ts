export type RecordSource = 'default' | 'demo' | 'user'

export type TransactionType =
  | 'PERSONAL_EXPENSE'
  | 'HOME_EXPENSE'
  | 'INVESTMENT'
  | 'INCOME'
  | 'TRANSFER'

export type KhataType = 'KHATA_GIVEN' | 'KHATA_RECEIVED' | 'KHATA_OPENING_BALANCE'

export type Section = 'personal' | 'home'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type InvestmentKind = 'SIP' | 'Mutual Fund' | 'Bond' | 'Stocks' | 'Other'
export type InvestmentPay = 'Autopay' | 'Self Transaction'
export type OccurrenceStatus = 'pending' | 'completed' | 'skipped'
export type DisplayStatus = OccurrenceStatus | 'overdue'
export type IncomeOccurrenceStatus = 'pending' | 'received'
export type ThemeMode = 'light' | 'dark' | 'system'
export type OpeningDirection = 'they_owe_me' | 'i_owe_them'
export type DateFormat = 'dd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'

export interface Transaction {
  id: string
  type: TransactionType
  amountPaise: number
  date: string
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  paymentMode: string | null
  description: string
  attachmentId: string | null
  investmentId: string | null
  occurrenceId: string | null
  recurringIncomeId: string | null
  incomeOccurrenceId: string | null
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  section: Section
  parentId: string | null
  icon: string
  color: string
  archived: boolean
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface Person {
  id: string
  name: string
  mobile: string
  notes: string
  archived: boolean
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface KhataTransaction {
  id: string
  personId: string
  type: KhataType
  amountPaise: number
  openingDirection: OpeningDirection | null
  date: string
  description: string
  paymentMode: string | null
  attachmentId: string | null
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface Investment {
  id: string
  name: string
  type: InvestmentKind
  amountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMethod: InvestmentPay
  notes: string
  active: boolean
  oneTime: boolean
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface InvestmentOccurrence {
  id: string
  investmentId: string
  scheduledDate: string
  status: OccurrenceStatus
  actualDate: string | null
  actualAmountPaise: number | null
  transactionId: string | null
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface RecurringIncome {
  id: string
  name: string
  expectedAmountPaise: number
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMode: string
  active: boolean
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface IncomeOccurrence {
  id: string
  recurringIncomeId: string
  scheduledDate: string
  status: IncomeOccurrenceStatus
  actualDate: string | null
  actualAmountPaise: number | null
  transactionId: string | null
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface Budget {
  id: string
  categoryId: string
  month: string
  amountPaise: number
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface RecurringBill {
  id: string
  name: string
  amountPaise: number
  dayOfMonth: number
  section?: Section
  archived: boolean
  lastAction: 'paid' | 'skipped' | null
  lastActionCycle: string | null
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface SettingRow {
  key: string
  value: string
  updatedAt: string
}

export interface Attachment {
  id: string
  ownerId: string
  filename: string
  mimeType: string
  dataBase64: string
  source: RecordSource
  createdAt: string
  updatedAt: string
}

export interface ProfileSettings {
  name: string
  currency: 'INR'
  monthStartDay: number
  defaultPaymentMethod: string
  dateFormat: DateFormat
}

export interface PaymentMethod {
  id: string
  name: string
  archived: boolean
}

export interface AppSnapshot {
  transactions: Transaction[]
  categories: Category[]
  people: Person[]
  khataTransactions: KhataTransaction[]
  investments: Investment[]
  investmentOccurrences: InvestmentOccurrence[]
  recurringIncome: RecurringIncome[]
  incomeOccurrences: IncomeOccurrence[]
  budgets: Budget[]
  bills?: RecurringBill[]
  settings: SettingRow[]
  attachments: Attachment[]
}

export const INVESTMENT_KINDS: InvestmentKind[] = ['SIP', 'Mutual Fund', 'Bond', 'Stocks', 'Other']
export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly']
export const INCOME_SOURCES = [
  'Salary',
  'Freelancing',
  'Bonus',
  'Interest',
  'Rental income',
  'Dividends',
  'Refunds',
  'Other income',
] as const

export const defaultProfile: ProfileSettings = {
  name: 'Shaks',
  currency: 'INR',
  monthStartDay: 1,
  defaultPaymentMethod: 'UPI',
  dateFormat: 'dd MMM yyyy',
}

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: 'pm-upi', name: 'UPI', archived: false },
  { id: 'pm-cash', name: 'Cash', archived: false },
  { id: 'pm-credit', name: 'Credit Card', archived: false },
  { id: 'pm-debit', name: 'Debit Card', archived: false },
  { id: 'pm-bank', name: 'Bank Transfer', archived: false },
  { id: 'pm-other', name: 'Other', archived: false },
]
