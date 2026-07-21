import { create } from 'zustand';
import type { TrapDevice, TrapInspection, TrapStatus } from '@/domain/types';
import { trapDevices as seedTraps, trapInspections as seedInspections } from '@/infrastructure/seed/data';

/** Store reativa do módulo de monitoramento de armadilhas (persistida). */
const TRAPS_KEY = 'namira-traps';
const INSP_KEY = 'namira-trap-inspections';

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
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* ignora */
  }
  return seed;
}
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignora */ } };
const uid = (p: string) => `${p}-` + Math.random().toString(36).slice(2, 9);

export const useTrapsStore = create<TrapsState>((set, get) => ({
  traps: load(TRAPS_KEY, seedTraps),
  inspections: load(INSP_KEY, seedInspections),
  addTrap: (input) => {
    const trap: TrapDevice = { id: uid('trap'), orgId: 'org-namira', createdAt: new Date().toISOString(), status: input.status ?? 'ativa', ...input };
    const next = [...get().traps, trap];
    save(TRAPS_KEY, next);
    set({ traps: next });
    return trap;
  },
  updateTrap: (id, patch) => {
    const next = get().traps.map((t) => (t.id === id ? { ...t, ...patch } : t));
    save(TRAPS_KEY, next);
    set({ traps: next });
  },
  removeTrap: (id) => {
    const next = get().traps.filter((t) => t.id !== id);
    const insp = get().inspections.filter((i) => i.trapId !== id);
    save(TRAPS_KEY, next); save(INSP_KEY, insp);
    set({ traps: next, inspections: insp });
  },
  restoreTrap: (trap) => {
    const next = [...get().traps, trap];
    save(TRAPS_KEY, next);
    set({ traps: next });
  },
  addInspection: (input) => {
    const inspection: TrapInspection = { id: uid('insp'), ...input };
    const next = [inspection, ...get().inspections];
    save(INSP_KEY, next);
    set({ inspections: next });
    // Sincroniza status da armadilha conforme a ação registrada.
    if (input.action && input.action !== 'nenhuma' && input.action !== 'reinstalada') {
      const status: TrapStatus = input.action === 'substituida' ? 'substituida' : input.action === 'retirada' ? 'retirada' : 'extraviada';
      get().updateTrap(input.trapId, { status });
    } else if (input.action === 'reinstalada') {
      get().updateTrap(input.trapId, { status: 'ativa' });
    }
  },
}));
