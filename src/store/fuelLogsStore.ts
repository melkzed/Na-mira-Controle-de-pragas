import { create } from 'zustand';
import type { FuelLog } from '@/domain/types';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';

/** Controle de combustível × quilometragem do técnico (dual-mode — ver
 *  docs/ARCHITECTURE.md §3.1/§3.2). */
const KEY = 'namira-fuel-logs';
const TABLE = 'vehicle_fuel_logs';

function load(): FuelLog[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FuelLog[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: FuelLog[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = () => 'fuel-' + Math.random().toString(36).slice(2, 9);

export type FuelLogInput = Omit<FuelLog, 'id' | 'orgId'>;

interface FuelLogsState {
  logs: FuelLog[];
  add: (input: FuelLogInput) => FuelLog;
  remove: (id: string) => void;
}

export const useFuelLogsStore = create<FuelLogsState>((set, get) => ({
  logs: load(),
  add: (input) => {
    const log: FuelLog = { id: uid(), orgId: 'org-namira', ...input };
    const next = [log, ...get().logs];
    set({ logs: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(log as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ logs: get().logs.filter((l) => l.id !== log.id) });
            toast('Não foi possível registrar o abastecimento — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(next);
    }
    return log;
  },
  remove: (id) => {
    const prev = get().logs;
    const next = prev.filter((l) => l.id !== id);
    set({ logs: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ logs: prev });
            toast('Não foi possível excluir o registro — tente novamente.', { tone: 'danger' });
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
    .order('date', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        useFuelLogsStore.setState({ logs: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<FuelLog>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useFuelLogsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useFuelLogsStore.setState({ logs: state.logs.filter((l) => l.id !== oldId) });
        return;
      }
      const log = fromSnakeRow<FuelLog>(payload.new as Record<string, unknown>);
      const exists = state.logs.some((l) => l.id === log.id);
      useFuelLogsStore.setState({
        logs: exists ? state.logs.map((l) => (l.id === log.id ? log : l)) : [log, ...state.logs],
      });
    })
    .subscribe();
}
