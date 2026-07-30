import { create } from 'zustand';
import type { BankTransaction } from '@/domain/types';
import { uid } from './createEntityStore';

/**
 * Extrato eletrônico das contas bancárias — depósitos, transferências,
 * pagamentos/recebimentos e conciliação. O saldo de cada conta é sempre
 * calculado a partir do saldo inicial + estas movimentações (nunca guardado
 * de forma denormalizada, para não divergir).
 */
const KEY = 'namira-bank-transactions';

export type BankTransactionInput = Omit<BankTransaction, 'id' | 'orgId' | 'reconciled'>;

/** Sinal de cada tipo de movimentação no cálculo do saldo. */
export const TRANSACTION_SIGN: Record<BankTransaction['type'], 1 | -1> = {
  deposito: 1,
  transferencia_entrada: 1,
  recebimento: 1,
  transferencia_saida: -1,
  pagamento: -1,
  estorno: 1,
};

interface BankTransactionsState {
  transactions: BankTransaction[];
  add: (input: BankTransactionInput) => BankTransaction;
  toggleReconciled: (id: string) => void;
  remove: (id: string) => void;
}

function load(): BankTransaction[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BankTransaction[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* cota — ignora */ } };

export const useBankTransactionsStore = create<BankTransactionsState>((set, get) => ({
  transactions: load(),
  add: (input) => {
    const t: BankTransaction = { id: uid('btx'), orgId: 'org-namira', reconciled: false, ...input };
    const transactions = [t, ...get().transactions];
    save(transactions); set({ transactions });
    return t;
  },
  toggleReconciled: (id) => {
    const transactions = get().transactions.map((t) => (t.id === id ? { ...t, reconciled: !t.reconciled } : t));
    save(transactions); set({ transactions });
  },
  remove: (id) => {
    const transactions = get().transactions.filter((t) => t.id !== id);
    save(transactions); set({ transactions });
  },
}));

/** Saldo atual da conta (saldo inicial + movimentações). */
export function accountBalance(accountId: string, openingBalance: number): number {
  return useBankTransactionsStore.getState().transactions
    .filter((t) => t.accountId === accountId)
    .reduce((s, t) => s + t.amount * TRANSACTION_SIGN[t.type], openingBalance);
}

/** Saldo conciliado (apenas movimentações já confirmadas no extrato do banco). */
export function accountReconciledBalance(accountId: string, openingBalance: number): number {
  return useBankTransactionsStore.getState().transactions
    .filter((t) => t.accountId === accountId && t.reconciled)
    .reduce((s, t) => s + t.amount * TRANSACTION_SIGN[t.type], openingBalance);
}
