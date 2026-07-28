import { create } from 'zustand';
import type { ServiceOrder } from '@/domain/types';
import { serviceOrders as seed } from '@/infrastructure/seed/data';

/** Ordens de serviço (persistidas). Fonte única para telas e relatórios. */
const KEY = 'namira-service-orders';

function load(): ServiceOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ServiceOrder[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (v: ServiceOrder[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
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
      orgId: 'org-namira',
      number: nextNumber,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input,
    };
    const next = [order, ...get().orders];
    save(next);
    set({ orders: next });
    return order;
  },
  update: (id, patch) => {
    const next = get().orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    save(next);
    set({ orders: next });
  },
}));
