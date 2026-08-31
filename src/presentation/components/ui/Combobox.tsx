import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn, compareText } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  sub?: string;
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  return ref;
}

/** Seleção única com busca — dropdown estilizado (substitui o `<select>` nativo
 *  em campos com muitas opções, ex.: Cliente). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'Nada encontrado.',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useOutsideClose(open, () => setOpen(false));

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q))
      : options;
    // Alfabético em pt-BR: numa lista de busca o usuário procura pelo nome, e
    // a ordem em que a store devolveu não diz nada a ele. A opção vazia
    // ("nenhum", "todos") fica no topo — é um comando, não um item da lista.
    return [...base].sort((a, b) => {
      if (!a.value !== !b.value) return a.value ? 1 : -1;
      return compareText(a.label, b.label);
    });
  }, [options, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const pick = (opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3 py-2 text-left text-sm text-foreground transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground/70')}>{selected ? selected.label : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar seleção"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); } }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} className="text-muted-foreground" />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
            <Search size={13} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</p>}
            {filtered.map((o, i) => (
              <button
                type="button"
                key={o.value}
                onClick={() => pick(o)}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition',
                  i === activeIdx ? 'bg-brand-soft text-brand' : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>}
                </span>
                {o.value === value && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Seleção múltipla com busca — usado para listas que crescem (equipamentos,
 *  técnicos…): digita para filtrar, toca para marcar; selecionados viram chips. */
export function MultiCombobox({
  values,
  onChange,
  options,
  placeholder = 'Buscar e selecionar…',
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useOutsideClose(open, () => setOpen(false));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q))
      : options;
    return [...base].sort((a, b) => compareText(a.label, b.label));
  }, [options, query]);

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-input bg-surface px-2 py-1.5 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40"
      >
        {values.map((v) => {
          const o = options.find((x) => x.value === v);
          if (!o) return null;
          return (
            <span key={v} className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
              {o.label}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} aria-label={`Remover ${o.label}`} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={values.length ? '' : placeholder}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-elevated">
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado.</p>}
          {filtered.map((o) => {
            const active = values.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className={cn('flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-muted', active && 'text-brand')}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>}
                </span>
                {active && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
