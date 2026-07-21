import { create } from 'zustand';

/**
 * Fábrica de stores reativas de entidades (CRUD) com persistência em
 * localStorage. Inicializa a partir do seed. Padrão pronto para ser trocado
 * por chamadas ao Supabase mantendo a mesma interface.
 */
export interface EntityStore<T extends { id: string }> {
  items: T[];
  add: (item: T) => void;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

export function createEntityStore<T extends { id: string }>(storageKey: string, seed: T[]) {
  const load = (): T[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as T[];
    } catch {
      /* ignora JSON inválido */
    }
    return seed;
  };
  const persist = (items: T[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* cota excedida — ignora */
    }
  };

  return create<EntityStore<T>>((set, get) => ({
    items: load(),
    add: (item) => {
      const next = [item, ...get().items];
      persist(next);
      set({ items: next });
    },
    update: (id, patch) => {
      const next = get().items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      persist(next);
      set({ items: next });
    },
    remove: (id) => {
      const next = get().items.filter((it) => it.id !== id);
      persist(next);
      set({ items: next });
    },
  }));
}

export function uid(prefix: string): string {
  return `${prefix}-` + Math.random().toString(36).slice(2, 9);
}
