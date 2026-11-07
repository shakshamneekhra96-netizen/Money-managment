import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { usePaymentMethods, useProfile } from '../../app/hooks'
import { errorMessage } from '../../app/utils'
import { db } from '../../db/db'
import {
  addExpense,
  addOneOffIncome,
  createInvestmentTemplate,
  createSalaryTemplate,
  recordOneOffInvestment,
} from '../../db/repos'
import { todayISO } from '../../domain/dates'
import { rupeesToPaise } from '../../domain/money'
import {
  FREQUENCIES,
  INCOME_SOURCES,
  INVESTMENT_KINDS,
  type Frequency,
  type InvestmentKind,
  type InvestmentPay,
  type Section,
} from '../../domain/types'
import { Button, Field, Overlay, Segmented, Select, TextArea, TextInput } from '../../components/ui'

export type AddTab = 'home' | 'personal' | 'investment' | 'income'

interface Receipt {
  filename: string
  mimeType: string
  dataBase64: string
}

function readReceipt(file: File, onDone: (receipt: Receipt) => void): void {
  const reader = new FileReader()
  reader.onload = () => {
    const result = String(reader.result)
    onDone({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64: result.slice(result.indexOf(',') + 1),
    })
  }
  reader.readAsDataURL(file)
}

export function AddSheet({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean
  tab: AddTab
  onTabChange: (tab: AddTab) => void
  onClose: () => void
}) {
  return (
    <Overlay open={open} onClose={onClose} title="Add" wide>
      <Segmented
        options={[
          { value: 'home', label: 'Home' },
          { value: 'personal', label: 'Personal' },
          { value: 'investment', label: 'Investment' },
          { value: 'income', label: 'Income' },
        ]}
        value={tab}
        onChange={(value) => onTabChange(value as AddTab)}
      />
      <div className="mt-5">
        {tab === 'home' ? <ExpenseForm section="home" onDone={onClose} /> : null}
        {tab === 'personal' ? <ExpenseForm section="personal" onDone={onClose} /> : null}
        {tab === 'investment' ? <InvestmentForm onDone={onClose} /> : null}
        {tab === 'income' ? <IncomeForm onDone={onClose} /> : null}
      </div>
    </Overlay>
  )
}

function ExpenseForm({ section, onDone }: { section: Section; onDone: () => void }) {
  const profile = useProfile()
  const paymentMethods = usePaymentMethods().filter((method) => !method.archived)
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const tops = categories
    .filter((category) => category.section === section && !category.parentId && !category.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [paymentMode, setPaymentMode] = useState(profile.defaultPaymentMethod)
  const [description, setDescription] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const subs = categories.filter((category) => category.parentId === categoryId && !category.archived)

  async function submit() {
    try {
      setBusy(true)
      setError(null)
      const amountPaise = rupeesToPaise(amount)
      await addExpense({
        section,
        amountPaise,
        date,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        paymentMode,
        description: description.trim(),
        attachment: receipt ?? undefined,
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Field label="Amount (₹)">
        <TextInput
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Category">
        <Select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId('') }}>
          <option value="">Select a category</option>
          {tops.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      {subs.length > 0 ? (
        <Field label="Subcategory (optional)">
          <Select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}>
            <option value="">None</option>
            {subs.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field label="Payment mode">
        <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.name}>
              {method.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes (optional)">
        <TextArea
          value={description}
          placeholder="What was this for?"
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label="Receipt (optional)">
        <input
          type="file"
          accept="image/*,application/pdf"
          className="w-full rounded-xl border border-dashed border-slate-300 p-2.5 text-sm dark:border-slate-700"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) readReceipt(file, setReceipt)
          }}
        />
        {receipt ? <p className="text-xs text-slate-500">Attached: {receipt.filename}</p> : null}
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" disabled={busy} className="w-full">
        Save {section === 'home' ? 'Home' : 'Personal'} expense
      </Button>
    </form>
  )
}

function InvestmentForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'oneoff' | 'recurring'>('oneoff')
  const [name, setName] = useState('')
  const [type, setType] = useState<InvestmentKind>('SIP')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [startDate, setStartDate] = useState(todayISO())
  const [debitDate, setDebitDate] = useState(todayISO())
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [pay, setPay] = useState<InvestmentPay>('Autopay')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    try {
      setBusy(true)
      setError(null)
      const amountPaise = rupeesToPaise(amount)
      if (!name.trim()) throw new Error('Give this investment a name.')
      if (mode === 'oneoff') {
        await recordOneOffInvestment({ name: name.trim(), type, amountPaise, date, notes: notes.trim() })
      } else {
        await createInvestmentTemplate({
          name: name.trim(),
          type,
          amountPaise,
          startDate,
          debitDate,
          frequency,
          paymentMethod: pay,
          notes: notes.trim(),
        })
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Segmented
        options={[
          { value: 'oneoff', label: 'One-off' },
          { value: 'recurring', label: 'Recurring' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Field label="Name">
        <TextInput value={name} placeholder="e.g. Index Fund SIP" onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Type">
        <Select value={type} onChange={(event) => setType(event.target.value as InvestmentKind)}>
          {INVESTMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₹)">
        <TextInput inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      {mode === 'oneoff' ? (
        <>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A one-off investment is recorded as completed immediately.
          </p>
        </>
      ) : (
        <>
          <Field label="Start date">
            <TextInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="Debit date">
            <TextInput type="date" value={debitDate} onChange={(event) => setDebitDate(event.target.value)} />
          </Field>
          <Field label="Frequency">
            <Select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {FREQUENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How is it paid?">
            <Segmented
              options={[
                { value: 'Autopay', label: 'Autopay' },
                { value: 'Self Transaction', label: 'Self Transaction' },
              ]}
              value={pay}
              onChange={setPay}
            />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Occurrences are generated on a rolling 14-month horizon. Complete each one when the money is actually
            debited — only completed occurrences add to invested totals.
          </p>
        </>
      )}
      <Field label="Notes (optional)">
        <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {mode === 'oneoff' ? 'Record investment' : 'Create investment'}
      </Button>
    </form>
  )
}

function IncomeForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'oneoff' | 'recurring'>('oneoff')
  const [source, setSource] = useState<string>(INCOME_SOURCES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [startDate, setStartDate] = useState(todayISO())
  const [debitDate, setDebitDate] = useState(todayISO())
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [paymentMode, setPaymentMode] = useState('Bank Transfer')
  const [description, setDescription] = useState('')
  const [templateName, setTemplateName] = useState('Salary')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    try {
      setBusy(true)
      setError(null)
      const amountPaise = rupeesToPaise(amount)
      if (mode === 'oneoff') {
        await addOneOffIncome({
          source,
          amountPaise,
          date,
          description: description.trim(),
          paymentMode,
        })
      } else {
        await createSalaryTemplate({
          name: templateName.trim() || 'Salary',
          expectedAmountPaise: amountPaise,
          startDate,
          debitDate,
          frequency,
          paymentMode,
        })
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Segmented
        options={[
          { value: 'oneoff', label: 'One-off income' },
          { value: 'recurring', label: 'Recurring salary' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'oneoff' ? (
        <>
          <Field label="Source">
            <Select value={source} onChange={(event) => setSource(event.target.value)}>
              {INCOME_SOURCES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)">
            <TextInput inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
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
            <TextInput value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Template name">
            <TextInput value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
          </Field>
          <Field label="Expected amount (₹)">
            <TextInput inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Start date">
            <TextInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="Expected debit date">
            <TextInput type="date" value={debitDate} onChange={(event) => setDebitDate(event.target.value)} />
          </Field>
          <Field label="Frequency">
            <Select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {FREQUENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Expected salary stays out of income totals until you mark the occurrence as received. Home will remind
            you when a salary is due.
          </p>
        </>
      )}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {mode === 'oneoff' ? 'Record income' : 'Create salary template'}
      </Button>
    </form>
  )
}