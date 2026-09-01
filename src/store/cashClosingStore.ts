import { create } from 'zustand';
import type { CashClosing } from '@/domain/types';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';
import { uid } from './createEntityStore';

/** Fechamento diário de caixa (dual-mode — ver docs/ARCHITECTURE.md
 *  §3.1/§3.2) — trava o resumo do dia (entradas/saídas/saldo). */
const KEY = 'namira-cash-closings';
const TABLE = 'cash_closings';

export type CashClosingInput = Omit<CashClosing, 'id' | 'orgId' | 'closedAt'>;

interface CashClosingState {
  closings: CashClosing[];
  close: (input: CashClosingInput) => CashClosing;
}

function load(): CashClosing[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CashClosing[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: CashClosing[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* cota — ignora */
  }
};

export const useCashClosingStore = create<CashClosingState>((set, get) => ({
  closings: load(),
  close: (input) => {
    const rec: CashClosing = { id: uid('cc'), orgId: currentOrgId(), closedAt: new Date().toISOString(), ...input };
    const closings = [rec, ...get().closings];
    set({ closings });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(rec as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ closings: get().closings.filter((c) => c.id !== rec.id) });
            toast('Não foi possível registrar o fechamento de caixa — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(closings);
    }
    return rec;
  },
}));

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TABLE)
      .select('*')
      .order('closed_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useCashClosingStore.setState({ closings: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<CashClosing>(r)) });
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useCashClosingStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useCashClosingStore.setState({ closings: state.closings.filter((c) => c.id !== oldId) });
        return;
      }
      const rec = fromSnakeRow<CashClosing>(payload.new as Record<string, unknown>);
      const exists = state.closings.some((c) => c.id === rec.id);
      useCashClosingStore.setState({
        closings: exists ? state.closings.map((c) => (c.id === rec.id ? rec : c)) : [rec, ...state.closings],
      });
    })
    .subscribe();
}
