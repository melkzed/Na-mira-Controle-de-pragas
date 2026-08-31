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
  /** Assíncrona de propósito: no modo Supabase só resolve depois que a
   *  inserção remota é confirmada, para que quem chama possa aguardar antes
   *  de criar registros dependentes (financeiro, agendamento…) — sem isso,
   *  a escrita otimista + fire-and-forget deixa uma corrida em que o
   *  dependente chega ao Postgres antes da OS existir, violando a FK
   *  (ex.: finance_entries_service_order_id_fkey). */
  add: (input: ServiceOrderInput) => Promise<ServiceOrder>;
  update: (id: string, patch: Partial<ServiceOrder>) => void;
}

export const useServiceOrdersStore = create<ServiceOrdersState>((set, get) => ({
  orders: load(),
  add: async (input) => {
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
      try {
        const { error } = await supabase.from(TABLE).insert(toSnakeRow(order as unknown as Record<string, unknown>));
        if (error) {
          set({ orders: get().orders.filter((o) => o.id !== order.id) });
          console.error('[serviceOrdersStore] Erro ao criar ordem:', (error as any).code, (error as any).message);
          toast(`Erro ao criar ordem: ${(error as any).message}`, { tone: 'danger' });
          throw error;
        }
      } catch (err: unknown) {
        set({ orders: get().orders.filter((o) => o.id !== order.id) });
        console.error('[serviceOrdersStore] Exceção ao criar ordem:', err);
        if (!(err instanceof Error && err.message.includes('code'))) {
          toast('Erro ao criar ordem de serviço — tente novamente.', { tone: 'danger' });
        }
        throw err;
      }
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
        .then(({ error }: any) => {
          if (error) {
            set({ orders: prev });
            console.error('[serviceOrdersStore] Erro ao atualizar ordem:', (error as any).code, (error as any).message);
            toast('Não foi possível salvar a ordem de serviço — tente novamente.', { tone: 'danger' });
          }
        })
        .catch((err: unknown) => {
          set({ orders: prev });
          console.error('[serviceOrdersStore] Exceção ao sincronizar ordem:', err);
          toast('Erro ao sincronizar ordem de serviço — tente novamente.', { tone: 'danger' });
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
    .then(({ data, error }: any) => {
      if (error) {
        console.error('[serviceOrdersStore] Erro ao carregar ordens:', (error as any).code, (error as any).message);
        return;
      }
      if (data) {
        useServiceOrdersStore.setState({ orders: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<ServiceOrder>(r)) });
      }
    })
    .catch((err: unknown) => {
      console.error('[serviceOrdersStore] Exceção ao carregar ordens:', err);
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload: any) => {
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
