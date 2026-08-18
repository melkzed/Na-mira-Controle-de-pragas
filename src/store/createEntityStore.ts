import { create } from 'zustand';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { toast } from '@/store/toastStore';

/**
 * Fábrica de stores reativas de entidades (CRUD) — usada pelos ~16 módulos
 * de cadastro mais simples (usuários, produtos, equipamentos, financeiro…).
 *
 * Modo standalone (sem Supabase): persistência em localStorage, inicializada
 * a partir do seed — comportamento inalterado desde antes da Fase 2.
 *
 * Modo Supabase (dado real e compartilhado): escrita otimista + Realtime,
 * mesmo padrão de customersStore.ts/appointmentsStore.ts (ver
 * docs/ARCHITECTURE.md §3.1), só que genérico — a conversão de campos usa
 * `caseConvert` (camelCase ↔ snake_case automático) em vez de um
 * toRow/fromRow manual por módulo, já que estas entidades são todas objetos
 * "chatos" (sem relação aninhada especial). Exige a tabela ter as mesmas
 * colunas dos campos do domínio (snake_case) — ver
 * db/migrate_entitystores_realtime.sql.
 */
export interface EntityStore<T extends { id: string }> {
  items: T[];
  add: (item: T) => void;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

export function createEntityStore<T extends { id: string }>(storageKey: string, seed: T[], table: string) {
  const load = (): T[] => {
    if (supabaseEnabled) return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as T[];
    } catch {
      /* ignora JSON inválido */
    }
    return seed;
  };
  const persist = (items: T[]) => {
    if (supabaseEnabled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* cota excedida — ignora */
    }
  };
  const failToast = () => toast('Não foi possível salvar — tente novamente.', { tone: 'danger' });

  const useStore = create<EntityStore<T>>((set, get) => ({
    items: load(),
    add: (item) => {
      const next = [item, ...get().items];
      set({ items: next });
      if (supabaseEnabled && supabase) {
        supabase
          .from(table)
          .insert(toSnakeRow(item as unknown as Record<string, unknown>))
          .then(({ error }) => {
            if (error) {
              set({ items: get().items.filter((it) => it.id !== item.id) });
              failToast();
            }
          });
      } else {
        persist(next);
      }
    },
    update: (id, patch) => {
      const prev = get().items;
      const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      set({ items: next });
      if (supabaseEnabled && supabase) {
        const updated = next.find((it) => it.id === id);
        if (!updated) return;
        supabase
          .from(table)
          .update(toSnakeRow(updated as unknown as Record<string, unknown>))
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              set({ items: prev });
              failToast();
            }
          });
      } else {
        persist(next);
      }
    },
    remove: (id) => {
      const prev = get().items;
      const next = prev.filter((it) => it.id !== id);
      set({ items: next });
      if (supabaseEnabled && supabase) {
        supabase
          .from(table)
          .delete()
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              set({ items: prev });
              toast('Não foi possível excluir — tente novamente.', { tone: 'danger' });
            }
          });
      } else {
        persist(next);
      }
    },
  }));

  if (supabaseEnabled && supabase) {
    supabase
      .from(table)
      .select('*')
      .then(({ data, error }) => {
        if (!error && data) {
          useStore.setState({ items: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<T>(r)) });
        }
      });

    supabase
      .channel(`${table}-sync`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const state = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string } | null)?.id;
          if (oldId) useStore.setState({ items: state.items.filter((it) => it.id !== oldId) });
          return;
        }
        const item = fromSnakeRow<T>(payload.new as Record<string, unknown>);
        const exists = state.items.some((it) => it.id === item.id);
        useStore.setState({
          items: exists ? state.items.map((it) => (it.id === item.id ? item : it)) : [item, ...state.items],
        });
      })
      .subscribe();
  }

  return useStore;
}

export function uid(prefix: string): string {
  return `${prefix}-` + Math.random().toString(36).slice(2, 9);
}
