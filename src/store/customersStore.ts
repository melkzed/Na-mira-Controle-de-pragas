import { create } from 'zustand';
import type { Customer } from '@/domain/types';
import { customers as seedCustomers } from '@/infrastructure/seed/data';

/**
 * Store reativa de Clientes.
 * Fonte de verdade em runtime (inicializada a partir do seed) + persistência
 * em localStorage. Mutações re-renderizam a UI — padrão pronto para ser trocado
 * por chamadas ao Supabase mantendo a mesma interface.
 */

const STORAGE_KEY = 'namira-customers';

export type CustomerInput = Omit<Customer, 'id' | 'orgId' | 'createdAt' | 'isActive'> &
  Partial<Pick<Customer, 'isActive'>>;

interface CustomersState {
  customers: Customer[];
  add: (input: CustomerInput) => Customer;
  update: (id: string, patch: Partial<Customer>) => void;
  remove: (id: string) => void;
  reset: () => void;
}

function load(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Customer[];
  } catch {
    /* ignora JSON inválido */
  }
  return seedCustomers;
}

function persist(customers: Customer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  } catch {
    /* cota excedida — ignora */
  }
}

function uid(): string {
  return 'c-' + Math.random().toString(36).slice(2, 9);
}

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: load(),
  add: (input) => {
    const customer: Customer = {
      id: uid(),
      orgId: 'org-namira',
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      ...input,
      tags: input.tags ?? [],
    };
    const next = [customer, ...get().customers];
    persist(next);
    set({ customers: next });
    return customer;
  },
  update: (id, patch) => {
    const next = get().customers.map((c) => (c.id === id ? { ...c, ...patch } : c));
    persist(next);
    set({ customers: next });
  },
  remove: (id) => {
    const next = get().customers.filter((c) => c.id !== id);
    persist(next);
    set({ customers: next });
  },
  reset: () => {
    persist(seedCustomers);
    set({ customers: seedCustomers });
  },
}));
