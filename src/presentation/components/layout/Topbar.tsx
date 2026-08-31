import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { notificationLink } from '@/application/notifications';
import { Bell, LogOut, Menu, Moon, Search, Smartphone, Sun, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { ROLE_META } from '@/domain/enums';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { cn } from '@/lib/utils';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme, currentUser, logout, notifications, markAllRead, markRead, dismissNotification, setCommandOpen } =
    useAppStore();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  if (!currentUser) return null;

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Abrir menu">
        <Menu size={20} />
      </Button>

      {/* Busca / paleta de comandos */}
      <button
        onClick={() => setCommandOpen(true)}
        className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition hover:bg-muted sm:max-w-sm"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Buscar ou executar…</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Tema */}
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </motion.span>
        </AnimatePresence>
      </Button>

      {/* Notificações */}
      <div className="relative">
        <Button variant="ghost" size="icon" onClick={() => setNotifOpen((o) => !o)} aria-label="Notificações">
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Button>
        <AnimatePresence>
          {notifOpen && (
            <Dropdown onClose={() => setNotifOpen(false)} width="w-80">
              <div className="flex items-center justify-between px-2 pb-2">
                <p className="text-sm font-semibold text-foreground">Notificações</p>
                <button onClick={markAllRead} className="text-xs font-medium text-brand hover:underline">
                  Marcar todas como lidas
                </button>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma notificação.</p>
                )}
                {notifications.map((n) => {
                  const destino = notificationLink(n);
                  return (
                    <div
                      key={n.id}
                      className={cn('group flex gap-3 rounded-lg px-2 py-2.5 transition hover:bg-muted', !n.read && 'bg-muted/50')}
                    >
                      <Badge tone={n.tone} dot className="mt-0.5 shrink-0">{''}</Badge>
                      {/* Clicar leva ao módulo do aviso (e ao registro, quando
                          a tela aceita ?id=) — sem isso a pessoa lê o alerta e
                          tem de sair procurando onde ele aconteceu. */}
                      {destino ? (
                        <button
                          type="button"
                          onClick={() => { markRead(n.id); setNotifOpen(false); navigate(destino); }}
                          className="min-w-0 flex-1 text-left leading-snug"
                          title={`Abrir ${destino}`}
                        >
                          <p className="text-sm font-medium text-foreground group-hover:underline">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.body}</p>
                        </button>
                      ) : (
                        <div className="min-w-0 flex-1 leading-snug">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.body}</p>
                        </div>
                      )}
                      <button
                        onClick={() => dismissNotification(n.id)}
                        aria-label={`Remover notificação: ${n.title}`}
                        title="Remover"
                        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-border hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Dropdown>
          )}
        </AnimatePresence>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Conta do usuário */}
      <div className="relative">
        <button
          onClick={() => setUserOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg p-0.5 transition hover:bg-muted"
          aria-label="Conta"
        >
          <Avatar name={currentUser.name} size="sm" />
          <span className="hidden pr-1 text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-foreground">{currentUser.name.split(' ')[0]}</span>
            <span className="block text-[11px] text-muted-foreground">{ROLE_META[currentUser.role].label}</span>
          </span>
        </button>
        <AnimatePresence>
          {userOpen && (
            <Dropdown onClose={() => setUserOpen(false)} width="w-60">
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <Avatar name={currentUser.name} size="sm" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-medium text-foreground">{currentUser.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                onClick={() => { setUserOpen(false); navigate('/campo'); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-foreground transition hover:bg-muted"
              >
                <Smartphone size={16} className="text-muted-foreground" /> App do Técnico
              </button>
              <button
                onClick={doLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-danger transition hover:bg-danger-soft"
              >
                <LogOut size={16} /> Sair
              </button>
            </Dropdown>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function Dropdown({
  children,
  onClose,
  width = 'w-64',
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'absolute right-0 top-11 z-50 rounded-xl border border-border bg-surface p-2 shadow-elevated',
          width,
        )}
      >
        {children}
      </motion.div>
    </>
  );
}
