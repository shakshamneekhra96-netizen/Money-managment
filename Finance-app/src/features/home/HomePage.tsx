import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { ArrowDownLeft, Check, ChevronRight, TrendingUp, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { CategoryIconView } from '../../components/icons'
import { Button, Card, EmptyState, Field, Overlay, SectionHeader, Segmented, StatTile, TextInput, useConfirm } from '../../components/ui'
import { useDateFormat, useProfile } from '../../app/hooks'
import { cx, errorMessage } from '../../app/utils'
import { db, getSetting, setSetting } from '../../db/db'
import { completeInvestmentOccurrence, markIncomeReceived, payBill, skipBill, skipInvestmentOccurrence } from '../../db/repos'
import { financialPeriod, todayISO } from '../../domain/dates'
import { khataInsight, summarize, weekKey } from '../../domain/engine'
import { formatINR, paiseToInput, rupeesToPaise } from '../../domain/money'
import { displayStatus } from '../../domain/recurrence'
import type { Investment, InvestmentOccurrence, RecurringBill, Section, Transaction } from '../../domain/types'

interface CompleteDialogState {
  occurrence: InvestmentOccurrence
  investment: Investment
  date: string
  amount: string
  error: string | null
}

interface PayBillState {
  bill: RecurringBill
  date: string
  amount: string
  paymentMode: string
  section: Section
  error: string | null
}

type TrendKind = 'daily' | 'weekly' | 'monthly' | 'yearly'

export function HomePage() {
  const profile = useProfile()
  const formatDate = useDateFormat()
  const { confirm, confirmNode } = useConfirm()
  const period = useMemo(() => financialPeriod(new Date(), profile.monthStartDay), [profile.monthStartDay])

  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const iconByName = useMemo(
    () => new Map(categories.map((category) => [category.name, category.icon])),
    [categories],
  )
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const khata = useLiveQuery(() => db.khataTransactions.toArray(), []) ?? []
  const investments = useLiveQuery(() => db.investments.toArray(), []) ?? []
  const occurrences = useLiveQuery(() => db.investmentOccurrences.toArray(), []) ?? []
  const incomeTemplates = useLiveQuery(() => db.recurringIncome.toArray(), []) ?? []
  const pendingIncome = useLiveQuery(() => db.incomeOccurrences.where('status').equals('pending').toArray(), []) ?? []
  const snoozedUntil = useLiveQuery(() => getSetting('salarySnooze'), []) ?? null
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray(), []) ?? []
  const [trendKind, setTrendKind] = useState<TrendKind>('monthly')

  const summary = useMemo(() => summarize(transactions, period.start, period.end), [transactions, period])
  const khataTotals = useMemo(() => khataInsight(people, khata), [people, khata])

  const salaryDue = useMemo(() => {
    const today = todayISO()
    if (snoozedUntil === today) return null
    const due = pendingIncome
      .filter((occurrence) => occurrence.scheduledDate <= today)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
    if (!due) return null
    const template = incomeTemplates.find((item) => item.id === due.recurringIncomeId)
    return template ? { occurrence: due, template } : null
  }, [pendingIncome, incomeTemplates, snoozedUntil])

  const personalRows = useMemo(
    () => transactions.filter((tx) => tx.type === 'PERSONAL_EXPENSE' && tx.date >= period.start && tx.date <= period.end)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [transactions, period],
  )
  const homeRows = useMemo(
    () => transactions.filter((tx) => tx.type === 'HOME_EXPENSE' && tx.date >= period.start && tx.date <= period.end)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [transactions, period],
  )

  const dueBills = useMemo(
    () => bills
      .filter((bill) => !bill.archived && bill.lastActionCycle !== period.label)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [bills, period],
  )

  const monthNow = todayISO().slice(0, 7)
  const budgetRows = useMemo(
    () => budgets
      .filter((budget) => budget.month === monthNow)
      .map((budget) => {
        const category = categories.find((item) => item.id === budget.categoryId)
        const spent = transactions
          .filter((tx) => (tx.type === 'PERSONAL_EXPENSE' || tx.type === 'HOME_EXPENSE') && tx.date.slice(0, 7) === monthNow)
          .filter((tx) => tx.categoryId === budget.categoryId || tx.subcategoryId === budget.categoryId)
          .reduce((sum, tx) => sum + tx.amountPaise, 0)
        const pct = budget.amountPaise > 0 ? Math.round((spent / budget.amountPaise) * 100) : 0
        return { budget, name: category?.name ?? 'Category', icon: category?.icon ?? 'MoreHorizontal', color: category?.color ?? '#3b82f6', spent, pct }
      }),
    [budgets, categories, transactions, monthNow],
  )

  const trendData = useMemo(() => {
    const keyOf = (date: string) =>
      trendKind === 'daily'
        ? format(parseISO(date), 'dd MMM')
        : trendKind === 'weekly'
          ? weekKey(date)
          : trendKind === 'monthly'
            ? date.slice(0, 7)
            : date.slice(0, 4)
    const map = new Map<string, { firstDate: string; expense: number; sent: number; received: number }>()
    const bucketOf = (key: string, date: string) => {
      const found = map.get(key)
      if (found) return found
      const fresh = { firstDate: date, expense: 0, sent: 0, received: 0 }
      map.set(key, fresh)
      return fresh
    }
    for (const tx of transactions) {
      if (tx.type !== 'PERSONAL_EXPENSE' && tx.type !== 'HOME_EXPENSE') continue
      bucketOf(keyOf(tx.date), tx.date).expense += tx.amountPaise
    }
    for (const entry of khata) {
      if (entry.type === 'KHATA_OPENING_BALANCE') continue
      const bucket = bucketOf(keyOf(entry.date), entry.date)
      if (entry.type === 'KHATA_GIVEN') bucket.sent += entry.amountPaise
      else bucket.received += entry.amountPaise
    }
    return [...map.entries()]
      .map(([name, totals]) => ({
        name,
        firstDate: totals.firstDate,
        expense: Math.round(totals.expense) / 100,
        sent: Math.round(totals.sent) / 100,
        received: Math.round(totals.received) / 100,
      }))
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate))
      .slice(-12)
  }, [trendKind, transactions, khata])

  const kindCards = useMemo(() => {
    const kinds = new Map<string, { investedPaise: number; pending: number; completed: number; skipped: number; overdue: number }>()
    for (const investment of investments) {
      const current = kinds.get(investment.type) ?? { investedPaise: 0, pending: 0, completed: 0, skipped: 0, overdue: 0 }
      kinds.set(investment.type, current)
    }
    const today = todayISO()
    for (const occurrence of occurrences) {
      const investment = investments.find((item) => item.id === occurrence.investmentId)
      if (!investment) continue
      const entry = kinds.get(investment.type)
      if (!entry) continue
      if (occurrence.status === 'completed') {
        entry.completed += 1
        const tx = transactions.find((item) => item.id === occurrence.transactionId)
        entry.investedPaise += occurrence.actualAmountPaise ?? tx?.amountPaise ?? 0
      } else if (occurrence.status === 'skipped') {
        entry.skipped += 1
      } else if (occurrence.scheduledDate < today) {
        entry.overdue += 1
      } else {
        entry.pending += 1
      }
    }
    return [...kinds.entries()]
      .map(([kind, entry]) => ({ kind, ...entry }))
      .sort((a, b) => b.investedPaise - a.investedPaise)
  }, [investments, occurrences, transactions])

  const dueOccurrences = useMemo(() => {
    const today = todayISO()
    return occurrences
      .filter((occurrence) => occurrence.status === 'pending')
      .filter((occurrence) => occurrence.scheduledDate <= today || occurrence.scheduledDate <= period.end)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
      .slice(0, 6)
      .map((occurrence) => ({
        occurrence,
        investment: investments.find((item) => item.id === occurrence.investmentId),
      }))
      .filter((item): item is { occurrence: InvestmentOccurrence; investment: Investment } => Boolean(item.investment))
  }, [occurrences, investments, period])

  const [completeDialog, setCompleteDialog] = useState<CompleteDialogState | null>(null)
  const [payDialog, setPayDialog] = useState<PayBillState | null>(null)

  async function openComplete(occurrence: InvestmentOccurrence, investment: Investment) {
    setCompleteDialog({ occurrence, investment, date: occurrence.scheduledDate, amount: String(investment.amountPaise / 100), error: null })
  }

  async function submitComplete() {
    if (!completeDialog) return
    try {
      const amountPaise = rupeesToPaise(completeDialog.amount)
      await completeInvestmentOccurrence(completeDialog.occurrence.id, completeDialog.date, amountPaise)
      setCompleteDialog(null)
    } catch (err) {
      setCompleteDialog({ ...completeDialog, error: errorMessage(err) })
    }
  }

  async function onSkip(occurrence: InvestmentOccurrence, investment: Investment) {
    const ok = await confirm('Skip occurrence?', `Skip the ${formatDate(occurrence.scheduledDate)} ${investment.name} instalment? Skipping does not change invested totals.`, {
      confirmLabel: 'Skip',
    })
    if (!ok) return
    try {
      await skipInvestmentOccurrence(occurrence.id)
    } catch (err) {
      await confirm('Cannot skip', errorMessage(err), { confirmLabel: 'OK' })
    }
  }

  async function onSalaryReceived() {
    if (!salaryDue) return
    try {
      await markIncomeReceived(salaryDue.occurrence.id, todayISO(), salaryDue.template.expectedAmountPaise)
    } catch (err) {
      await confirm('Cannot mark received', errorMessage(err), { confirmLabel: 'OK' })
    }
  }

  function openPayBill(bill: RecurringBill) {
    setPayDialog({ bill, date: todayISO(), amount: paiseToInput(bill.amountPaise), paymentMode: profile.defaultPaymentMethod, section: bill.section ?? 'home', error: null })
  }

  async function submitPayBill() {
    if (!payDialog) return
    try {
      await payBill(payDialog.bill.id, period.label, {
        date: payDialog.date,
        amountPaise: rupeesToPaise(payDialog.amount),
        paymentMode: payDialog.paymentMode.trim() || null,
        section: payDialog.section,
      })
      setPayDialog(null)
    } catch (err) {
      setPayDialog({ ...payDialog, error: errorMessage(err) })
    }
  }

  async function onSkipBill(bill: RecurringBill) {
    const ok = await confirm('Skip bill?', `Skip ${bill.name} (${formatINR(bill.amountPaise)}) for ${period.label}? Skipping only hides it for this cycle.`, {
      confirmLabel: 'Skip',
    })
    if (!ok) return
    try {
      await skipBill(bill.id, period.label)
    } catch (err) {
      await confirm('Cannot skip', errorMessage(err), { confirmLabel: 'OK' })
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-navy dark:text-white">Hi {profile.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{period.label} cycle · {formatDate(period.start)} – {formatDate(period.end)}</p>
        </div>
      </div>

      <div className="animate-fade-up mt-4 overflow-hidden rounded-2xl bg-[#1B365D] shadow-md">
        <div className="p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-200/90">Available balance · {period.label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{formatINR(summary.availablePaise)}</p>
          <p className="mt-1 text-xs text-sky-100/80">Income − expenses − completed investments</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <HeroChip label="Home" value={formatINR(summary.homePaise)} color="#60C1E5" />
            <HeroChip label="Personal" value={formatINR(summary.personalPaise)} color="#A0E0EF" />
            <HeroChip label="Income" value={formatINR(summary.incomePaise)} color="#6EE7B7" />
            <HeroChip label="Invested" value={formatINR(summary.investmentPaise)} color="#7DD3FC" />
          </div>
        </div>
        <div className="h-1.5 bg-[#60C1E5]/80" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label="Recoverable" value={formatINR(khataTotals.recoverablePaise)} hint="Khata owed to you" tone="positive" />
        <StatTile label="Payable" value={formatINR(khataTotals.payablePaise)} hint="Khata you owe" tone="negative" />
      </div>

      {salaryDue ? (
        <Card className="mt-4 border-accent/40 bg-accent-soft/60 p-4 dark:bg-slate-800">
          <p className="font-semibold text-navy dark:text-white">Has your salary arrived?</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {salaryDue.template.name} of {formatINR(salaryDue.template.expectedAmountPaise)} expected on {formatDate(salaryDue.occurrence.scheduledDate)}.
          </p>
          <div className="mt-3 flex gap-3">
            <Button onClick={() => void onSalaryReceived()}>
              <Check size={16} /> Yes, Received
            </Button>
            <Button variant="outline" onClick={() => void setSetting('salarySnooze', todayISO())}>
              <X size={16} /> Not Yet Received
            </Button>
          </div>
        </Card>
      ) : null}

      {bills.some((bill) => !bill.archived) ? (
        <>
          <SectionHeader title="Bills due" />
          <Card className="p-2">
            {dueBills.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
                All bills handled for {period.label} ✓
              </p>
            ) : (
              dueBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink dark:text-slate-100">{bill.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{formatINR(bill.amountPaise)}</span>
                      {' '}· due day {bill.dayOfMonth} · {bill.section === 'personal' ? 'Personal' : 'Home'} · {period.label}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button onClick={() => openPayBill(bill)}>
                      <Check size={14} /> Pay
                    </Button>
                    <Button variant="outline" onClick={() => void onSkipBill(bill)}>
                      <X size={14} /> Skip
                    </Button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      ) : null}

      <SectionHeader
        title="Personal"
        action={
          <Link to="/history" className="flex items-center text-sm text-accent hover:underline">
            See all <ChevronRight size={16} />
          </Link>
        }
      />
      <Card className="p-2">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Spent this cycle</p>
          <p className="font-semibold text-sky-600 dark:text-sky-300">{formatINR(summary.personalPaise)}</p>
        </div>
        {personalRows.slice(0, 5).map((tx) => (
          <TransactionRow key={tx.id} tx={tx} formatDate={formatDate} iconByName={iconByName} />
        ))}
        {personalRows.length === 0 ? <EmptyState title="No personal expenses yet" hint="Tap + to add one" /> : null}
      </Card>

      <SectionHeader
        title="Home"
        action={
          <Link to="/history" className="flex items-center text-sm text-accent hover:underline">
            See all <ChevronRight size={16} />
          </Link>
        }
      />
      <Card className="p-2">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Spent this cycle</p>
          <p className="font-semibold text-blue-700 dark:text-blue-300">{formatINR(summary.homePaise)}</p>
        </div>
        {homeRows.slice(0, 5).map((tx) => (
          <TransactionRow key={tx.id} tx={tx} formatDate={formatDate} iconByName={iconByName} />
        ))}
        {homeRows.length === 0 ? <EmptyState title="No home expenses yet" hint="Tap + to add one" /> : null}
      </Card>

      <SectionHeader title={`Budgets · ${period.label}`} />
      {budgetRows.length === 0 ? (
        <Card className="p-4">
          <EmptyState title="No budgets set for this month" hint="Add category budgets in Settings → Category budgets" />
        </Card>
      ) : (
        <Card className="p-4">
          {budgetRows.map((row) => {
            const over = row.spent > row.budget.amountPaise
            const barColor = over ? '#e11d48' : row.pct > 90 ? '#f43f5e' : row.pct > 60 ? '#f59e0b' : '#10b981'
            return (
              <div key={row.budget.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink dark:text-slate-100">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${row.color}22`, color: row.color }}>
                      <CategoryIconView name={row.icon} className="h-4 w-4" />
                    </span>
                    <span className="truncate">{row.name}</span>
                    {over ? (
                      <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                        Over budget
                      </span>
                    ) : null}
                  </span>
                  <span className={cx('shrink-0 font-semibold', over ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400')}>
                    {formatINR(row.spent)} / {formatINR(row.budget.amountPaise)}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, row.pct)}%`, background: barColor }} />
                </div>
                <p className="mt-1 text-right text-[11px] text-slate-400">{row.pct}% of budget used</p>
              </div>
            )
          })}
        </Card>
      )}

      <SectionHeader title="Spending trend" />
      <Card className="p-4">
        <Segmented
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
          value={trendKind}
          onChange={(value) => setTrendKind(value as TrendKind)}
        />
        <div className="mt-4 h-64">
          {trendData.length === 0 ? (
            <EmptyState title="Nothing to chart yet" hint="Add expenses or khata entries" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                <Legend />
                <Bar dataKey="expense" name="Expense" fill="#005A9C" radius={[6, 6, 0, 0]} />
                <Bar dataKey="sent" name="Khata sent" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="received" name="Khata received" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <SectionHeader title="Investments" />
      {kindCards.length === 0 ? (
        <Card>
          <EmptyState title="No investments yet" hint="Create a SIP or a one-off from the Add sheet" />
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {kindCards.map((card) => (
            <Card key={card.kind} className="min-w-[200px] flex-1 p-4">
              <div className="flex items-center gap-2">
                <span className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full bg-navy/10 text-navy dark:bg-slate-700 dark:text-slate-200">
                  <TrendingUp size={18} />
                </span>
                <p className="font-semibold text-ink dark:text-slate-100">{card.kind}</p>
              </div>
              <p className="mt-3 text-lg font-semibold text-navy dark:text-white">{formatINR(card.investedPaise)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Invested (completed)</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Count label="completed" value={card.completed} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
                <Count label="pending" value={card.pending} className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" />
                <Count label="skipped" value={card.skipped} className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" />
                <Count label="overdue" value={card.overdue} className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {dueOccurrences.length > 0 ? (
        <>
          <SectionHeader title="Due" />
          <Card className="p-2">
            {dueOccurrences.map(({ occurrence, investment }) => {
              const status = displayStatus(occurrence.status, occurrence.scheduledDate)
              return (
                <div key={occurrence.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-ink dark:text-slate-100">{investment.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(occurrence.scheduledDate)} · {formatINR(investment.amountPaise)} · {investment.paymentMethod}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        status === 'overdue'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                      )}
                    >
                      {status}
                    </span>
                    <Button variant="outline" onClick={() => void openComplete(occurrence, investment)}>
                      Complete
                    </Button>
                    <Button variant="ghost" onClick={() => void onSkip(occurrence, investment)}>
                      Skip
                    </Button>
                  </div>
                </div>
              )
            })}
          </Card>
        </>
      ) : null}

      <Overlay open={completeDialog !== null} onClose={() => setCompleteDialog(null)} title="Complete occurrence">
        {completeDialog ? (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {completeDialog.investment.name} · scheduled {formatDate(completeDialog.occurrence.scheduledDate)}
            </p>
            <Field label="Actual date">
              <TextInput
                type="date"
                value={completeDialog.date}
                onChange={(event) => setCompleteDialog({ ...completeDialog, date: event.target.value })}
              />
            </Field>
            <Field label="Actual amount (₹)">
              <TextInput
                inputMode="decimal"
                value={completeDialog.amount}
                onChange={(event) => setCompleteDialog({ ...completeDialog, amount: event.target.value })}
              />
            </Field>
            {completeDialog.error ? <p className="text-sm text-red-600 dark:text-red-400">{completeDialog.error}</p> : null}
            <Button onClick={() => void submitComplete()} className="w-full">
              <Check size={16} /> Mark completed
            </Button>
          </div>
        ) : null}
      </Overlay>

      <Overlay open={payDialog !== null} onClose={() => setPayDialog(null)} title="Pay bill">
        {payDialog ? (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {payDialog.bill.name} · {period.label} · counted as a {payDialog.section === 'personal' ? 'personal' : 'home'} expense under Bills
            </p>
            <Field label="Section">
              <Segmented
                options={[
                  { value: 'home', label: 'Home' },
                  { value: 'personal', label: 'Personal' },
                ]}
                value={payDialog.section}
                onChange={(value) => setPayDialog({ ...payDialog, section: value as Section })}
              />
            </Field>
            <Field label="Date">
              <TextInput
                type="date"
                value={payDialog.date}
                onChange={(event) => setPayDialog({ ...payDialog, date: event.target.value })}
              />
            </Field>
            <Field label="Amount (₹)">
              <TextInput
                inputMode="decimal"
                value={payDialog.amount}
                onChange={(event) => setPayDialog({ ...payDialog, amount: event.target.value })}
              />
            </Field>
            <Field label="Payment mode">
              <TextInput
                value={payDialog.paymentMode}
                onChange={(event) => setPayDialog({ ...payDialog, paymentMode: event.target.value })}
              />
            </Field>
            {payDialog.error ? <p className="text-sm text-red-600 dark:text-red-400">{payDialog.error}</p> : null}
            <Button onClick={() => void submitPayBill()} className="w-full">
              <Check size={16} /> Pay bill
            </Button>
          </div>
        ) : null}
      </Overlay>

      {confirmNode}
    </div>
  )
}

function HeroChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100/90">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-white">{value}</p>
    </div>
  )
}

function Count({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={cx('rounded-full px-2 py-0.5', className)}>
      {value} {label}
    </span>
  )
}

function TransactionRow({
  tx,
  formatDate,
  iconByName,
}: {
  tx: Transaction
  formatDate: (iso: string) => string
  iconByName: Map<string, string>
}) {
  const income = tx.type === 'INCOME'
  const iconName = tx.subcategoryName
    ? iconByName.get(tx.subcategoryName)
    : tx.categoryName
      ? iconByName.get(tx.categoryName)
      : undefined
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800">
      <span
        className={cx(
          'flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full',
          income ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        )}
      >
        {income ? <ArrowDownLeft size={16} /> : <CategoryIconView name={iconName} className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink dark:text-slate-100">{tx.subcategoryName || tx.categoryName || tx.description || tx.type}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(tx.date)}{tx.paymentMode ? ` · ${tx.paymentMode}` : ''}</p>
      </div>
      <p className={cx('text-sm font-semibold', income ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink dark:text-slate-100')}>
        {income ? '+' : '−'}{formatINR(tx.amountPaise)}
      </p>
    </div>
  )
}
