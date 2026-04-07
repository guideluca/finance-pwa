import { Home, List, LogOut, Settings, Upload, FolderTree } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/transactions', icon: List, label: 'Extrato' },
  { to: '/import', icon: Upload, label: 'Importar' },
  { to: '/categories', icon: FolderTree, label: 'Categorias' },
  { to: '/rules', icon: Settings, label: 'Regras' },
]

export function AppShell() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 flex items-center justify-end gap-2 border-b border-border bg-background/90 px-4 py-2 backdrop-blur-md pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          Sair
        </Button>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        aria-label="Principal"
      >
        <ul className="mx-auto flex max-w-lg justify-between px-2 py-2">
          {nav.map(({ to, icon: Icon, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium text-muted transition-colors',
                    isActive && 'text-accent',
                  )
                }
              >
                <Icon className="size-5" strokeWidth={1.75} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
