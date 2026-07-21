import { create } from 'zustand';
import type { StockBalance } from '@/domain/types';
import { stockBalances as seedBalances } from '@/infrastructure/seed/data';

/** Estoque mutável (persistido). Entradas e transferências entre locais. */
const KEY = 'namira-stock';

function load(): StockBalance[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StockBalance[];
  } catch {
    /* ignora */
  }
  return seedBalances.map((b) => ({ ...b }));
}
const save = (v: StockBalance[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
const uid = () => 'sb-' + Math.random().toString(36).slice(2, 9);

interface StockState {
  balances: StockBalance[];
  /** Saldo (somado) de um produto em um local. */
  balanceOf: (locationId: string, productId: string) => number;
  /** Entrada de estoque (compra/ajuste) em um local. */
  entry: (locationId: string, productId: string, qty: number) => void;
  /** Transfere quantidade de um local para outro. Retorna false se saldo insuficiente. */
  transfer: (fromLoc: string, toLoc: string, productId: string, qty: number) => boolean;
}

export const useStockStore = create<StockState>((set, get) => ({
  balances: load(),
  balanceOf: (loc, prod) =>
    get().balances.filter((b) => b.locationId === loc && b.productId === prod).reduce((s, b) => s + b.quantity, 0),
  entry: (loc, prod, qty) => {
    if (qty <= 0) return;
    const bals = get().balances;
    const idx = bals.findIndex((b) => b.locationId === loc && b.productId === prod);
    const next = idx >= 0
      ? bals.map((b, i) => (i === idx ? { ...b, quantity: b.quantity + qty } : b))
      : [...bals, { id: uid(), locationId: loc, productId: prod, quantity: qty }];
    save(next);
    set({ balances: next });
  },
  transfer: (from, to, prod, qty) => {
    if (qty <= 0) return false;
    const bals = [...get().balances];
    const fi = bals.findIndex((b) => b.locationId === from && b.productId === prod);
    if (fi < 0 || bals[fi].quantity < qty) return false;
    bals[fi] = { ...bals[fi], quantity: bals[fi].quantity - qty };
    const ti = bals.findIndex((b) => b.locationId === to && b.productId === prod);
    if (ti >= 0) bals[ti] = { ...bals[ti], quantity: bals[ti].quantity + qty };
    else bals.push({ id: uid(), locationId: to, productId: prod, quantity: qty });
    save(bals);
    set({ balances: bals });
    return true;
  },
}));
