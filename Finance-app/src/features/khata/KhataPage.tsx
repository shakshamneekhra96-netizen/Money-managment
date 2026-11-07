import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ChevronRight, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, Field, Overlay, Select, StatTile, TextInput, useConfirm } from '../../components/ui'
import { cx, errorMessage } from '../../app/utils'
import { db } from '../../db/db'
import { addPerson, setPersonArchived } from '../../db/repos'
import { khataInsight } from '../../domain/engine'
import { formatINR, rupeesToPaise } from '../../domain/money'
import { balanceLabel, personBalance } from '../../domain/khata'
import type { OpeningDirection } from '../../domain/types'

export function KhataPage() {
  const { confirm, confirmNode } = useConfirm()
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const khata = useLiveQuery(() => db.khataTransactions.toArray(), []) ?? []
  const totals = useMemo(() => khataInsight(people, khata), [people, khata])
  const active = people.filter((person) => !person.archived)
  const archived = people.filter((person) => person.archived)

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [notes, setNotes] = useState('')
  const [opening, setOpening] = useState('')
  const [direction, setDirection] = useState<OpeningDirection>('they_owe_me')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    try {
      setBusy(true)
      setError(null)
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Enter a name.')
      const openingPaise = opening.trim() ? rupeesToPaise(opening) : 0
      await addPerson({ name: trimmed, mobile: mobile.trim(), notes: notes.trim(), openingPaise, openingDirection: direction })
      setAddOpen(false)
      setName('')
      setMobile('')
      setNotes('')
      setOpening('')
      setDirection('they_owe_me')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onArchive(personId: string, personName: string, next: boolean) {
    const ok = await confirm(
      next ? 'Archive person?' : 'Restore person?',
      next
        ? `${personName} will be hidden from active accounts. Khata history is kept.`
        : `${personName} will return to active accounts.`,
      { confirmLabel: next ? 'Archive' : 'Restore' },
    )
    if (ok) await setPersonArchived(personId, next)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-navy dark:text-white">Khata</h1>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus size={16} /> Add person
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Recoverable" value={formatINR(totals.recoverablePaise)} tone="positive" />
        <StatTile label="Payable" value={formatINR(totals.payablePaise)} tone="negative" />
        <StatTile label="Active accounts" value={String(totals.activeAccounts)} />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active accounts</h2>
      <Card className="p-2">
        {active.map((person) => {
          const balance = personBalance(khata.filter((entry) => entry.personId === person.id))
          return (
            <Link
              key={person.id}
              to={`/khata/${person.id}`}
              className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink dark:text-slate-100">{person.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{person.mobile || 'No mobile saved'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx('text-sm font-semibold', balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500')}>
                  {formatINR(balance)}
                </span>
                <span className={cx('text-[11px]', balance === 0 ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400')}>
                  {balanceLabel(balance)}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </Link>
          )
        })}
        {active.length === 0 ? <EmptyState title="No active khata accounts" hint="Add a person to start tracking" /> : null}
      </Card>

      {archived.length > 0 ? (
        <>
          <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Archived</h2>
          <Card className="p-2">
            {archived.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
                <div>
                  <p className="font-medium text-slate-400">{person.name}</p>
                  <p className="text-xs text-slate-400">Khata history is kept</p>
                </div>
                <Button variant="ghost" onClick={() => void onArchive(person.id, person.name, false)}>
                  <Archive size={14} /> Restore
                </Button>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <Overlay open={addOpen} onClose={() => setAddOpen(false)} title="Add person">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ramesh Gupta" autoFocus />
          </Field>
          <Field label="Mobile (optional)">
            <TextInput value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="+91..." inputMode="tel" />
          </Field>
          <Field label="Opening balance (₹, optional)">
            <TextInput value={opening} onChange={(event) => setOpening(event.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Opening direction">
            <Select value={direction} onChange={(event) => setDirection(event.target.value as OpeningDirection)}>
              <option value="they_owe_me">They owe me</option>
              <option value="i_owe_them">I owe them</option>
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            Save person
          </Button>
        </form>
      </Overlay>

      {confirmNode}
    </div>
  )
}
