import { create } from 'zustand';
import type { StockRequest } from '@/domain/types';
import { stockRequests as seed } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';

/** Solicitações de reposição de estoque (dual-mode — ver
 *  docs/ARCHITECTURE.md §3.1/§3.2). */
const KEY = 'namira-stock-requests';
const TABLE = 'stock_requests';

function load(): StockRequest[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StockRequest[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (v: StockRequest[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = () => 'sr-' + Math.random().toString(36).slice(2, 9);

export type StockRequestInput = Omit<StockRequest, 'id' | 'orgId' | 'status' | 'createdAt'>;

function syncUpdate(id: string, rollback: StockRequest[]) {
  if (!supabaseEnabled || !supabase) return;
  const updated = useStockRequestsStore.getState().requests.find((r) => r.id === id);
  if (!updated) return;
  supabase
    .from(TABLE)
    .update(toSnakeRow(updated as unknown as Record<string, unknown>))
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        useStockRequestsStore.setState({ requests: rollback });
        toast('Não foi possível salvar a solicitação — tente novamente.', { tone: 'danger' });
      }
    });
}

interface StockRequestsState {
  requests: StockRequest[];
  add: (input: StockRequestInput) => StockRequest;
  resolve: (id: string, status: 'atendida' | 'cancelada') => void;
  pendingCount: () => number;
}

export const useStockRequestsStore = create<StockRequestsState>((set, get) => ({
  requests: load(),
  add: (input) => {
    const req: StockRequest = { id: uid(), orgId: currentOrgId(), status: 'pendente', createdAt: new Date().toISOString(), ...input };
    const next = [req, ...get().requests];
    set({ requests: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(req as unknown as Record<string, unknown>, true))
        .then(({ error }) => {
          if (error) {
            set({ requests: get().requests.filter((r) => r.id !== req.id) });
            toast('Não foi possível criar a solicitação — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(next);
    }
    return req;
  },
  resolve: (id, status) => {
    const prev = get().requests;
    const next = prev.map((r) => (r.id === id ? { ...r, status, resolvedAt: new Date().toISOString() } : r));
    set({ requests: next });
    if (supabaseEnabled) syncUpdate(id, prev); else save(next);
  },
  pendingCount: () => get().requests.filter((r) => r.status === 'pendente').length,
}));

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useStockRequestsStore.setState({ requests: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<StockRequest>(r)) });
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useStockRequestsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useStockRequestsStore.setState({ requests: state.requests.filter((r) => r.id !== oldId) });
        return;
      }
      const req = fromSnakeRow<StockRequest>(payload.new as Record<string, unknown>);
      const exists = state.requests.some((r) => r.id === req.id);
      useStockRequestsStore.setState({
        requests: exists ? state.requests.map((r) => (r.id === req.id ? req : r)) : [req, ...state.requests],
      });
    })
    .subscribe();
}
