import { create } from 'zustand';
import type { CrmLead } from '@/domain/types';
import type { CrmStage } from '@/domain/enums';
import { crmLeads as seedLeads } from '@/infrastructure/seed/data';

/** Store reativa de leads do CRM (init do seed, persistida em localStorage). */
const STORAGE_KEY = 'namira-leads';

export type LeadInput = Omit<CrmLead, 'id' | 'orgId' | 'createdAt'>;

interface LeadsState {
  leads: CrmLead[];
  add: (input: LeadInput) => CrmLead;
  update: (id: string, patch: Partial<CrmLead>) => void;
  setStage: (id: string, stage: CrmStage) => void;
  remove: (id: string) => void;
}

function load(): CrmLead[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CrmLead[];
  } catch {
    /* ignora */
  }
  return seedLeads;
}
function persist(list: CrmLead[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignora */
  }
}
const uid = () => 'l-' + Math.random().toString(36).slice(2, 9);

export const useLeadsStore = create<LeadsState>((set, get) => ({
  leads: load(),
  add: (input) => {
    const lead: CrmLead = { id: uid(), orgId: 'org-namira', createdAt: new Date().toISOString(), ...input };
    const next = [lead, ...get().leads];
    persist(next);
    set({ leads: next });
    return lead;
  },
  update: (id, patch) => {
    const next = get().leads.map((l) => (l.id === id ? { ...l, ...patch } : l));
    persist(next);
    set({ leads: next });
  },
  setStage: (id, stage) => {
    const next = get().leads.map((l) => (l.id === id ? { ...l, stage } : l));
    persist(next);
    set({ leads: next });
  },
  remove: (id) => {
    const next = get().leads.filter((l) => l.id !== id);
    persist(next);
    set({ leads: next });
  },
}));
