import { create } from 'zustand';
import type { Appointment } from '@/domain/types';
import type { AppointmentStatus } from '@/domain/enums';
import { appointments as seedAppointments } from '@/infrastructure/seed/data';

/**
 * Store reativa de Agendamentos (inicializada a partir do seed, persistida em
 * localStorage). Mutações re-renderizam a Agenda. Pronta para trocar por
 * chamadas ao Supabase mantendo a mesma interface.
 *
 * Observação: os agendamentos do seed são relativos à data atual; por isso a
 * store NÃO é persistida entre dias (senão a agenda "envelheceria"). Só
 * persiste dentro da sessão do dia.
 */
const STORAGE_KEY = 'namira-appointments';
const STAMP_KEY = 'namira-appointments-day';

export type AppointmentInput = Omit<Appointment, 'id' | 'orgId' | 'products'> &
  Partial<Pick<Appointment, 'products'>>;

interface AppointmentsState {
  appointments: Appointment[];
  add: (input: AppointmentInput) => Appointment;
  update: (id: string, patch: Partial<Appointment>) => void;
  setStatus: (id: string, status: AppointmentStatus) => void;
  remove: (id: string) => void;
}

function today(): string {
  // Data local (não UTC) — .toISOString().slice(0,10) mostraria o dia
  // seguinte entre ~21h e meia-noite no fuso do Brasil (UTC-3).
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function load(): Appointment[] {
  try {
    if (localStorage.getItem(STAMP_KEY) === today()) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Appointment[];
    }
  } catch {
    /* ignora */
  }
  return seedAppointments;
}

function persist(list: Appointment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(STAMP_KEY, today());
  } catch {
    /* ignora */
  }
}

function uid(): string {
  return 'a-' + Math.random().toString(36).slice(2, 9);
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: load(),
  add: (input) => {
    const appt: Appointment = {
      id: uid(),
      orgId: 'org-namira',
      products: input.products ?? [],
      ...input,
    };
    const next = [...get().appointments, appt];
    persist(next);
    set({ appointments: next });
    return appt;
  },
  update: (id, patch) => {
    const next = get().appointments.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persist(next);
    set({ appointments: next });
  },
  setStatus: (id, status) => {
    const next = get().appointments.map((a) => (a.id === id ? { ...a, status } : a));
    persist(next);
    set({ appointments: next });
  },
  remove: (id) => {
    const next = get().appointments.filter((a) => a.id !== id);
    persist(next);
    set({ appointments: next });
  },
}));
