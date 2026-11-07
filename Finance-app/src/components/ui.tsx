import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { cx } from '../app/utils'

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 min-h-[44px]'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-navy text-white shadow-sm hover:bg-navy-2 disabled:opacity-50',
    outline:
      'border border-slate-300 text-ink hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 disabled:opacity-50',
    ghost: 'text-navy hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  }[variant]
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] min-h-[44px] disabled:cursor-not-allowed',
        styles,
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 animate-fade-up',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'appearance-none', className)} {...props}>
      {children}
    </select>
  )
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-[88px] resize-y', className)} {...props} />
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('inline-flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'flex-1 min-w-max whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm min-h-[38px]',
            value === option.value
              ? 'bg-navy text-white shadow-sm'
              : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export function Overlay({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const desktop = useMediaQuery('(min-width: 768px)')
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex bg-slate-900/50 p-0 backdrop-blur-sm md:p-6"
          style={{ alignItems: desktop ? 'center' : 'flex-end', justifyContent: 'center' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={cx(
              'max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] dark:bg-slate-900 md:rounded-3xl',
              desktop ? (wide ? 'max-w-2xl' : 'max-w-lg') : '',
            )}
            initial={{ y: desktop ? 24 : 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: desktop ? 24 : 64, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-ink dark:text-slate-100">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Overlay open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Overlay>
  )
}

export function useConfirm() {
  const [state, setState] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    resolve: (ok: boolean) => void
  } | null>(null)
  const confirm = useCallback(
    (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setState({ title, message, confirmLabel: opts?.confirmLabel ?? 'Confirm', danger: opts?.danger ?? false, resolve })
      }),
    [],
  )
  const settle = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }
  const confirmNode = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null
  return { confirm, confirmNode }
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'positive' | 'negative' | 'home' | 'personal'
}) {
  const toneCls =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'home'
          ? 'text-[#005A9C] dark:text-[#60C1E5]'
          : tone === 'personal'
            ? 'text-[#1B365D] dark:text-[#A0E0EF]'
            : 'text-ink dark:text-slate-100'
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cx('mt-1 text-lg font-semibold', toneCls)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </Card>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1">{hint}</p> : null}
    </div>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      {action}
    </div>
  )
}
