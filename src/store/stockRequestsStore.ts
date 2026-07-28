import { create } from 'zustand';
import type { StockRequest } from '@/domain/types';
import { stockRequests as seed } from '@/infrastructure/seed/data';

/** Solicitações de reposição de estoque (pendências para o setor de estoque). */
const KEY = 'namira-stock-requests';

function load(): StockRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StockRequest[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (v: StockRequest[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
const uid = () => 'sr-' + Math.random().toString(36).slice(2, 9);

export type StockRequestInput = Omit<StockRequest, 'id' | 'orgId' | 'status' | 'createdAt'>;

interface StockRequestsState {
  requests: StockRequest[];
  add: (input: StockRequestInput) => StockRequest;
  resolve: (id: string, status: 'atendida' | 'cancelada') => void;
  pendingCount: () => number;
}

export const useStockRequestsStore = create<StockRequestsState>((set, get) => ({
  requests: load(),
  add: (input) => {
    const req: StockRequest = { id: uid(), orgId: 'org-namira', status: 'pendente', createdAt: new Date().toISOString(), ...input };
    const next = [req, ...get().requests];
    save(next);
    set({ requests: next });
    return req;
  },
  resolve: (id, status) => {
    const next = get().requests.map((r) => (r.id === id ? { ...r, status, resolvedAt: new Date().toISOString() } : r));
    save(next);
    set({ requests: next });
  },
  pendingCount: () => get().requests.filter((r) => r.status === 'pendente').length,
}));
