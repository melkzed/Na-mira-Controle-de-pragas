import { create } from 'zustand';
import type { ServiceOrder } from '@/domain/types';
import { serviceOrders as seed } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';

/**
 * Ordens de serviço (dual-mode — ver docs/ARCHITECTURE.md §3.1/§3.2).
 * Numeração sequencial (`number`) continua calculada no cliente a partir do
 * maior número já carregado — por isso é uma store bespoke, não a fábrica
 * genérica `createEntityStore` (que não tem essa regra).
 */
const KEY = 'namira-service-orders';
const TABLE = 'service_orders';

function load(): ServiceOrder[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ServiceOrder[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (v: ServiceOrder[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = () => 'so-' + Math.random().toString(36).slice(2, 9);

export type ServiceOrderInput = Omit<ServiceOrder, 'id' | 'orgId' | 'number' | 'createdAt'> & { createdAt?: string };

interface ServiceOrdersState {
  orders: ServiceOrder[];
  add: (input: ServiceOrderInput) => ServiceOrder;
  update: (id: string, patch: Partial<ServiceOrder>) => void;
}

export const useServiceOrdersStore = create<ServiceOrdersState>((set, get) => ({
  orders: load(),
  add: (input) => {
    const nextNumber = get().orders.reduce((max, o) => Math.max(max, o.number), 1000) + 1;
    const order: ServiceOrder = {
      id: uid(),
      orgId: currentOrgId(),
      number: nextNumber,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input,
    };
    const next = [order, ...get().orders];
    set({ orders: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(order as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ orders: get().orders.filter((o) => o.id !== order.id) });
            toast('Não foi possível criar a ordem de serviço — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(next);
    }
    return order;
  },
  update: (id, patch) => {
    const prev = get().orders;
    const next = prev.map((o) => (o.id === id ? { ...o, ...patch } : o));
    set({ orders: next });
    if (supabaseEnabled && supabase) {
      const updated = next.find((o) => o.id === id);
      if (!updated) return;
      supabase
        .from(TABLE)
        .update(toSnakeRow(updated as unknown as Record<string, unknown>))
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ orders: prev });
            toast('Não foi possível salvar a ordem de serviço — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(next);
    }
  },
}));

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('number', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        useServiceOrdersStore.setState({ orders: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<ServiceOrder>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useServiceOrdersStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useServiceOrdersStore.setState({ orders: state.orders.filter((o) => o.id !== oldId) });
        return;
      }
      const order = fromSnakeRow<ServiceOrder>(payload.new as Record<string, unknown>);
      const exists = state.orders.some((o) => o.id === order.id);
      useServiceOrdersStore.setState({
        orders: exists ? state.orders.map((o) => (o.id === order.id ? order : o)) : [order, ...state.orders],
      });
    })
    .subscribe();
}
