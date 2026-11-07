import { History, Home, PieChart, Plus, Settings, User, Users } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '../app/hooks'
import { cx } from '../app/utils'
import { AddSheet, type AddTab } from '../features/add/AddSheet'

export interface AddContextValue {
  openAdd: (tab?: AddTab) => void
}

const AddContext = createContext<AddContextValue | null>(null)

export function useAdd(): AddContextValue {
  const context = useContext(AddContext)
  if (!context) throw new Error('useAdd must be used inside AppShell')
  return context
}

function navClass(isActive: boolean): string {
  return cx(
    'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-navy text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  )
}

function Brand() {
  return (
    <div className="px-3">
      <p className="text-lg font-bold text-navy dark:text-white">MyFinance</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">Every Rupee, Accounted For.</p>
    </div>
  )
}

function Sidebar({ onAdd }: { onAdd: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-2 border-r border-slate-200/80 bg-white/80 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 md:flex">
      <Brand />
      <nav className="mt-6 flex flex-col gap-1">
        <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
          <Home size={18} /> Home
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => navClass(isActive)}>
          <History size={18} /> History
        </NavLink>
        <button
          type="button"
          onClick={onAdd}
          className="mx-auto my-2 flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full bg-navy text-white shadow-md transition-transform hover:scale-105 active:scale-95"
          aria-label="Add"
        >
          <Plus size={24} />
        </button>
        <NavLink to="/khata" className={({ isActive }) => navClass(isActive)}>
          <Users size={18} /> Khata
        </NavLink>
        <NavLink to="/insights" className={({ isActive }) => navClass(isActive)}>
          <PieChart size={18} /> Insights
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
          <Settings size={18} /> Settings
        </NavLink>
      </nav>
    </aside>
  )
}

function MobileHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
      <div>
        <p className="text-base font-bold text-navy dark:text-white">MyFinance</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Every Rupee, Accounted For.</p>
      </div>
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          cx(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors',
            isActive ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          )
        }
      >
        <User size={20} />
      </NavLink>
    </header>
  )
}

function BottomBar({ onAdd }: { onAdd: () => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
      <div className="grid grid-cols-5 items-center">
        <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
          <span className="mx-auto flex flex-col items-center gap-0.5 py-1">
            <Home size={20} />
            <span className="text-[10px]">Home</span>
          </span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => navClass(isActive)}>
          <span className="mx-auto flex flex-col items-center gap-0.5 py-1">
            <History size={20} />
            <span className="text-[10px]">History</span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={onAdd}
          className="flex justify-center"
          aria-label="Add"
        >
          <span className="-mt-6 flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full bg-navy text-white shadow-lg ring-4 ring-white transition-transform active:scale-95 dark:ring-slate-900">
            <Plus size={26} />
          </span>
        </button>
        <NavLink to="/khata" className={({ isActive }) => navClass(isActive)}>
          <span className="mx-auto flex flex-col items-center gap-0.5 py-1">
            <Users size={20} />
            <span className="text-[10px]">Khata</span>
          </span>
        </NavLink>
        <NavLink to="/insights" className={({ isActive }) => navClass(isActive)}>
          <span className="mx-auto flex flex-col items-center gap-0.5 py-1">
            <PieChart size={20} />
            <span className="text-[10px]">Insights</span>
          </span>
        </NavLink>
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  useTheme()
  const [addOpen, setAddOpen] = useState(false)
  const [addTab, setAddTab] = useState<AddTab>('home')
  const openAdd = useCallback((tab: AddTab = 'home') => {
    setAddTab(tab)
    setAddOpen(true)
  }, [])
  const closeAdd = useCallback(() => setAddOpen(false), [])
  const contextValue = useMemo(() => ({ openAdd }), [openAdd])
  return (
    <AddContext.Provider value={contextValue}>
      <div className="min-h-dvh">
        <Sidebar onAdd={() => openAdd()} />
        <MobileHeader />
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-[calc(68px+env(safe-area-inset-top))] md:pl-64 md:pr-8 md:pt-8">{children}</main>
        <BottomBar onAdd={() => openAdd()} />
      </div>
      <AddSheet open={addOpen} tab={addTab} onTabChange={setAddTab} onClose={closeAdd} />
    </AddContext.Provider>
  )
}