import { create } from 'zustand';
import type { BankTransaction } from '@/domain/types';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';
import { uid } from './createEntityStore';

/**
 * Extrato eletrônico das contas bancárias (dual-mode — ver
 * docs/ARCHITECTURE.md §3.1/§3.2) — depósitos, transferências,
 * pagamentos/recebimentos e conciliação. O saldo de cada conta é sempre
 * calculado a partir do saldo inicial + estas movimentações (nunca guardado
 * de forma denormalizada, para não divergir).
 */
const KEY = 'namira-bank-transactions';
const TABLE = 'bank_transactions';

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
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BankTransaction[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: BankTransaction[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* cota — ignora */
  }
};

export const useBankTransactionsStore = create<BankTransactionsState>((set, get) => ({
  transactions: load(),
  add: (input) => {
    const t: BankTransaction = { id: uid('btx'), orgId: currentOrgId(), reconciled: false, ...input };
    const transactions = [t, ...get().transactions];
    set({ transactions });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(t as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ transactions: get().transactions.filter((tx) => tx.id !== t.id) });
            toast('Não foi possível registrar a movimentação — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(transactions);
    }
    return t;
  },
  toggleReconciled: (id) => {
    const prev = get().transactions;
    const transactions = prev.map((t) => (t.id === id ? { ...t, reconciled: !t.reconciled } : t));
    set({ transactions });
    if (supabaseEnabled && supabase) {
      const updated = transactions.find((t) => t.id === id);
      if (!updated) return;
      supabase
        .from(TABLE)
        .update(toSnakeRow(updated as unknown as Record<string, unknown>))
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ transactions: prev });
            toast('Não foi possível salvar a conciliação — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(transactions);
    }
  },
  remove: (id) => {
    const prev = get().transactions;
    const transactions = prev.filter((t) => t.id !== id);
    set({ transactions });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ transactions: prev });
            toast('Não foi possível excluir a movimentação — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(transactions);
    }
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

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TABLE)
      .select('*')
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useBankTransactionsStore.setState({ transactions: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<BankTransaction>(r)) });
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useBankTransactionsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useBankTransactionsStore.setState({ transactions: state.transactions.filter((t) => t.id !== oldId) });
        return;
      }
      const t = fromSnakeRow<BankTransaction>(payload.new as Record<string, unknown>);
      const exists = state.transactions.some((tx) => tx.id === t.id);
      useBankTransactionsStore.setState({
        transactions: exists ? state.transactions.map((tx) => (tx.id === t.id ? t : tx)) : [t, ...state.transactions],
      });
    })
    .subscribe();
}
