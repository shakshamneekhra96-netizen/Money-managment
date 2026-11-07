import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Home, Pencil, Plus, RefreshCw, RotateCcw, Save, Upload, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CategoryIconView, CATEGORY_ICON_NAMES } from '../../components/icons'
import { Button, Card, EmptyState, Field, Overlay, SectionHeader, Segmented, Select, TextArea, TextInput, useConfirm } from '../../components/ui'
import { savePaymentMethods, saveProfile, saveTheme, useDateFormat, usePaymentMethods, useProfile, useThemeMode } from '../../app/hooks'
import { cx, downloadText, errorMessage } from '../../app/utils'
import { db, getSetting, setSetting } from '../../db/db'
import { deleteBill, deleteCategory, deleteInvestmentTemplate, deleteSalaryTemplate, exportSnapshot, replaceAll, setBillArchived, setCategoryArchived, updateInvestmentTemplate, updateSalaryTemplate, upsertBill, upsertBudget, upsertCategory } from '../../db/repos'
import { exportWorkbook, importWorkbook, lastBackupAt } from '../../services/sync/SyncPort'
import { DEFAULT_SHEETS_URL, loadFromGoogle, syncNow } from '../../services/sync/GoogleSheetsSync'
import { formatINR, paiseToInput, rupeesToPaise } from '../../domain/money'
import { FREQUENCIES, INVESTMENT_KINDS, type AppSnapshot, type Category, type DateFormat, type Frequency, type InvestmentKind, type InvestmentPay, type RecurringBill, type Section, type ThemeMode } from '../../domain/types'

export function SettingsPage() {
  const { confirm, confirmNode } = useConfirm()

  return (
    <div>
      <h1 className="text-xl font-bold text-navy dark:text-white">Settings</h1>
      <ProfileSection />
      <AppearanceSection />
      <CategoriesSection confirm={confirm} />
      <PaymentMethodsSection />
      <BillsSection confirm={confirm} />
      <IncomeSourcesSection confirm={confirm} />
      <InvestmentsSection confirm={confirm} />
      <BudgetsSection />
      <GoogleSheetsSection confirm={confirm} />
      <DataSection />
      {confirmNode}
    </div>
  )
}

function ProfileSection() {
  const profile = useProfile()
  const paymentMethods = usePaymentMethods().filter((method) => !method.archived)
  const [name, setName] = useState(profile.name)
  const [monthStartDay, setMonthStartDay] = useState(profile.monthStartDay)
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState(profile.defaultPaymentMethod)
  const [dateFormat, setDateFormat] = useState<DateFormat>(profile.dateFormat)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(profile.name)
    setMonthStartDay(profile.monthStartDay)
    setDefaultPaymentMethod(profile.defaultPaymentMethod)
    setDateFormat(profile.dateFormat)
  }, [profile])

  return (
    <>
      <SectionHeader title="Profile" />
      <Card className="grid gap-4 p-4 md:grid-cols-2">
        <Field label="Name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Currency">
          <TextInput value="INR (₹)" disabled className="opacity-70" />
        </Field>
        <Field label="Month starts on">
          <Select value={String(monthStartDay)} onChange={(event) => setMonthStartDay(Number(event.target.value))}>
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </Select>
        </Field>
        <Field label="Default payment mode">
          <Select value={defaultPaymentMethod} onChange={(event) => setDefaultPaymentMethod(event.target.value)}>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.name}>{method.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date format">
          <Select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateFormat)}>
            {(['dd MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'] as DateFormat[]).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            onClick={async () => {
              await saveProfile({ ...profile, name: name.trim() || 'Friend', monthStartDay, defaultPaymentMethod, dateFormat })
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            }}
          >
            <Save size={16} /> {saved ? 'Saved ✓' : 'Save profile'}
          </Button>
        </div>
      </Card>
    </>
  )
}

function AppearanceSection() {
  const theme = useThemeMode()
  return (
    <>
      <SectionHeader title="Appearance" />
      <Card className="p-4">
        <Segmented
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
          value={theme}
          onChange={(mode) => void saveTheme(mode as ThemeMode)}
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Theme is stored in settings and applied instantly.</p>
      </Card>
    </>
  )
}

interface CategoryDraft {
  id?: string
  name: string
  section: Section
  parentId: string
  icon: string
  color: string
  archived: boolean
}

const EMPTY_DRAFT: CategoryDraft = { name: '', section: 'personal', parentId: '', icon: 'MoreHorizontal', color: '#3b82f6', archived: false }

const CATEGORY_COLORS = ['#1d4ed8', '#0ea5e9', '#06b6d4', '#10b981', '#059669', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1']

function CategoriesSection({ confirm }: { confirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean> }) {
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [draft, setDraft] = useState<CategoryDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => {
    const bySection = new Map<Section, Category[]>()
    for (const category of categories) {
      if (category.parentId) continue
      const list = bySection.get(category.section) ?? []
      list.push(category)
      bySection.set(category.section, list)
    }
    return bySection
  }, [categories])

  async function save() {
    if (!draft) return
    try {
      setBusy(true)
      setError(null)
      if (!draft.name.trim()) throw new Error('Enter a name.')
      await upsertCategory({
        id: draft.id,
        name: draft.name.trim(),
        section: draft.section,
        parentId: draft.parentId || null,
        icon: draft.icon,
        color: draft.color,
        archived: draft.archived,
      })
      setDraft(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader
        title="Categories"
        action={
          <Button variant="outline" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus size={14} /> Add
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {(['personal', 'home'] as Section[]).map((section) => (
          <Card key={section} className="p-2">
            <div
              className={cx(
                'm-1 mb-2 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm',
                section === 'personal' ? 'bg-[#005A9C]' : 'bg-[#1B365D]',
              )}
            >
              <span className="flex items-center gap-1.5">
                {section === 'personal' ? <User size={14} /> : <Home size={14} />}
                {section} categories
              </span>
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px]">{(grouped.get(section) ?? []).length}</span>
            </div>
            {(grouped.get(section) ?? []).map((category) => {
              const subs = categories.filter((item) => item.parentId === category.id)
              return (
                <div key={category.id} className="border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cx('flex items-center gap-2 text-sm font-medium', category.archived ? 'text-slate-400 line-through' : 'text-ink dark:text-slate-100')}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${category.color}22`, color: category.color }}>
                        <CategoryIconView name={category.icon} className="h-4 w-4" />
                      </span>
                      {category.name}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: category.id,
                            name: category.name,
                            section: category.section,
                            parentId: category.parentId ?? '',
                            icon: category.icon,
                            color: category.color,
                            archived: category.archived,
                          })
                        }
                        className="min-h-[44px] px-2 text-xs font-medium text-accent hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void setCategoryArchived(category.id, !category.archived)}
                        className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:underline"
                      >
                        {category.archived ? 'Restore' : 'Archive'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm(
                            'Delete category?',
                            `Delete ${category.name}?${subs.length > 0 ? ` Its ${subs.length} subcategor${subs.length === 1 ? 'y' : 'ies'} will be deleted too.` : ''} Past transactions keep their category name in History.`,
                            { confirmLabel: 'Delete', danger: true },
                          )
                          if (ok) await deleteCategory(category.id)
                        }}
                        className="min-h-[44px] px-2 text-xs font-medium text-rose-500 hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  {subs.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
                      {subs.map((sub) => (
                        <span
                          key={sub.id}
                          className={cx(
                            'inline-flex items-center gap-1 rounded-full py-1 pl-2 pr-1 text-xs font-medium transition-all hover:scale-105',
                            sub.archived ? 'opacity-50 line-through' : '',
                          )}
                          style={{ background: `${sub.color}22`, color: sub.color }}
                        >
                          <CategoryIconView name={sub.icon} className="h-3.5 w-3.5" />
                          {sub.name}
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                id: sub.id,
                                name: sub.name,
                                section: sub.section,
                                parentId: sub.parentId ?? '',
                                icon: sub.icon,
                                color: sub.color,
                                archived: sub.archived,
                              })
                            }
                            aria-label={`Edit ${sub.name}`}
                            className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
                          >
                            <Pencil size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {(grouped.get(section) ?? []).length === 0 ? <EmptyState title={`No ${section} categories yet`} /> : null}
          </Card>
        ))}
      </div>

      <Overlay open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Edit category' : 'Add category'}>
        {draft ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <Field label="Name">
              <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Section">
              <Segmented
                options={[
                  { value: 'personal', label: 'Personal' },
                  { value: 'home', label: 'Home' },
                ]}
                value={draft.section}
                onChange={(section) => setDraft({ ...draft, section: section as Section })}
              />
            </Field>
            <Field label="Parent category (optional)">
              <Select value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
                <option value="">None (top level)</option>
                {(grouped.get(draft.section) ?? []).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Icon">
              <div className="grid grid-cols-6 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                {CATEGORY_ICON_NAMES.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon: iconName })}
                    className={cx('flex h-10 items-center justify-center rounded-lg transition-all hover:scale-110', draft.icon === iconName ? 'ring-2' : '')}
                    style={draft.icon === iconName ? { background: `${draft.color}22`, color: draft.color, boxShadow: `0 0 0 2px ${draft.color}` } : { color: '#64748b' }}
                  >
                    <CategoryIconView name={iconName} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDraft({ ...draft, color })}
                    aria-label={color}
                    className={cx('h-8 w-8 rounded-lg transition-transform hover:scale-110', draft.color === color && 'ring-2 ring-slate-400')}
                    style={{ background: color }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                  className="h-9 w-12 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </Field>
            {draft.id ? (
              <Field label="Status">
                <Segmented
                  options={[
                    { value: 'no', label: 'Active' },
                    { value: 'yes', label: 'Archived' },
                  ]}
                  value={draft.archived ? 'yes' : 'no'}
                  onChange={(value) => setDraft({ ...draft, archived: value === 'yes' })}
                />
              </Field>
            ) : null}
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">Save category</Button>
          </form>
        ) : null}
      </Overlay>
    </>
  )
}

function PaymentMethodsSection() {
  const methods = usePaymentMethods()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <SectionHeader title="Payment methods" />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {methods.map((method) => (
            <span
              key={method.id}
              className={cx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm',
                method.archived ? 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800' : 'bg-navy/10 text-navy dark:bg-slate-700 dark:text-slate-200',
              )}
            >
              {method.name}
              <button
                type="button"
                className="font-bold hover:text-rose-500"
                aria-label={method.archived ? 'Restore' : 'Archive'}
                onClick={() =>
                  void savePaymentMethods(
                    methods.map((item) => (item.id === method.id ? { ...item, archived: !item.archived } : item)),
                  )
                }
              >
                {method.archived ? '↺' : '×'}
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <TextInput placeholder="New payment method" value={name} onChange={(event) => setName(event.target.value)} />
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true)
              await savePaymentMethods([...methods, { id: `pm-${Date.now()}`, name: name.trim(), archived: false }])
              setName('')
              setBusy(false)
            }}
          >
            <Plus size={16} /> Add
          </Button>
        </div>
      </Card>
    </>
  )
}

interface BillDraft {
  id?: string
  name: string
  amount: string
  dayOfMonth: number
  section: Section
  archived: boolean
}

const EMPTY_BILL_DRAFT: BillDraft = { name: '', amount: '', dayOfMonth: 1, section: 'home', archived: false }

function BillsSection({ confirm }: { confirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean> }) {
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? []
  const [draft, setDraft] = useState<BillDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!draft) return
    try {
      setBusy(true)
      setError(null)
      if (!draft.name.trim()) throw new Error('Enter a bill name (e.g. WiFi bill).')
      await upsertBill({
        id: draft.id,
        name: draft.name.trim(),
        amountPaise: rupeesToPaise(draft.amount),
        dayOfMonth: draft.dayOfMonth,
        section: draft.section,
        archived: draft.archived,
      })
      setDraft(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader
        title="Recurring bills"
        action={
          <Button variant="outline" onClick={() => setDraft({ ...EMPTY_BILL_DRAFT })}>
            <Plus size={14} /> Add
          </Button>
        }
      />
      <Card className="p-2">
        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          Monthly bills like WiFi, water or electricity. Each cycle they appear on Home with Pay / Skip.
        </p>
        {bills.map((bill: RecurringBill) => (
          <div key={bill.id} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800">
            <div className="min-w-0">
              <p className={cx('truncate text-sm font-medium', bill.archived ? 'text-slate-400 line-through' : 'text-ink dark:text-slate-100')}>
                {bill.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatINR(bill.amountPaise)} · due day {bill.dayOfMonth} · {bill.section === 'personal' ? 'Personal' : 'Home'}{bill.lastActionCycle ? ` · ${bill.lastAction === 'paid' ? 'paid' : 'skipped'} ${bill.lastActionCycle}` : ''}
              </p>
            </div>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setDraft({ id: bill.id, name: bill.name, amount: paiseToInput(bill.amountPaise), dayOfMonth: bill.dayOfMonth, section: bill.section ?? 'home', archived: bill.archived })
                }
                className="min-h-[44px] px-2 text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void setBillArchived(bill.id, !bill.archived)}
                className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:underline"
              >
                {bill.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm(
                    'Delete bill?',
                    `Delete ${bill.name}? It will no longer appear on Home. Past payments stay in History.`,
                    { confirmLabel: 'Delete', danger: true },
                  )
                  if (ok) await deleteBill(bill.id)
                }}
                className="min-h-[44px] px-2 text-xs font-medium text-rose-500 hover:underline"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
        {bills.length === 0 ? <EmptyState title="No bills yet" hint="Add your WiFi, water or electricity bill" /> : null}
      </Card>

      <Overlay open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Edit bill' : 'Add bill'}>
        {draft ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <Field label="Bill name">
              <TextInput
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="WiFi bill"
                autoFocus
              />
            </Field>
            <Field label="Section (where the bill is counted)">
              <Segmented
                options={[
                  { value: 'home', label: 'Home' },
                  { value: 'personal', label: 'Personal' },
                ]}
                value={draft.section}
                onChange={(value) => setDraft({ ...draft, section: value as Section })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount per month (₹)">
                <TextInput inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0.00" />
              </Field>
              <Field label="Due day of month">
                <Select value={String(draft.dayOfMonth)} onChange={(event) => setDraft({ ...draft, dayOfMonth: Number(event.target.value) })}>
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {draft.id ? (
              <Field label="Status">
                <Segmented
                  options={[
                    { value: 'no', label: 'Active' },
                    { value: 'yes', label: 'Archived' },
                  ]}
                  value={draft.archived ? 'yes' : 'no'}
                  onChange={(value) => setDraft({ ...draft, archived: value === 'yes' })}
                />
              </Field>
            ) : null}
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">Save bill</Button>
          </form>
        ) : null}
      </Overlay>
    </>
  )
}

interface SalaryDraft {
  id: string
  name: string
  amount: string
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMode: string
  active: boolean
}

function IncomeSourcesSection({ confirm }: { confirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean> }) {
  const formatDate = useDateFormat()
  const templates = useLiveQuery(() => db.recurringIncome.toArray(), []) ?? []
  const [draft, setDraft] = useState<SalaryDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!draft) return
    try {
      setBusy(true)
      setError(null)
      if (!draft.name.trim()) throw new Error('Enter a name.')
      await updateSalaryTemplate(draft.id, {
        name: draft.name.trim(),
        expectedAmountPaise: rupeesToPaise(draft.amount),
        startDate: draft.startDate,
        debitDate: draft.debitDate,
        frequency: draft.frequency,
        paymentMode: draft.paymentMode,
        active: draft.active,
      })
      setDraft(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader title="Recurring income" />
      <Card className="p-2">
        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          Salary and other recurring income. Each cycle appears on Home with a Received button.
        </p>
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
          >
            <div className="min-w-0">
              <p className={cx('truncate text-sm font-medium', !template.active ? 'text-slate-400 line-through' : 'text-ink dark:text-slate-100')}>
                {template.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatINR(template.expectedAmountPaise)} · {template.frequency} · debit {formatDate(template.debitDate)}
              </p>
            </div>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: template.id,
                    name: template.name,
                    amount: paiseToInput(template.expectedAmountPaise),
                    startDate: template.startDate,
                    debitDate: template.debitDate,
                    frequency: template.frequency,
                    paymentMode: template.paymentMode,
                    active: template.active,
                  })
                }
                className="min-h-[44px] px-2 text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() =>
                  void updateSalaryTemplate(template.id, {
                    name: template.name,
                    expectedAmountPaise: template.expectedAmountPaise,
                    startDate: template.startDate,
                    debitDate: template.debitDate,
                    frequency: template.frequency,
                    paymentMode: template.paymentMode,
                    active: !template.active,
                  })
                }
                className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:underline"
              >
                {template.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm(
                    'Delete recurring income?',
                    `Delete ${template.name}? Upcoming occurrences are removed. Received payments stay in History.`,
                    { confirmLabel: 'Delete', danger: true },
                  )
                  if (ok) await deleteSalaryTemplate(template.id)
                }}
                className="min-h-[44px] px-2 text-xs font-medium text-rose-500 hover:underline"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
        {templates.length === 0 ? <EmptyState title="No recurring income yet" hint="Add it with the + button → Income → Recurring salary" /> : null}
      </Card>

      <Overlay open={draft !== null} onClose={() => setDraft(null)} title="Edit recurring income">
        {draft ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <Field label="Name">
              <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Expected amount (₹)">
              <TextInput inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start date">
                <TextInput type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
              </Field>
              <Field label="Debit date">
                <TextInput type="date" value={draft.debitDate} onChange={(event) => setDraft({ ...draft, debitDate: event.target.value })} />
              </Field>
            </div>
            <Field label="Frequency">
              <Select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Frequency })}>
                {FREQUENCIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field label="Payment mode">
              <Select value={draft.paymentMode} onChange={(event) => setDraft({ ...draft, paymentMode: event.target.value })}>
                {['UPI', 'Cash', 'Bank Transfer', 'Cheque'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Segmented
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                ]}
                value={draft.active ? 'active' : 'paused'}
                onChange={(value) => setDraft({ ...draft, active: value === 'active' })}
              />
            </Field>
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">Save changes</Button>
          </form>
        ) : null}
      </Overlay>
    </>
  )
}

interface InvestmentDraft {
  id: string
  name: string
  type: InvestmentKind
  amount: string
  startDate: string
  debitDate: string
  frequency: Frequency
  paymentMethod: InvestmentPay
  notes: string
  active: boolean
}

function InvestmentsSection({ confirm }: { confirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean> }) {
  const formatDate = useDateFormat()
  const investments = useLiveQuery(() => db.investments.toArray(), []) ?? []
  const [draft, setDraft] = useState<InvestmentDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!draft) return
    try {
      setBusy(true)
      setError(null)
      if (!draft.name.trim()) throw new Error('Enter a name.')
      await updateInvestmentTemplate(draft.id, {
        name: draft.name.trim(),
        type: draft.type,
        amountPaise: rupeesToPaise(draft.amount),
        startDate: draft.startDate,
        debitDate: draft.debitDate,
        frequency: draft.frequency,
        paymentMethod: draft.paymentMethod,
        notes: draft.notes.trim(),
        active: draft.active,
      })
      setDraft(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader title="Investments" />
      <Card className="p-2">
        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          Recurring and one-off investments. Each cycle appears on Home to complete when the money is debited.
        </p>
        {investments.map((investment) => (
          <div
            key={investment.id}
            className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
          >
            <div className="min-w-0">
              <p className={cx('truncate text-sm font-medium', !investment.active ? 'text-slate-400 line-through' : 'text-ink dark:text-slate-100')}>
                {investment.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatINR(investment.amountPaise)} · {investment.type}{investment.oneTime ? ' · one-off' : ` · ${investment.frequency} · debit ${formatDate(investment.debitDate)}`}
              </p>
            </div>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: investment.id,
                    name: investment.name,
                    type: investment.type,
                    amount: paiseToInput(investment.amountPaise),
                    startDate: investment.startDate,
                    debitDate: investment.debitDate,
                    frequency: investment.frequency,
                    paymentMethod: investment.paymentMethod,
                    notes: investment.notes,
                    active: investment.active,
                  })
                }
                className="min-h-[44px] px-2 text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
              {!investment.oneTime ? (
                <button
                  type="button"
                  onClick={() =>
                    void updateInvestmentTemplate(investment.id, {
                      name: investment.name,
                      type: investment.type,
                      amountPaise: investment.amountPaise,
                      startDate: investment.startDate,
                      debitDate: investment.debitDate,
                      frequency: investment.frequency,
                      paymentMethod: investment.paymentMethod,
                      notes: investment.notes,
                      active: !investment.active,
                    })
                  }
                  className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:underline"
                >
                  {investment.active ? 'Pause' : 'Resume'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm(
                    'Delete investment?',
                    `Delete ${investment.name}? Upcoming occurrences are removed. Completed investments stay in History.`,
                    { confirmLabel: 'Delete', danger: true },
                  )
                  if (ok) await deleteInvestmentTemplate(investment.id)
                }}
                className="min-h-[44px] px-2 text-xs font-medium text-rose-500 hover:underline"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
        {investments.length === 0 ? <EmptyState title="No investments yet" hint="Add one with the + button → Investment" /> : null}
      </Card>

      <Overlay open={draft !== null} onClose={() => setDraft(null)} title="Edit investment">
        {draft ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <Field label="Name">
              <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Type">
              <Select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as InvestmentKind })}>
                {INVESTMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (₹)">
              <TextInput inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start date">
                <TextInput type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
              </Field>
              <Field label="Debit date">
                <TextInput type="date" value={draft.debitDate} onChange={(event) => setDraft({ ...draft, debitDate: event.target.value })} />
              </Field>
            </div>
            <Field label="Frequency">
              <Select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Frequency })}>
                {FREQUENCIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field label="How is it paid?">
              <Segmented
                options={[
                  { value: 'Autopay', label: 'Autopay' },
                  { value: 'Self Transaction', label: 'Self' },
                ]}
                value={draft.paymentMethod}
                onChange={(value) => setDraft({ ...draft, paymentMethod: value as InvestmentPay })}
              />
            </Field>
            <Field label="Notes (optional)">
              <TextArea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </Field>
            <Field label="Status">
              <Segmented
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                ]}
                value={draft.active ? 'active' : 'paused'}
                onChange={(value) => setDraft({ ...draft, active: value === 'active' })}
              />
            </Field>
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">Save changes</Button>
          </form>
        ) : null}
      </Overlay>
    </>
  )
}

function BudgetsSection() {
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray(), []) ?? []
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const month = new Date().toISOString().slice(0, 7)
  const tops = categories.filter((category) => !category.parentId)
  return (
    <>
      <SectionHeader title="Category budgets" />
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Select a category</option>
              {tops.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly budget (₹)">
            <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </Field>
          <div className="flex items-end">
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true)
                  setError(null)
                  if (!categoryId) throw new Error('Pick a category.')
                  await upsertBudget(categoryId, month, rupeesToPaise(amount))
                  setAmount('')
                } catch (err) {
                  setError(errorMessage(err))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Set budget
            </Button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {budgets.length > 0 ? (
          <div className="mt-4">
            {budgets
              .filter((budget) => budget.month === month)
              .map((budget) => (
                <div key={budget.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
                  <span>{categories.find((category) => category.id === budget.categoryId)?.name ?? 'Category'}</span>
                  <span className="font-semibold">{formatINR(budget.amountPaise)} / month</span>
                </div>
              ))}
          </div>
        ) : null}
      </Card>
    </>
  )
}

function GoogleSheetsSection({ confirm }: { confirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean> }) {
  const lastSynced = useLiveQuery(() => getSetting('sheetsSyncedAt'), []) ?? null
  const [scriptUrl, setScriptUrl] = useState(DEFAULT_SHEETS_URL)
  const [auto, setAuto] = useState('on')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setScriptUrl((await getSetting('sheetsScriptUrl')) ?? DEFAULT_SHEETS_URL)
      setAuto((await getSetting('sheetsAutoSync')) ?? 'on')
    })()
  }, [])

  async function sync() {
    try {
      setBusy(true)
      setStatus(null)
      await setSetting('sheetsScriptUrl', scriptUrl.trim())
      setStatus(await syncNow())
    } catch (err) {
      setStatus(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    const ok = await confirm(
      'Refresh from sheet?',
      'Replace the data on this device with the latest data from the spreadsheet. Use this after editing the sheet directly or moving devices.',
      { confirmLabel: 'Refresh' },
    )
    if (!ok) return
    try {
      setBusy(true)
      setStatus(null)
      await setSetting('sheetsScriptUrl', scriptUrl.trim())
      await loadFromGoogle()
      setStatus('Refreshed from Google Sheets ✓')
    } catch (err) {
      setStatus(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader title="Google Sheets sync" />
      <Card className="p-4">
        <Field label="Script web app URL">
          <TextInput
            value={scriptUrl}
            onChange={(event) => setScriptUrl(event.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
          />
        </Field>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Your Apps Script web app is already connected. If you deploy a new one, paste its /exec URL here. The app keeps
          the sheet updated by itself every minute — Sync now pushes immediately, Refresh pulls the sheet's data back to
          this device.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void sync()}>
              <RefreshCw size={16} /> Sync now
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
              <RotateCcw size={16} /> Refresh from sheet
            </Button>
          </div>
          <Segmented
            options={[
              { value: 'on', label: 'Auto-sync' },
              { value: 'off', label: 'Off' },
            ]}
            value={auto}
            onChange={(value) => {
              setAuto(value)
              void setSetting('sheetsAutoSync', value)
            }}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Sync now sends your data to the sheet; on a fresh device with no data it restores from the sheet instead.
          Last sync: {lastSynced ? new Date(lastSynced).toLocaleString() : 'never'}
        </p>
        {status ? <p className="mt-3 text-sm font-medium text-accent">{status}</p> : null}
      </Card>
    </>
  )
}

function DataSection() {
  const lastBackup = useLiveQuery(() => lastBackupAt(), []) ?? null
  const excelInput = useRef<HTMLInputElement | null>(null)
  const jsonInput = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function run(label: string, action: () => Promise<void>) {
    try {
      setBusy(true)
      setStatus(null)
      await action()
      setStatus(`${label} done ✓`)
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      setStatus(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    void run('CSV export', async () => {
      const transactions = await db.transactions.orderBy('date').toArray()
      const header = 'date,type,amount_rupees,category,subcategory,payment_mode,description'
      const lines = transactions.map((tx) =>
        [
          tx.date,
          tx.type,
          paiseToInput(tx.amountPaise),
          tx.categoryName ?? '',
          tx.subcategoryName ?? '',
          tx.paymentMode ?? '',
          tx.description.replace(/"/g, "'"),
        ]
          .map((cell) => `"${cell}"`)
          .join(','),
      )
      downloadText([header, ...lines].join('\n'), 'myfinance-transactions.csv', 'text/csv')
    })
  }

  async function restoreJson(file: File) {
    const text = await file.text()
    const snapshot = JSON.parse(text) as AppSnapshot
    await replaceAll(snapshot)
  }

  return (
    <>
      <SectionHeader title="Data" />
      <Card className="p-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          IndexedDB is the live database. MyFinance.xlsx is the backup file a future Drive sync will upload and download.
          Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void run('Excel backup', exportWorkbook)}>
            <Download size={16} /> Download MyFinance.xlsx
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => excelInput.current?.click()}>
            <Upload size={16} /> Restore from Excel
          </Button>
          <Button variant="outline" disabled={busy} onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run('JSON backup', async () => {
              const snapshot = await exportSnapshot()
              downloadText(JSON.stringify(snapshot, null, 2), 'myfinance-backup.json', 'application/json')
            })}
          >
            <Download size={16} /> Download JSON backup
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => jsonInput.current?.click()}>
            <Upload size={16} /> Restore JSON
          </Button>
        </div>
        <input
          ref={excelInput}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void run('Excel restore', () => importWorkbook(file))
            event.target.value = ''
          }}
        />
        <input
          ref={jsonInput}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void run('JSON restore', () => restoreJson(file))
            event.target.value = ''
          }}
        />
        {status ? <p className="mt-3 text-sm font-medium text-accent">{status}</p> : null}
      </Card>
    </>
  )
}
