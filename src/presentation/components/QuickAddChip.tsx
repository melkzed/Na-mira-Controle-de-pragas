import { Plus } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** Botão "+" que abre um mini-formulário de cadastro rápido (1 campo) sem sair
 *  da tela atual — usado para cadastrar praga/área/serviço direto na O.S. */
export function QuickAddChip({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => { document.removeEventListener('mousedown', onDoc); clearTimeout(t); };
  }, [open]);

  const save = () => {
    const n = name.trim();
    if (!n) { setOpen(false); return; }
    onAdd(n);
    setName('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Cadastrar novo(a) ${label}`}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-brand/50 text-brand transition hover:bg-brand-soft"
      >
        <Plus size={13} />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-30 w-60 rounded-xl border border-border bg-surface p-2.5 shadow-elevated">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Novo(a) {label}</p>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nome"
            className="w-full rounded-lg border border-input bg-surface px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">Cancelar</button>
            <button type="button" onClick={save} className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand/90">Adicionar</button>
          </div>
        </div>
      )}
    </div>
  );
}
