import { create } from 'zustand';
import type { TimeClockEntry, TimeClockType } from '@/domain/types';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';

/** Controle de ponto (entrada/saída) do técnico — "Meu Ponto" no app de
 *  campo (dual-mode — ver docs/ARCHITECTURE.md §3.1/§3.2). */
const KEY = 'namira-time-clock';
const TABLE = 'time_clock_entries';

function load(): TimeClockEntry[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as TimeClockEntry[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: TimeClockEntry[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};
const uid = () => 'ponto-' + Math.random().toString(36).slice(2, 9);

interface TimeClockState {
  entries: TimeClockEntry[];
  clock: (technicianId: string, type: TimeClockType) => TimeClockEntry;
}

export const useTimeClockStore = create<TimeClockState>((set, get) => ({
  entries: load(),
  clock: (technicianId, type) => {
    const entry: TimeClockEntry = { id: uid(), orgId: 'org-namira', technicianId, type, timestamp: new Date().toISOString() };
    const next = [entry, ...get().entries];
    set({ entries: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(entry as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ entries: get().entries.filter((e) => e.id !== entry.id) });
            toast('Não foi possível registrar o ponto — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(next);
    }
    return entry;
  },
}));

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('timestamp', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        useTimeClockStore.setState({ entries: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<TimeClockEntry>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useTimeClockStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useTimeClockStore.setState({ entries: state.entries.filter((e) => e.id !== oldId) });
        return;
      }
      const entry = fromSnakeRow<TimeClockEntry>(payload.new as Record<string, unknown>);
      const exists = state.entries.some((e) => e.id === entry.id);
      useTimeClockStore.setState({
        entries: exists ? state.entries.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...state.entries],
      });
    })
    .subscribe();
}
