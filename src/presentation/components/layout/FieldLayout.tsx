import { Suspense, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { ROLE_META } from '@/domain/enums';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { PageLoader } from '../RouteError';

/**
 * Layout do App do Técnico — chrome enxuto, mobile-first, sem menu
 * administrativo. Técnicos só têm acesso a esta área.
 */
export function FieldLayout() {
  const { currentUser, logout, theme, toggleTheme } = useAppStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!currentUser) return null;

  const isStaff = currentUser.role !== 'tecnico';

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-glow">
            <ShieldCheck size={18} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-foreground">Na Mira</p>
            <p className="text-[11px] text-muted-foreground">App do Técnico</p>
          </div>
        </div>

        <div className="flex-1" />

        {isStaff && (
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={15} />} onClick={() => navigate('/')}>
            <span className="hidden sm:inline">Painel</span>
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </Button>

        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Conta">
            <Avatar name={currentUser.name} size="sm" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-border bg-surface p-2 shadow-elevated"
                >
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <Avatar name={currentUser.name} size="sm" />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-sm font-medium text-foreground">{currentUser.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{ROLE_META[currentUser.role].label}</p>
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

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
