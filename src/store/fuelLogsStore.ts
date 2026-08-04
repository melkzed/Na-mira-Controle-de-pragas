import { create } from 'zustand';
import type { FuelLog } from '@/domain/types';

/** Controle de combustível × quilometragem do técnico (persistido). */
const KEY = 'namira-fuel-logs';

function load(): FuelLog[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FuelLog[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: FuelLog[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
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
    save(next);
    set({ logs: next });
    return log;
  },
  remove: (id) => {
    const next = get().logs.filter((l) => l.id !== id);
    save(next);
    set({ logs: next });
  },
}));
