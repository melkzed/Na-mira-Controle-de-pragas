import { create } from 'zustand';
import type { StockBalance } from '@/domain/types';
import { stockBalances as seedBalances } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { useAppStore } from './appStore';

/** Estoque mutável (dual-mode — ver docs/ARCHITECTURE.md §3.1/§3.2). Entradas
 *  e transferências entre locais. `StockBalance` não tem `orgId` no domínio
 *  (é implícito, um por org) — injetado na escrita a partir do usuário logado. */
const KEY = 'namira-stock';
const TABLE = 'stock_balances';

function load(): StockBalance[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StockBalance[];
  } catch {
    /* ignora */
  }
  return seedBalances.map((b) => ({ ...b }));
}
const save = (v: StockBalance[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = () => 'sb-' + Math.random().toString(36).slice(2, 9);
const orgId = () => useAppStore.getState().currentUser?.orgId ?? 'org-namira';

function syncRow(row: StockBalance, isNew: boolean, rollback: StockBalance[]) {
  if (!supabaseEnabled || !supabase) return;
  const payload = { ...toSnakeRow(row as unknown as Record<string, unknown>), org_id: orgId() };
  const op = isNew ? supabase.from(TABLE).insert(payload) : supabase.from(TABLE).update(payload).eq('id', row.id);
  op.then(({ error }) => {
    if (error) {
      useStockStore.setState({ balances: rollback });
      toast('Não foi possível atualizar o estoque — tente novamente.', { tone: 'danger' });
    }
  });
}

interface StockState {
  balances: StockBalance[];
  /** Saldo (somado) de um produto em um local. */
  balanceOf: (locationId: string, productId: string) => number;
  /** Entrada de estoque (compra/ajuste) em um local. */
  entry: (locationId: string, productId: string, qty: number) => void;
  /** Baixa de estoque em um local (ex.: produto aplicado em campo). Nunca
   *  deixa o saldo negativo. */
  consume: (locationId: string, productId: string, qty: number) => void;
  /** Transfere quantidade de um local para outro. Retorna false se saldo insuficiente. */
  transfer: (fromLoc: string, toLoc: string, productId: string, qty: number) => boolean;
}

export const useStockStore = create<StockState>((set, get) => ({
  balances: load(),
  balanceOf: (loc, prod) =>
    get().balances.filter((b) => b.locationId === loc && b.productId === prod).reduce((s, b) => s + b.quantity, 0),
  entry: (loc, prod, qty) => {
    if (qty <= 0) return;
    const prev = get().balances;
    const idx = prev.findIndex((b) => b.locationId === loc && b.productId === prod);
    const isNew = idx < 0;
    const row: StockBalance = isNew
      ? { id: uid(), locationId: loc, productId: prod, quantity: qty }
      : { ...prev[idx], quantity: prev[idx].quantity + qty };
    const next = isNew ? [...prev, row] : prev.map((b, i) => (i === idx ? row : b));
    set({ balances: next });
    if (supabaseEnabled) syncRow(row, isNew, prev); else save(next);
  },
  consume: (loc, prod, qty) => {
    if (qty <= 0) return;
    const prev = get().balances;
    const idx = prev.findIndex((b) => b.locationId === loc && b.productId === prod);
    if (idx < 0) return;
    const row = { ...prev[idx], quantity: Math.max(0, prev[idx].quantity - qty) };
    const next = prev.map((b, i) => (i === idx ? row : b));
    set({ balances: next });
    if (supabaseEnabled) syncRow(row, false, prev); else save(next);
  },
  transfer: (from, to, prod, qty) => {
    if (qty <= 0) return false;
    const prev = get().balances;
    const fi = prev.findIndex((b) => b.locationId === from && b.productId === prod);
    if (fi < 0 || prev[fi].quantity < qty) return false;
    const fromRow = { ...prev[fi], quantity: prev[fi].quantity - qty };
    const ti = prev.findIndex((b) => b.locationId === to && b.productId === prod);
    const toIsNew = ti < 0;
    const toRow: StockBalance = toIsNew
      ? { id: uid(), locationId: to, productId: prod, quantity: qty }
      : { ...prev[ti], quantity: prev[ti].quantity + qty };
    let next = prev.map((b, i) => (i === fi ? fromRow : i === ti ? toRow : b));
    if (toIsNew) next = [...next, toRow];
    set({ balances: next });
    if (supabaseEnabled) {
      syncRow(fromRow, false, prev);
      syncRow(toRow, toIsNew, prev);
    } else {
      save(next);
    }
    return true;
  },
}));

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .then(({ data, error }) => {
      if (!error && data) {
        useStockStore.setState({ balances: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<StockBalance>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useStockStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useStockStore.setState({ balances: state.balances.filter((b) => b.id !== oldId) });
        return;
      }
      const row = fromSnakeRow<StockBalance>(payload.new as Record<string, unknown>);
      const exists = state.balances.some((b) => b.id === row.id);
      useStockStore.setState({
        balances: exists ? state.balances.map((b) => (b.id === row.id ? row : b)) : [...state.balances, row],
      });
    })
    .subscribe();
}
