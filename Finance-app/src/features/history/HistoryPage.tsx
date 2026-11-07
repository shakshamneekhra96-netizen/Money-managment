import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { addMonths, endOfMonth, format, getDay, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { CategoryIconView } from '../../components/icons'
import { Button, Card, EmptyState, Field, Overlay, Segmented, Select, StatTile, TextInput, useConfirm } from '../../components/ui'
import { useDateFormat } from '../../app/hooks'
import { cx, errorMessage } from '../../app/utils'
import { db } from '../../db/db'
import { deleteTransaction, updateTransaction } from '../../db/repos'
import { toISODate } from '../../domain/dates'
import { categoryTotals, summarize, weekKey } from '../../domain/engine'
import { formatINR, paiseToInput, rupeesToPaise } from '../../domain/money'
import type { KhataTransaction, Transaction, TransactionType } from '../../domain/types'

type HistoryTab = 'all' | 'personal' | 'home' | 'investment' | 'income' | 'khata'
type ViewMode = 'list' | 'calendar' | 'charts'
type ChartKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'category' | 'income-vs-expense' | 'investment'

interface ChartPoint {
  name: string
  value?: number
  color?: string
  firstDate?: string
  expense?: number
  income?: number
  invested?: number
  sent?: number
  received?: number
}

interface EditTxState {
  tx: Transaction
  date: string
  amount: string
  description: string
  paymentMode: string
  categoryId: string
  subcategoryId: string
  error: string | null
}

interface Filters {
  search: string
  from: string
  to: string
  categoryId: string
  subcategoryId: string
  paymentMode: string
  type: string
  personId: string
  investmentId: string
  minAmount: string
  maxAmount: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  categoryId: '',
  subcategoryId: '',
  paymentMode: '',
  type: '',
  personId: '',
  investmentId: '',
  minAmount: '',
  maxAmount: '',
}

const TAB_TYPE: Partial<Record<HistoryTab, TransactionType>> = {
  personal: 'PERSONAL_EXPENSE',
  home: 'HOME_EXPENSE',
  investment: 'INVESTMENT',
  income: 'INCOME',
}

export function HistoryPage() {
  const formatDate = useDateFormat()
  const { confirm, confirmNode } = useConfirm()
  const [tab, setTab] = useState<HistoryTab>('all')
  const [view, setView] = useState<ViewMode>('list')
  const [chartKind, setChartKind] = useState<ChartKind>('daily')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()))
  const [editDialog, setEditDialog] = useState<EditTxState | null>(null)

  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const investments = useLiveQuery(() => db.investments.toArray(), []) ?? []
  const khataEntries = useLiveQuery(() => db.khataTransactions.toArray(), []) ?? []
  const paymentModes = useMemo(
    () => [...new Set([...transactions.map((tx) => tx.paymentMode), ...khataEntries.map((entry) => entry.paymentMode)])].filter((mode): mode is string => Boolean(mode)),
    [transactions, khataEntries],
  )

  const minPaise = filters.minAmount.trim() ? safePaise(filters.minAmount) : null
  const maxPaise = filters.maxAmount.trim() ? safePaise(filters.maxAmount) : null

  const filteredTransactions = useMemo(() => {
    let rows = transactions
    const tabType = TAB_TYPE[tab]
    if (tabType) rows = rows.filter((tx) => tx.type === tabType)
    if (tab === 'all' && filters.type) rows = rows.filter((tx) => tx.type === filters.type)
    const search = filters.search.trim().toLowerCase()
    if (search) {
      rows = rows.filter((tx) =>
        [tx.description, tx.categoryName, tx.subcategoryName, tx.paymentMode, tx.type]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search)),
      )
    }
    if (filters.from) rows = rows.filter((tx) => tx.date >= filters.from)
    if (filters.to) rows = rows.filter((tx) => tx.date <= filters.to)
    if (filters.categoryId) rows = rows.filter((tx) => tx.categoryId === filters.categoryId || tx.subcategoryId === filters.categoryId)
    if (filters.subcategoryId) rows = rows.filter((tx) => tx.subcategoryId === filters.subcategoryId)
    if (filters.paymentMode) rows = rows.filter((tx) => tx.paymentMode === filters.paymentMode)
    if (filters.investmentId) rows = rows.filter((tx) => tx.investmentId === filters.investmentId)
    if (minPaise !== null) rows = rows.filter((tx) => tx.amountPaise >= minPaise)
    if (maxPaise !== null) rows = rows.filter((tx) => tx.amountPaise <= maxPaise)
    return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [transactions, tab, filters, minPaise, maxPaise])

  const filteredKhata = useMemo(() => {
    let rows = khataEntries
    const search = filters.search.trim().toLowerCase()
    if (search) {
      rows = rows.filter((entry) => {
        const person = people.find((item) => item.id === entry.personId)
        return [entry.description, person?.name, entry.type]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search))
      })
    }
    if (filters.personId) rows = rows.filter((entry) => entry.personId === filters.personId)
    if (filters.from) rows = rows.filter((entry) => entry.date >= filters.from)
    if (filters.to) rows = rows.filter((entry) => entry.date <= filters.to)
    if (filters.paymentMode) rows = rows.filter((entry) => entry.paymentMode === filters.paymentMode)
    if (minPaise !== null) rows = rows.filter((entry) => entry.amountPaise >= minPaise)
    if (maxPaise !== null) rows = rows.filter((entry) => entry.amountPaise <= maxPaise)
    return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [khataEntries, people, filters, minPaise, maxPaise])

  const listTotals = useMemo(() => {
    if (tab === 'khata') {
      const given = filteredKhata.filter((entry) => entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them')).reduce((sum, entry) => sum + entry.amountPaise, 0)
      const received = filteredKhata.filter((entry) => entry.type === 'KHATA_RECEIVED' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection === 'i_owe_them')).reduce((sum, entry) => sum + entry.amountPaise, 0)
      return { given, received, expensePaise: 0, incomePaise: 0, investmentPaise: 0 }
    }
    if (filteredTransactions.length === 0) return null
    const first = filteredTransactions[filteredTransactions.length - 1].date
    const last = filteredTransactions[0].date
    const summary = summarize(filteredTransactions, first, last)
    return {
      given: 0,
      received: 0,
      expensePaise: summary.personalPaise + summary.homePaise,
      incomePaise: summary.incomePaise,
      investmentPaise: summary.investmentPaise,
    }
  }, [tab, filteredTransactions, filteredKhata])

  const dayTotals = useMemo(() => {
    const map = new Map<string, { expense: number; income: number; investment: number }>()
    if (tab === 'khata') {
      for (const entry of filteredKhata) {
        const bucket = map.get(entry.date) ?? { expense: 0, income: 0, investment: 0 }
        const given = entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them')
        if (given) bucket.expense += entry.amountPaise / 100
        else bucket.income += entry.amountPaise / 100
        map.set(entry.date, bucket)
      }
    } else {
      for (const tx of filteredTransactions) {
        const bucket = map.get(tx.date) ?? { expense: 0, income: 0, investment: 0 }
        if (tx.type === 'INCOME') bucket.income += tx.amountPaise / 100
        else if (tx.type === 'INVESTMENT') bucket.investment += tx.amountPaise / 100
        else bucket.expense += tx.amountPaise / 100
        map.set(tx.date, bucket)
      }
    }
    return map
  }, [tab, filteredTransactions, filteredKhata])

  const chartData: ChartPoint[] = useMemo(() => {
    const toR = (paise: number) => Math.round(paise) / 100
    if (chartKind === 'category') {
      return categoryTotals(filteredTransactions, categories).map((total) => ({
        name: total.name,
        value: toR(total.amountPaise),
        color: total.color,
      }))
    }
    const isInvestmentChart = chartKind === 'investment'
    const isKhataSeries = chartKind === 'daily' || chartKind === 'weekly' || chartKind === 'monthly' || chartKind === 'yearly'
    const keyOf = (date: string) =>
      chartKind === 'daily'
        ? format(parseISO(date), 'dd MMM')
        : chartKind === 'weekly'
          ? weekKey(date)
          : chartKind === 'yearly'
            ? date.slice(0, 4)
            : date.slice(0, 7)
    const map = new Map<string, { firstDate: string; expense: number; income: number; invested: number; sent: number; received: number }>()
    const bucketOf = (key: string, date: string) => {
      const found = map.get(key)
      if (found) return found
      const fresh = { firstDate: date, expense: 0, income: 0, invested: 0, sent: 0, received: 0 }
      map.set(key, fresh)
      return fresh
    }
    for (const tx of filteredTransactions) {
      if (isInvestmentChart && tx.type !== 'INVESTMENT') continue
      const bucket = bucketOf(keyOf(tx.date), tx.date)
      if (tx.type === 'INCOME') bucket.income += toR(tx.amountPaise)
      else if (tx.type === 'INVESTMENT') bucket.invested += toR(tx.amountPaise)
      else bucket.expense += toR(tx.amountPaise)
    }
    if (isKhataSeries) {
      for (const entry of filteredKhata) {
        if (entry.type === 'KHATA_OPENING_BALANCE') continue
        const bucket = bucketOf(keyOf(entry.date), entry.date)
        if (entry.type === 'KHATA_GIVEN') bucket.sent += toR(entry.amountPaise)
        else bucket.received += toR(entry.amountPaise)
      }
    }
    return [...map.entries()]
      .map(([name, bucket]) => ({
        name,
        firstDate: bucket.firstDate,
        expense: bucket.expense,
        income: bucket.income,
        invested: bucket.invested,
        sent: bucket.sent,
        received: bucket.received,
      }))
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate))
  }, [chartKind, filteredTransactions, categories, filteredKhata])

  async function onDeleteTx(tx: Transaction) {
    const ok = await confirm('Delete transaction?', `${tx.description || tx.categoryName || tx.type} · ${formatINR(tx.amountPaise)}. This cannot be undone.`, {
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTransaction(tx.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await confirm('Cannot delete', message, { confirmLabel: 'OK' })
    }
  }

  function onEditTx(tx: Transaction) {
    setEditDialog({
      tx,
      date: tx.date,
      amount: paiseToInput(tx.amountPaise),
      description: tx.description,
      paymentMode: tx.paymentMode ?? '',
      categoryId: tx.categoryId ?? '',
      subcategoryId: tx.subcategoryId ?? '',
      error: null,
    })
  }

  async function submitEditTx() {
    if (!editDialog) return
    try {
      const isExpense = editDialog.tx.type === 'PERSONAL_EXPENSE' || editDialog.tx.type === 'HOME_EXPENSE'
      await updateTransaction(editDialog.tx.id, {
        date: editDialog.date,
        amountPaise: rupeesToPaise(editDialog.amount),
        description: editDialog.description.trim(),
        paymentMode: editDialog.paymentMode.trim() || null,
        ...(isExpense
          ? { categoryId: editDialog.categoryId || null, subcategoryId: editDialog.subcategoryId || null }
          : {}),
      })
      setEditDialog(null)
    } catch (err) {
      setEditDialog({ ...editDialog, error: errorMessage(err) })
    }
  }

  const activeFilterCount = useMemo(
    () =>
      Object.entries(EMPTY_FILTERS).filter(([key, value]) => {
        if (key === 'search') return false
        return String(filters[key as keyof Filters]) !== String(value)
      }).length,
    [filters],
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-navy dark:text-white">History</h1>

      <div className="mt-3">
        <Segmented
          options={[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Personal' },
            { value: 'home', label: 'Home' },
            { value: 'investment', label: 'Investment' },
            { value: 'income', label: 'Income' },
            { value: 'khata', label: 'Khata' },
          ]}
          value={tab}
          onChange={(value) => setTab(value as HistoryTab)}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            placeholder="Search…"
            className="pl-9"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
      </div>

      <div className="mt-3">
        <Segmented
          options={[
            { value: 'list', label: 'List' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'charts', label: 'Charts' },
          ]}
          value={view}
          onChange={(value) => setView(value as ViewMode)}
        />
      </div>

      {tab !== 'khata' && listTotals ? (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Expense" value={formatINR(listTotals.expensePaise)} />
          <StatTile label="Income" value={formatINR(listTotals.incomePaise)} tone="positive" />
          <StatTile label="Invested" value={formatINR(listTotals.investmentPaise)} />
          <StatTile label="Records" value={String(filteredTransactions.length)} />
        </div>
      ) : null}
      {tab === 'khata' && listTotals ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatTile label="Given" value={formatINR(listTotals.given)} />
          <StatTile label="Received" value={formatINR(listTotals.received)} tone="positive" />
          <StatTile label="Entries" value={String(filteredKhata.length)} />
        </div>
      ) : null}

      {view === 'list' ? (
        tab === 'khata' ? (
          <Card className="mt-4 p-2">
            {filteredKhata.map((entry) => (
              <KhataRow key={entry.id} entry={entry} people={people} formatDate={formatDate} />
            ))}
            {filteredKhata.length === 0 ? <EmptyState title="Nothing matches" hint="Try clearing filters" /> : null}
          </Card>
        ) : (
          <TxList rows={filteredTransactions} categories={categories} formatDate={formatDate} onDelete={onDeleteTx} onEdit={onEditTx} />
        )
      ) : null}

      {view === 'calendar' ? (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setCalMonth(addMonths(calMonth, -1))} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <p className="font-semibold text-ink dark:text-slate-100">{format(calMonth, 'MMMM yyyy')}</p>
            <Button variant="ghost" onClick={() => setCalMonth(addMonths(calMonth, 1))} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: getDay(startOfMonth(calMonth)) }).map((_, index) => (
              <span key={`pad-${index}`} />
            ))}
            {Array.from({ length: endOfMonth(calMonth).getDate() }, (_, index) => {
              const dayDate = new Date(calMonth.getFullYear(), calMonth.getMonth(), index + 1)
              const iso = toISODate(dayDate)
              const totals = dayTotals.get(iso)
              const isToday = isSameMonth(calMonth, new Date()) && iso === toISODate(new Date())
              const hasData = totals && (totals.expense > 0 || totals.income > 0 || totals.investment > 0)
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!hasData}
                  onClick={() => {
                    setFilters({ ...filters, from: iso, to: iso })
                    setView('list')
                  }}
                  className={cx(
                    'flex min-h-[52px] flex-col items-center justify-center rounded-lg border p-1 text-xs transition-colors',
                    hasData
                      ? 'cursor-pointer border-slate-200 hover:border-accent dark:border-slate-700'
                      : 'cursor-default border-transparent',
                    isToday && 'ring-2 ring-accent',
                  )}
                >
                  <span className={cx('font-medium', hasData ? 'text-ink dark:text-slate-100' : 'text-slate-400')}>
                    {index + 1}
                  </span>
                  {totals && totals.expense > 0 ? <span className="text-[10px] text-rose-500">-{totals.expense.toFixed(0)}</span> : null}
                  {totals && totals.income > 0 ? <span className="text-[10px] text-emerald-500">+{totals.income.toFixed(0)}</span> : null}
                  {totals && totals.investment > 0 ? <span className="text-[10px] text-blue-500">inv {totals.investment.toFixed(0)}</span> : null}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Tap a day to list it. Amounts in ₹.</p>
        </Card>
      ) : null}

      {view === 'charts' ? (
        tab === 'khata' ? (
          <EmptyState title="Charts cover expenses, income and investments" hint="Switch to a transaction tab to chart it" />
        ) : (
          <Card className="mt-4 p-4">
            <Segmented
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'category', label: 'Category' },
                { value: 'income-vs-expense', label: 'Income vs Expense' },
                { value: 'investment', label: 'Investment' },
              ]}
              value={chartKind}
              onChange={(value) => setChartKind(value as ChartKind)}
            />
            <div className="mt-4 h-72">
              {filteredTransactions.length === 0 ? (
                <EmptyState title="Nothing matches" hint="Try clearing filters" />
              ) : chartKind === 'category' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : chartKind === 'investment' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Bar dataKey="invested" name="Invested" fill="#60C1E5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : chartKind === 'income-vs-expense' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Legend />
                    <Bar dataKey="income" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#005A9C" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : chartKind === 'daily' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Legend />
                    <Line dataKey="expense" name="Expense" stroke="#005A9C" strokeWidth={2} dot={false} />
                    <Line dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Legend />
                    <Bar dataKey="expense" name="Expense" fill="#005A9C" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="sent" name="Khata sent" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="received" name="Khata received" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="invested" name="Invested" fill="#60C1E5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        )
      ) : null}

      <Overlay open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" wide>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setFiltersOpen(false) }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="From date">
              <TextInput type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
            </Field>
            <Field label="To date">
              <TextInput type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
            </Field>
          </div>
          {tab === 'khata' ? (
            <Field label="Person">
              <Select value={filters.personId} onChange={(event) => setFilters({ ...filters, personId: event.target.value })}>
                <option value="">Anyone</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Category">
                <Select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value, subcategoryId: '' })}>
                  <option value="">Any category</option>
                  {categories.filter((category) => !category.parentId).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select value={filters.subcategoryId} onChange={(event) => setFilters({ ...filters, subcategoryId: event.target.value })}>
                  <option value="">Any subcategory</option>
                  {categories.filter((category) => category.parentId === filters.categoryId).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Min amount (₹)">
              <TextInput inputMode="decimal" value={filters.minAmount} onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })} />
            </Field>
            <Field label="Max amount (₹)">
              <TextInput inputMode="decimal" value={filters.maxAmount} onChange={(event) => setFilters({ ...filters, maxAmount: event.target.value })} />
            </Field>
          </div>
          <Field label="Payment mode">
            <Select value={filters.paymentMode} onChange={(event) => setFilters({ ...filters, paymentMode: event.target.value })}>
              <option value="">Any mode</option>
              {paymentModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </Select>
          </Field>
          {tab === 'all' ? (
            <Field label="Type">
              <Select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
                <option value="">Any type</option>
                {['PERSONAL_EXPENSE', 'HOME_EXPENSE', 'INVESTMENT', 'INCOME'].map((type) => (
                  <option key={type} value={type}>{type.replace('_', ' ').toLowerCase()}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          {tab !== 'khata' && tab !== 'income' ? (
            <Field label="Investment">
              <Select value={filters.investmentId} onChange={(event) => setFilters({ ...filters, investmentId: event.target.value })}>
                <option value="">Any investment</option>
                {investments.map((investment) => (
                  <option key={investment.id} value={investment.id}>{investment.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => setFilters({ ...EMPTY_FILTERS, search: filters.search })}>
              Reset filters
            </Button>
            <Button type="submit" className="flex-1">Apply filters</Button>
          </div>
        </form>
      </Overlay>

      <Overlay open={editDialog !== null} onClose={() => setEditDialog(null)} title="Edit transaction">
        {editDialog ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submitEditTx()
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date">
                <TextInput type="date" value={editDialog.date} onChange={(event) => setEditDialog({ ...editDialog, date: event.target.value })} />
              </Field>
              <Field label="Amount (₹)">
                <TextInput inputMode="decimal" value={editDialog.amount} onChange={(event) => setEditDialog({ ...editDialog, amount: event.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <TextInput value={editDialog.description} onChange={(event) => setEditDialog({ ...editDialog, description: event.target.value })} />
            </Field>
            <Field label="Payment mode">
              <Select value={editDialog.paymentMode} onChange={(event) => setEditDialog({ ...editDialog, paymentMode: event.target.value })}>
                <option value="">Not set</option>
                {paymentModes.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </Select>
            </Field>
            {editDialog.tx.type === 'PERSONAL_EXPENSE' || editDialog.tx.type === 'HOME_EXPENSE' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Category">
                  <Select value={editDialog.categoryId} onChange={(event) => setEditDialog({ ...editDialog, categoryId: event.target.value, subcategoryId: '' })}>
                    <option value="">None</option>
                    {categories.filter((category) => !category.parentId).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Subcategory">
                  <Select value={editDialog.subcategoryId} onChange={(event) => setEditDialog({ ...editDialog, subcategoryId: event.target.value })}>
                    <option value="">None</option>
                    {categories.filter((category) => category.parentId === editDialog.categoryId).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
            {editDialog.error ? <p className="text-sm text-red-600 dark:text-red-400">{editDialog.error}</p> : null}
            <Button type="submit" className="w-full">Save changes</Button>
          </form>
        ) : null}
      </Overlay>

      {confirmNode}
    </div>
  )
}

function safePaise(input: string): number | null {
  try {
    return rupeesSafe(input)
  } catch {
    return null
  }
}

function rupeesSafe(input: string): number {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error('invalid')
  return Math.round(Number(trimmed) * 100)
}

function TxList({
  rows,
  categories,
  formatDate,
  onDelete,
  onEdit,
}: {
  rows: Transaction[]
  categories: { id: string; name: string; icon: string; color: string }[]
  formatDate: (iso: string) => string
  onDelete: (tx: Transaction) => void
  onEdit: (tx: Transaction) => void
}) {
  const iconByName = useMemo(() => new Map(categories.map((category) => [category.name, category.icon])), [categories])
  const colorByName = useMemo(() => new Map(categories.map((category) => [category.name, category.color])), [categories])
  const [visible, setVisible] = useState(60)
  const shown = useMemo(() => rows.slice(0, visible), [rows, visible])
  useEffect(() => {
    setVisible(60)
  }, [rows])
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of shown) {
      const list = map.get(tx.date) ?? []
      list.push(tx)
      map.set(tx.date, list)
    }
    return [...map.entries()]
  }, [shown])
  if (rows.length === 0) {
    return (
      <Card className="mt-4 p-2">
        <EmptyState title="Nothing matches" hint="Try clearing filters or add something with the + button" />
      </Card>
    )
  }
  return (
    <div className="mt-4 grid gap-4">
      {groups.map(([date, items]) => {
        const expense = items.filter((tx) => tx.type !== 'INCOME').reduce((sum, tx) => sum + tx.amountPaise, 0)
        const income = items.filter((tx) => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amountPaise, 0)
        return (
          <div key={date}>
            <div className="flex items-center justify-between px-1 py-1">
              <p className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {formatDate(date)}
              </p>
              <p className="flex items-center gap-2 text-xs font-semibold">
                {expense > 0 ? <span className="text-rose-500 dark:text-rose-400">−{formatINR(expense)}</span> : null}
                {income > 0 ? <span className="text-emerald-500 dark:text-emerald-400">+{formatINR(income)}</span> : null}
              </p>
            </div>
            <Card className="p-2">
              {items.map((tx) => {
                const income = tx.type === 'INCOME'
                const iconName = tx.subcategoryName ? iconByName.get(tx.subcategoryName) : tx.categoryName ? iconByName.get(tx.categoryName) : undefined
                return (
                  <div key={tx.id} className="group flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    <span
                      className={cx(
                        'flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110',
                        income && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      )}
                      style={income ? undefined : { background: `${colorByName.get(iconName ?? '') ?? '#94a3b8'}22`, color: colorByName.get(iconName ?? '') ?? '#64748b' }}
                    >
                      {income ? <span className="text-sm font-semibold">+</span> : <CategoryIconView name={iconName} className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink dark:text-slate-100">{tx.subcategoryName || tx.categoryName || tx.description || tx.type}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={cx(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                            tx.type === 'HOME_EXPENSE'
                              ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                              : tx.type === 'PERSONAL_EXPENSE'
                                ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300'
                                : tx.type === 'INVESTMENT'
                                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
                          )}
                        >
                          {tx.type.replace('_', ' ').toLowerCase()}
                        </span>
                        {tx.paymentMode ? ` · ${tx.paymentMode}` : ''}
                      </p>
                    </div>
                    <p className={cx('text-sm font-semibold', income ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink dark:text-slate-100')}>
                      {income ? '+' : '−'}{formatINR(tx.amountPaise)}
                    </p>
                    <button type="button" onClick={() => onEdit(tx)} className="min-h-[44px] min-w-[38px] text-xs font-medium text-accent hover:underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => onDelete(tx)} className="min-h-[44px] min-w-[44px] text-xs font-medium text-rose-500 hover:underline">
                      Delete
                    </button>
                  </div>
                )
              })}
            </Card>
          </div>
        )
      })}
      {rows.length > visible ? (
        <Button variant="outline" onClick={() => setVisible((count) => count + 60)}>
          Show more · {rows.length - visible} left
        </Button>
      ) : null}
    </div>
  )
}

function KhataRow({
  entry,
  people,
  formatDate,
}: {
  entry: KhataTransaction
  people: { id: string; name: string }[]
  formatDate: (iso: string) => string
}) {
  const person = people.find((item) => item.id === entry.personId)
  const given = entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them')
  const label = entry.type === 'KHATA_GIVEN' ? 'Sent to' : entry.type === 'KHATA_RECEIVED' ? 'Received from' : 'Opening balance'
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink dark:text-slate-100">{label} {person?.name ?? 'Unknown'}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(entry.date)}{entry.description ? ` · ${entry.description}` : ''}</p>
      </div>
      <p className={cx('text-sm font-semibold', given ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        {given ? '+' : '−'}{formatINR(entry.amountPaise)}
      </p>
    </div>
  )
}
