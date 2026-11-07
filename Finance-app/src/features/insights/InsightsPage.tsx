import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Card, EmptyState, SectionHeader, Segmented, StatTile } from '../../components/ui'
import { useDateFormat, useProfile } from '../../app/hooks'
import { cx } from '../../app/utils'
import { db } from '../../db/db'
import { financialPeriod, previousPeriod, type Period } from '../../domain/dates'
import { budgetUsage, categoryTotals, investmentByName, khataInsight, summarize } from '../../domain/engine'
import { formatINR } from '../../domain/money'

export function InsightsPage() {
  const profile = useProfile()
  const formatDate = useDateFormat()
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const khata = useLiveQuery(() => db.khataTransactions.toArray(), []) ?? []
  const investments = useLiveQuery(() => db.investments.toArray(), []) ?? []
  const occurrences = useLiveQuery(() => db.investmentOccurrences.toArray(), []) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray(), []) ?? []

  const period = useMemo(() => financialPeriod(new Date(), profile.monthStartDay), [profile.monthStartDay])

  const periods = useMemo(() => {
    const list: Period[] = [period]
    for (let index = 1; index < 12; index += 1) {
      list.push(previousPeriod(list[list.length - 1], profile.monthStartDay))
    }
    return list.reverse()
  }, [period, profile.monthStartDay])

  const [range, setRange] = useState<'3' | '6' | '12'>('6')
  const visiblePeriods = useMemo(() => periods.slice(-Number(range)), [periods, range])

  const monthlyOverview = useMemo(
    () =>
      visiblePeriods.map((item) => {
        const summary = summarize(transactions, item.start, item.end)
        return {
          name: item.label.split(' ')[0].slice(0, 3),
          income: Math.round(summary.incomePaise) / 100,
          expense: Math.round(summary.consumptionPaise) / 100,
          invested: Math.round(summary.investmentPaise) / 100,
        }
      }),
    [visiblePeriods, transactions],
  )

  const periodTx = useMemo(
    () => transactions.filter((tx) => tx.date >= period.start && tx.date <= period.end),
    [transactions, period],
  )
  const catTotals = useMemo(() => categoryTotals(periodTx, categories), [periodTx, categories])
  const invTotals = useMemo(() => investmentByName(transactions.filter((tx) => tx.type === 'INVESTMENT'), investments), [transactions, investments])
  const khataTotals = useMemo(() => khataInsight(people, khata), [people, khata])

  const occStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    let completed = 0
    let pending = 0
    let skipped = 0
    let overdue = 0
    let investedPaise = 0
    for (const occurrence of occurrences) {
      if (occurrence.status === 'completed') {
        completed += 1
        investedPaise += occurrence.actualAmountPaise ?? 0
      } else if (occurrence.status === 'skipped') skipped += 1
      else if (occurrence.scheduledDate < today) overdue += 1
      else pending += 1
    }
    return { completed, pending, skipped, overdue, investedPaise }
  }, [occurrences])

  const budgetRows = useMemo(
    () => budgetUsage(budgets, categoryTotals(periodTx, categories), period.start.slice(0, 7)),
    [budgets, periodTx, categories, period],
  )

  const averageDaily = useMemo(() => {
    const summary = summarize(transactions, period.start, period.end)
    const days = Math.max(1, Math.round((parseISO(period.end).getTime() - parseISO(period.start).getTime()) / 86400000) + 1)
    return Math.round(summary.consumptionPaise / days)
  }, [transactions, period])

  const topDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of periodTx) {
      if (tx.type !== 'PERSONAL_EXPENSE' && tx.type !== 'HOME_EXPENSE') continue
      map.set(tx.date, (map.get(tx.date) ?? 0) + tx.amountPaise)
    }
    let best: { date: string; amountPaise: number } | null = null
    for (const [date, amountPaise] of map) {
      if (!best || amountPaise > best.amountPaise) best = { date, amountPaise }
    }
    return best
  }, [periodTx])

  const [splitFilter, setSplitFilter] = useState<'all' | 'home' | 'personal'>('all')
  const [splitKind, setSplitKind] = useState<'bars' | 'line'>('bars')
  const splitData = useMemo(
    () =>
      visiblePeriods.map((item) => {
        const scoped = transactions.filter((tx) => tx.date >= item.start && tx.date <= item.end)
        const home = scoped.filter((tx) => tx.type === 'HOME_EXPENSE').reduce((sum, tx) => sum + tx.amountPaise, 0)
        const personal = scoped.filter((tx) => tx.type === 'PERSONAL_EXPENSE').reduce((sum, tx) => sum + tx.amountPaise, 0)
        return { name: item.label.split(' ')[0].slice(0, 3), home: Math.round(home) / 100, personal: Math.round(personal) / 100 }
      }),
    [visiblePeriods, transactions],
  )
  const splitTotals = useMemo(() => {
    let home = 0
    let personal = 0
    for (const tx of periodTx) {
      if (tx.type === 'HOME_EXPENSE') home += tx.amountPaise
      else if (tx.type === 'PERSONAL_EXPENSE') personal += tx.amountPaise
    }
    const total = home + personal
    return {
      home,
      personal,
      homePct: total > 0 ? Math.round((home / total) * 100) : 0,
      personalPct: total > 0 ? Math.round((personal / total) * 100) : 0,
    }
  }, [periodTx])

  return (
    <div>
      <h1 className="text-xl font-bold text-navy dark:text-white">Insights</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{period.label} cycle · {formatDate(period.start)} – {formatDate(period.end)}</p>

      <SectionHeader title="Monthly overview" />
      <Card className="p-4">
        <div className="mb-3 flex justify-end">
          <Segmented
            options={[
              { value: '3', label: '3 months' },
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
            ]}
            value={range}
            onChange={(value) => setRange(value as '3' | '6' | '12')}
          />
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyOverview}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
              <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
              <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#005A9C" radius={[6, 6, 0, 0]} />
              <Bar dataKey="invested" name="Invested" fill="#60C1E5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-2">
        <StatTile label="Avg daily spend" value={formatINR(averageDaily)} hint="This cycle" />
        <StatTile label="Top spending day" value={topDay ? formatINR(topDay.amountPaise) : '—'} hint={topDay ? formatDate(topDay.date) : undefined} />
      </div>

      <SectionHeader title="Home vs Personal" />
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Home expenses" value={formatINR(splitTotals.home)} tone="home" hint={`${splitTotals.homePct}% of spending this cycle`} />
          <StatTile label="Personal expenses" value={formatINR(splitTotals.personal)} tone="personal" hint={`${splitTotals.personalPct}% of spending this cycle`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'home', label: 'Home' },
              { value: 'personal', label: 'Personal' },
            ]}
            value={splitFilter}
            onChange={(value) => setSplitFilter(value as 'all' | 'home' | 'personal')}
          />
          <Segmented
            options={[
              { value: 'bars', label: 'Bars' },
              { value: 'line', label: 'Line' },
            ]}
            value={splitKind}
            onChange={(value) => setSplitKind(value as 'bars' | 'line')}
          />
        </div>
        <div className="mt-4 h-72">
          {splitData.every((row) => row.home === 0 && row.personal === 0) ? (
            <EmptyState title="No expenses yet" hint="Add home or personal expenses to see the comparison" />
          ) : splitKind === 'line' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={splitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                <Legend />
                {splitFilter !== 'personal' ? <Line dataKey="home" name="Home" stroke="#005A9C" strokeWidth={2.5} dot={{ r: 3 }} /> : null}
                {splitFilter !== 'home' ? <Line dataKey="personal" name="Personal" stroke="#60C1E5" strokeWidth={2.5} dot={{ r: 3 }} /> : null}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={splitData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} width={44} />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                <Legend />
                {splitFilter !== 'personal' ? <Bar dataKey="home" name="Home" fill="#005A9C" radius={[0, 6, 6, 0]} /> : null}
                {splitFilter !== 'home' ? <Bar dataKey="personal" name="Personal" fill="#60C1E5" radius={[0, 6, 6, 0]} /> : null}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <SectionHeader title="Category analysis" />
      {catTotals.length === 0 ? (
        <Card><EmptyState title="No expenses this cycle" /></Card>
      ) : (
        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={catTotals.map((total) => ({ name: total.name, value: Math.round(total.amountPaise) / 100, color: total.color }))}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'currentColor' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} width={120} />
                  <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                  <Bar dataKey="value" name="Spent" radius={[0, 6, 6, 0]}>
                    {catTotals.map((total) => (
                      <Cell key={total.id} fill={total.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              {catTotals.map((total) => (
                <div key={total.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: total.color }} />
                    {total.name}
                  </span>
                  <span className="font-semibold">{formatINR(total.amountPaise)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {budgetRows.length > 0 ? (
        <Card className="mt-3 p-4">
          {budgetRows.map((row) => {
            const pct = row.budget > 0 ? Math.min(100, Math.round((row.spent / row.budget) * 100)) : 0
            return (
              <div key={row.name} className="py-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{formatINR(row.spent)} / {formatINR(row.budget)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={cx('h-full rounded-full', pct > 90 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </Card>
      ) : null}

      <SectionHeader title="Investments" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Invested" value={formatINR(occStats.investedPaise)} hint="Completed occurrences" />
        <StatTile label="Completed" value={String(occStats.completed)} tone="positive" />
        <StatTile label="Pending" value={String(occStats.pending)} />
        <StatTile label="Overdue" value={String(occStats.overdue)} tone="negative" />
        <StatTile label="Skipped" value={String(occStats.skipped)} />
      </div>
      {invTotals.length > 0 ? (
        <Card className="mt-3 p-4">
          {invTotals.map((row) => (
            <div key={row.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
              <span>{row.name}</span>
              <span className="font-semibold">{formatINR(row.amountPaise)}</span>
            </div>
          ))}
        </Card>
      ) : null}

      <SectionHeader title="Khata" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Recoverable" value={formatINR(khataTotals.recoverablePaise)} tone="positive" />
        <StatTile label="Payable" value={formatINR(khataTotals.payablePaise)} tone="negative" />
        <StatTile label="Active accounts" value={String(khataTotals.activeAccounts)} />
        <StatTile label="Largest exposure" value={khataTotals.largest ? formatINR(Math.abs(khataTotals.largest.balancePaise)) : '—'} hint={khataTotals.largest?.name} />
      </div>
      {khataTotals.oweMe.length > 0 || khataTotals.iOwe.length > 0 ? (
        <Card className="mt-3 p-4">
          {khataTotals.oweMe.map((row) => (
            <div key={row.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm dark:border-slate-800">
              <span>{row.name} owes you</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(row.balancePaise)}</span>
            </div>
          ))}
          {khataTotals.iOwe.map((row) => (
            <div key={row.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
              <span>You owe {row.name}</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">{formatINR(Math.abs(row.balancePaise))}</span>
            </div>
          ))}
        </Card>
      ) : null}

      <p className="mt-6 text-center text-xs text-slate-400">Khata never enters expense, income, investment or cash-flow totals.</p>
    </div>
  )
}
