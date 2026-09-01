import { create } from 'zustand';
import type { TrapDevice, TrapInspection, TrapStatus } from '@/domain/types';
import { trapDevices as seedTraps, trapInspections as seedInspections } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';

/** Store reativa do módulo de monitoramento de armadilhas (dual-mode — ver
 *  docs/ARCHITECTURE.md §3.1/§3.2). */
const TRAPS_KEY = 'namira-traps';
const INSP_KEY = 'namira-trap-inspections';
const TRAPS_TABLE = 'trap_devices';
const INSP_TABLE = 'trap_inspections';

export type TrapInput = Omit<TrapDevice, 'id' | 'orgId' | 'createdAt' | 'status'> & { status?: TrapStatus };
export type InspectionInput = Omit<TrapInspection, 'id'>;

interface TrapsState {
  traps: TrapDevice[];
  inspections: TrapInspection[];
  addTrap: (input: TrapInput) => TrapDevice;
  updateTrap: (id: string, patch: Partial<TrapDevice>) => void;
  removeTrap: (id: string) => void;
  restoreTrap: (trap: TrapDevice) => void;
  addInspection: (input: InspectionInput) => void;
}

function load<T>(key: string, seed: T[]): T[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (key: string, v: unknown) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = (p: string) => `${p}-` + Math.random().toString(36).slice(2, 9);

function syncTrapUpdate(id: string, rollback: TrapDevice[]) {
  if (!supabaseEnabled || !supabase) return;
  const updated = useTrapsStore.getState().traps.find((t) => t.id === id);
  if (!updated) return;
  supabase
    .from(TRAPS_TABLE)
    .update(toSnakeRow(updated as unknown as Record<string, unknown>))
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        useTrapsStore.setState({ traps: rollback });
        toast('Não foi possível salvar a armadilha — tente novamente.', { tone: 'danger' });
      }
    });
}

export const useTrapsStore = create<TrapsState>((set, get) => ({
  traps: load(TRAPS_KEY, seedTraps),
  inspections: load(INSP_KEY, seedInspections),
  addTrap: (input) => {
    const trap: TrapDevice = { id: uid('trap'), orgId: currentOrgId(), createdAt: new Date().toISOString(), status: input.status ?? 'ativa', ...input };
    const next = [...get().traps, trap];
    set({ traps: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TRAPS_TABLE)
        .insert(toSnakeRow(trap as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ traps: get().traps.filter((t) => t.id !== trap.id) });
            toast('Não foi possível cadastrar a armadilha — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(TRAPS_KEY, next);
    }
    return trap;
  },
  updateTrap: (id, patch) => {
    const prev = get().traps;
    const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ traps: next });
    if (supabaseEnabled) syncTrapUpdate(id, prev); else save(TRAPS_KEY, next);
  },
  removeTrap: (id) => {
    const prevTraps = get().traps;
    const prevInsp = get().inspections;
    const next = prevTraps.filter((t) => t.id !== id);
    const insp = prevInsp.filter((i) => i.trapId !== id);
    set({ traps: next, inspections: insp });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TRAPS_TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ traps: prevTraps, inspections: prevInsp });
            toast('Não foi possível excluir a armadilha — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(TRAPS_KEY, next);
      save(INSP_KEY, insp);
    }
  },
  restoreTrap: (trap) => {
    const next = [...get().traps, trap];
    set({ traps: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TRAPS_TABLE)
        .insert(toSnakeRow(trap as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ traps: get().traps.filter((t) => t.id !== trap.id) });
            toast('Não foi possível restaurar a armadilha — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(TRAPS_KEY, next);
    }
  },
  addInspection: (input) => {
    const inspection: TrapInspection = { id: uid('insp'), ...input };
    const next = [inspection, ...get().inspections];
    set({ inspections: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(INSP_TABLE)
        .insert(toSnakeRow(inspection as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ inspections: get().inspections.filter((i) => i.id !== inspection.id) });
            toast('Não foi possível registrar a inspeção — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(INSP_KEY, next);
    }
    // Sincroniza status da armadilha conforme a ação registrada.
    if (input.action && input.action !== 'nenhuma' && input.action !== 'reinstalada') {
      const status: TrapStatus = input.action === 'substituida' ? 'substituida' : input.action === 'retirada' ? 'retirada' : 'extraviada';
      get().updateTrap(input.trapId, { status });
    } else if (input.action === 'reinstalada') {
      get().updateTrap(input.trapId, { status: 'ativa' });
    }
  },
}));

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TRAPS_TABLE)
      .select('*')
      .then(({ data, error }) => {
        if (!error && data) {
          useTrapsStore.setState({ traps: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<TrapDevice>(r)) });
        }
      });
    supabase
      .from(INSP_TABLE)
      .select('*')
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useTrapsStore.setState({ inspections: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<TrapInspection>(r)) });
        }
      });
  });

  supabase
    .channel(`${TRAPS_TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TRAPS_TABLE }, (payload) => {
      const state = useTrapsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useTrapsStore.setState({ traps: state.traps.filter((t) => t.id !== oldId) });
        return;
      }
      const trap = fromSnakeRow<TrapDevice>(payload.new as Record<string, unknown>);
      const exists = state.traps.some((t) => t.id === trap.id);
      useTrapsStore.setState({
        traps: exists ? state.traps.map((t) => (t.id === trap.id ? trap : t)) : [...state.traps, trap],
      });
    })
    .subscribe();

  supabase
    .channel(`${INSP_TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: INSP_TABLE }, (payload) => {
      const state = useTrapsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useTrapsStore.setState({ inspections: state.inspections.filter((i) => i.id !== oldId) });
        return;
      }
      const inspection = fromSnakeRow<TrapInspection>(payload.new as Record<string, unknown>);
      const exists = state.inspections.some((i) => i.id === inspection.id);
      useTrapsStore.setState({
        inspections: exists ? state.inspections.map((i) => (i.id === inspection.id ? inspection : i)) : [inspection, ...state.inspections],
      });
    })
    .subscribe();
}
