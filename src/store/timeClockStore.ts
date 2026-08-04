import { create } from 'zustand';
import type { TimeClockEntry, TimeClockType } from '@/domain/types';

/** Controle de ponto (entrada/saída) do técnico — "Meu Ponto" no app de campo. */
const KEY = 'namira-time-clock';

function load(): TimeClockEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as TimeClockEntry[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: TimeClockEntry[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
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
    save(next);
    set({ entries: next });
    return entry;
  },
}));
