import { FolderTree, Home, List, LogOut, Moon, PiggyBank, Settings, Sparkles, Sun, Upload } from 'lucide-react'
import { FloatingAiChat } from '@/components/ai/FloatingAiChat'
import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { seedDefaultCategoriesIfEmpty, seedDefaultRulesIfEmpty } from '@/lib/seedCategories'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/analysis', icon: Sparkles, label: 'Análise' },
  { to: '/savings', icon: PiggyBank, label: 'Poupança' },
  { to: '/transactions', icon: List, label: 'Extrato' },
  { to: '/import', icon: Upload, label: 'Importar' },
  { to: '/categories', icon: FolderTree, label: 'Categorias' },
  { to: '/rules', icon: Settings, label: 'Regras' },
]

export function AppShell() {
  const { user, signOut } = useAuth()
  const { resolved, toggle } = useTheme()

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        await seedDefaultCategoriesIfEmpty(user.id)
        await seedDefaultRulesIfEmpty(user.id)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [user])

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 flex items-center justify-end gap-2 border-b border-border bg-background/90 px-4 py-2 backdrop-blur-md pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted"
          onClick={toggle}
          aria-label={resolved === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={resolved === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
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
        <ul className="mx-auto flex max-w-lg min-w-0 justify-between gap-0.5 overflow-x-auto px-1 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map(({ to, icon: Icon, label }) => (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold leading-tight text-muted transition-colors sm:text-[10px]',
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
      <FloatingAiChat />
    </div>
  )
}
