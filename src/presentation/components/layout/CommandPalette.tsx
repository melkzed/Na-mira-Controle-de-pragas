import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { useCustomersStore } from '@/store/customersStore';
import { navForRole } from '@/application/navigation';
import { Icon } from '../ui/Icon';
import { cn } from '@/lib/utils';

/** Paleta de comandos (⌘K) — navegação e busca de clientes. */
export function CommandPalette() {
  const { commandOpen, setCommandOpen, currentUser } = useAppStore();
  const customers = useCustomersStore((s) => s.customers);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
      // Tecla "/" abre a busca — desde que o usuário não esteja digitando num campo.
      if (e.key === '/' && !commandOpen) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !el?.isContentEditable) {
          e.preventDefault();
          setCommandOpen(true);
        }
      }
      if (e.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    if (!commandOpen) setQuery('');
  }, [commandOpen]);

  const nav = currentUser ? navForRole(currentUser.role) : [];

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const pages = nav
      .filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ type: 'page' as const, label: n.label, icon: n.icon, to: n.to }));
    const custs = q
      ? customers
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 5)
          .map((c) => ({
            type: 'customer' as const,
            label: c.name,
            icon: 'User',
            to: `/clientes?id=${c.id}`,
          }))
      : [];
    return [...pages, ...custs];
  }, [query, nav]);

  const go = (to: string) => {
    navigate(to);
    setCommandOpen(false);
  };

  // Navegação por teclado (↑/↓/Enter).
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setActiveIndex(0), [query, commandOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) go(r.to);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {commandOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed left-1/2 top-24 z-[61] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Icon name="Search" size={18} className="text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar páginas, clientes…"
                className="h-14 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhum resultado para “{query}”.
                </p>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.to}-${i}`}
                  data-idx={i}
                  onClick={() => go(r.to)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                    i === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon name={r.icon} size={15} />
                  </span>
                  <span className="flex-1 text-foreground">{r.label}</span>
                  <span className="text-[11px] uppercase text-muted-foreground/70">
                    {r.type === 'page' ? 'Página' : 'Cliente'}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
