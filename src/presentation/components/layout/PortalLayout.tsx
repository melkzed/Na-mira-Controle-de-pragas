/**
 * Layout do Portal do Cliente.
 *
 * Área separada do sistema administrativo e do app de campo: quem entra aqui
 * é o cliente da empresa, com papel `cliente`, e só enxerga o próprio
 * cadastro. Nada de menu administrativo, busca global ou notificações
 * internas — a navegação é curta e de consulta.
 */
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays, FileText, History, LayoutDashboard, LogOut, Moon, Radar,
  Sun, User as UserIcon, Wallet,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useCustomersStore } from '@/store/customersStore';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { LogoMark } from '../ui/Logo';
import { PageLoader } from '../RouteError';
import { cn } from '@/lib/utils';

const PORTAL_TABS = [
  { to: '/portal', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/portal/agendamentos', label: 'Agendamentos', icon: CalendarDays, end: false },
  { to: '/portal/historico', label: 'Histórico', icon: History, end: false },
  { to: '/portal/documentos', label: 'Documentos', icon: FileText, end: false },
  { to: '/portal/financeiro', label: 'Pagamentos', icon: Wallet, end: false },
  { to: '/portal/monitoramento', label: 'Armadilhas', icon: Radar, end: false },
  { to: '/portal/perfil', label: 'Meus dados', icon: UserIcon, end: false },
];

export function PortalLayout() {
  const { currentUser, logout, theme, toggleTheme } = useAppStore();
  const customers = useCustomersStore((s) => s.customers);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!currentUser) return null;

  const customer = customers.find((c) => c.id === currentUser.customerId);
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} className="shrink-0 text-brand" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-foreground">Na Mira</p>
            <p className="text-[11px] text-muted-foreground">Portal do Cliente</p>
          </div>
        </div>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </Button>

        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Conta">
            <Avatar name={customer?.name ?? currentUser.name} size="sm" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  role="button" tabIndex={-1} aria-label="Fechar menu"
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setMenuOpen(false); }}
                />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-border bg-surface p-2 shadow-elevated"
                >
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <Avatar name={customer?.name ?? currentUser.name} size="sm" />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-sm font-medium text-foreground">{customer?.name ?? currentUser.name}</p>
                      <p className="truncate text-xs text-muted-foreground">Cliente</p>
                    </div>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <button
                    onClick={doLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-danger transition hover:bg-danger-soft"
                  >
                    <LogOut size={16} /> Sair
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Navegação: barra lateral no desktop, abas roláveis no celular. */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-6 pb-24 lg:pb-6">
        <nav className="hidden w-56 shrink-0 lg:block" aria-label="Navegação do Portal">
          <div className="sticky top-24 space-y-1">
            {PORTAL_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <tab.icon size={17} />{tab.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border glass lg:hidden" aria-label="Navegação do Portal">
        <div className="flex items-stretch overflow-x-auto">
          {PORTAL_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
