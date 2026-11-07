import { useLiveQuery } from 'dexie-react-hooks'
import { jsPDF } from 'jspdf'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, FileText, Pencil, Share2, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { Button, Card, EmptyState, Field, Overlay, Select, StatTile, TextInput, useConfirm } from '../../components/ui'
import { useDateFormat } from '../../app/hooks'
import { cx, errorMessage } from '../../app/utils'
import { db } from '../../db/db'
import { addKhataEntry, deletePersonAndHistory, setPersonArchived, updatePerson } from '../../db/repos'
import { todayISO } from '../../domain/dates'
import { balanceLabel, hisaabText, personBalance } from '../../domain/khata'
import { formatINR, rupeesToPaise } from '../../domain/money'
import type { KhataTransaction } from '../../domain/types'

export function PersonPage() {
  const { personId } = useParams()
  const navigate = useNavigate()
  const formatDate = useDateFormat()
  const { confirm, confirmNode } = useConfirm()

  const personRows = useLiveQuery(() => db.people.toArray(), [])
  const entries = useLiveQuery(
    () =>
      personId
        ? db.khataTransactions.where('personId').equals(personId).toArray()
        : Promise.resolve([] as KhataTransaction[]),
    [personId],
    [] as KhataTransaction[],
  ) ?? []

  const [entryOpen, setEntryOpen] = useState<'KHATA_GIVEN' | 'KHATA_RECEIVED' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [paymentMode, setPaymentMode] = useState('UPI')
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (personRows === undefined) {
    return <EmptyState title="Loading…" />
  }
  const person = personRows.find((row) => row.id === personId)
  if (!person || !personId) {
    return <EmptyState title="Person not found" hint="They may have been deleted" />
  }

  const balance = personBalance(entries)
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  async function submitEntry() {
    if (!entryOpen || !personId) return
    try {
      setBusy(true)
      setError(null)
      const amountPaise = rupeesToPaise(amount)
      await addKhataEntry({
        personId,
        type: entryOpen,
        amountPaise,
        date,
        description: description.trim(),
        paymentMode,
      })
      setEntryOpen(null)
      setAmount('')
      setDescription('')
      setDate(todayISO())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit() {
    if (!personId) return
    try {
      setBusy(true)
      setError(null)
      if (!editName.trim()) throw new Error('Enter a name.')
      await updatePerson(personId, { name: editName.trim(), mobile: editMobile.trim(), notes: editNotes.trim() })
      setEditOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onShare() {
    if (!person) return
    const ok = await confirm(
      'Share hisaab?',
      `Send the full statement for ${person.name} as text?`,
      { confirmLabel: 'Share' },
    )
    if (!ok) return
    const text = hisaabText({ name: person.name, mobile: person.mobile, entries, formatDate })
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Hisaab with ${person.name}`, text })
      } catch {
        // user dismissed the share sheet
      }
      return
    }
    const digits = person.mobile.replace(/\D/g, '')
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank')
  }

  function onPdf() {
    if (!person) return
    const doc = new jsPDF()
    doc.setFont('courier', 'normal')
    const text = hisaabText({ name: person.name, mobile: person.mobile, entries, formatDate }).replaceAll('₹', 'Rs.').replaceAll('```', '')
    const lines = doc.splitTextToSize(text, 180) as string[]
    let y = 20
    doc.setFontSize(11)
    for (const line of lines) {
      if (y > 280) {
        doc.addPage()
        y = 20
      }
      doc.text(line, 15, y)
      y += 6
    }
    doc.save(`hisaab-${person.name.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  async function onDelete() {
    if (!person || !personId) return
    const ok = await confirm(
      'Delete person?',
      `Delete ${person.name} and all their khata history? This cannot be undone. Consider archiving instead to keep history.`,
      { confirmLabel: 'Delete', danger: true },
    )
    if (!ok) return
    await deletePersonAndHistory(personId)
    navigate('/khata')
  }

  async function onArchive(next: boolean) {
    if (!person || !personId) return
    const ok = await confirm(
      next ? 'Archive person?' : 'Restore person?',
      next
        ? `${person.name} will be hidden from active accounts. History is kept.`
        : `${person.name} returns to active accounts.`,
      { confirmLabel: next ? 'Archive' : 'Restore' },
    )
    if (ok) {
      await setPersonArchived(personId, next)
      if (next) navigate('/khata')
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/khata')}
        className="mb-2 flex items-center gap-1 text-sm font-medium text-accent hover:underline"
      >
        <ChevronLeft size={16} /> Khata
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy dark:text-white">{person.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{person.mobile || 'No mobile saved'}{person.notes ? ` · ${person.notes}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setEditName(person.name); setEditMobile(person.mobile); setEditNotes(person.notes); setEditOpen(true) }}>
            <Pencil size={14} /> Edit
          </Button>
          <Button variant="ghost" onClick={() => void onShare()}>
            <Share2 size={14} /> Share Hisaab
          </Button>
          <Button variant="ghost" onClick={onPdf}>
            <FileText size={14} /> PDF
          </Button>
          <Button variant="ghost" onClick={() => void onArchive(!person.archived)}>
            {person.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="ghost" className="text-rose-600 dark:text-rose-400" onClick={() => void onDelete()}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Balance" value={formatINR(balance)} hint={balanceLabel(balance)} tone={balance >= 0 ? 'positive' : 'negative'} />
        <StatTile label="Given" value={formatINR(entries.filter((e) => e.type === 'KHATA_GIVEN' || (e.type === 'KHATA_OPENING_BALANCE' && e.openingDirection !== 'i_owe_them')).reduce((sum, e) => sum + e.amountPaise, 0))} />
        <StatTile label="Received" value={formatINR(entries.filter((e) => e.type === 'KHATA_RECEIVED' || (e.type === 'KHATA_OPENING_BALANCE' && e.openingDirection === 'i_owe_them')).reduce((sum, e) => sum + e.amountPaise, 0))} />
      </div>

      <div className="mt-4 flex gap-3">
        <Button className="flex-1" onClick={() => setEntryOpen('KHATA_GIVEN')}>
          <ArrowUpRight size={16} /> Send Money
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setEntryOpen('KHATA_RECEIVED')}>
          <ArrowDownLeft size={16} /> Receive Money
        </Button>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ledger</h2>
      <Card className="p-2">
        {sorted.map((entry) => {
          const signed = entry.type === 'KHATA_GIVEN' || (entry.type === 'KHATA_OPENING_BALANCE' && entry.openingDirection !== 'i_owe_them')
          const label = entry.type === 'KHATA_GIVEN' ? 'Sent' : entry.type === 'KHATA_RECEIVED' ? 'Received' : entry.openingDirection === 'i_owe_them' ? 'Opening (I owe)' : 'Opening (owed to me)'
          return (
            <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(entry.date)}{entry.description ? ` · ${entry.description}` : ''}{entry.paymentMode ? ` · ${entry.paymentMode}` : ''}
                </p>
              </div>
              <p className={cx('text-sm font-semibold', signed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {signed ? '+' : '−'}{formatINR(entry.amountPaise)}
              </p>
            </div>
          )
        })}
        {sorted.length === 0 ? <EmptyState title="No entries yet" hint="Send or receive money to start the ledger" /> : null}
      </Card>

      <Overlay
        open={entryOpen !== null}
        onClose={() => setEntryOpen(null)}
        title={entryOpen === 'KHATA_GIVEN' ? 'Send money' : 'Receive money'}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submitEntry()
          }}
        >
          <Field label="Amount (₹)">
            <TextInput inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Payment mode">
            <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
              {['UPI', 'Cash', 'Bank Transfer', 'Cheque'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <TextInput value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this for?" />
          </Field>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            {entryOpen === 'KHATA_GIVEN' ? 'Record sent money' : 'Record received money'}
          </Button>
        </form>
      </Overlay>

      <Overlay open={editOpen} onClose={() => setEditOpen(false)} title="Edit person">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submitEdit()
          }}
        >
          <Field label="Name">
            <TextInput value={editName} onChange={(event) => setEditName(event.target.value)} />
          </Field>
          <Field label="Mobile (optional)">
            <TextInput value={editMobile} onChange={(event) => setEditMobile(event.target.value)} inputMode="tel" />
          </Field>
          <Field label="Notes (optional)">
            <TextInput value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            Save changes
          </Button>
        </form>
      </Overlay>

      {confirmNode}
    </div>
  )
}
