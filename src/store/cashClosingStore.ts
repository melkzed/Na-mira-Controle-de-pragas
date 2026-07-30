import { create } from 'zustand';
import type { CashClosing } from '@/domain/types';
import { uid } from './createEntityStore';

/** Fechamento diário de caixa — trava o resumo do dia (entradas/saídas/saldo). */
const KEY = 'namira-cash-closings';

export type CashClosingInput = Omit<CashClosing, 'id' | 'orgId' | 'closedAt'>;

interface CashClosingState {
  closings: CashClosing[];
  close: (input: CashClosingInput) => CashClosing;
}

function load(): CashClosing[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CashClosing[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* cota — ignora */ } };

export const useCashClosingStore = create<CashClosingState>((set, get) => ({
  closings: load(),
  close: (input) => {
    const rec: CashClosing = { id: uid('cc'), orgId: 'org-namira', closedAt: new Date().toISOString(), ...input };
    const closings = [rec, ...get().closings];
    save(closings); set({ closings });
    return rec;
  },
}));
