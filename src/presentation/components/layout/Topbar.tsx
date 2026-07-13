import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { users } from '@/infrastructure/seed/data';
import { ROLE_META } from '@/domain/enums';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { cn } from '@/lib/utils';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme, currentUser, setUser, notifications, markAllRead, setCommandOpen } =
    useAppStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
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

      {/* Alternador de papel (demo de permissões) */}
      <div className="relative hidden md:block">
        <button
          onClick={() => setUserOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Perfil: {ROLE_META[currentUser.role].label}
        </button>
        <AnimatePresence>
          {userOpen && (
            <Dropdown onClose={() => setUserOpen(false)}>
              <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Trocar perfil (demo RBAC)
              </p>
              {users
                .filter((u, i, arr) => arr.findIndex((x) => x.role === u.role) === i)
                .map((u) => (
                  <button
                    key={u.role}
                    onClick={() => {
                      setUser(u);
                      setUserOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted',
                      u.role === currentUser.role && 'bg-muted',
                    )}
                  >
                    <Avatar name={u.name} size="xs" />
                    <div className="leading-tight">
                      <p className="font-medium text-foreground">{ROLE_META[u.role].label}</p>
                      <p className="text-xs text-muted-foreground">{u.name}</p>
                    </div>
                  </button>
                ))}
            </Dropdown>
          )}
        </AnimatePresence>
      </div>

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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setNotifOpen((o) => !o)}
          aria-label="Notificações"
        >
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
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Marcar todas como lidas
                </button>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex gap-3 rounded-lg px-2 py-2.5 transition hover:bg-muted',
                      !n.read && 'bg-muted/50',
                    )}
                  >
                    <Badge tone={n.tone} dot className="mt-0.5 shrink-0">
                      {''}
                    </Badge>
                    <div className="min-w-0 leading-snug">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Dropdown>
          )}
        </AnimatePresence>
      </div>

      <div className="h-6 w-px bg-border" />
      <Avatar name={currentUser.name} size="sm" />
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
