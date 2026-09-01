import { create } from 'zustand';
import type { CrmLead } from '@/domain/types';
import type { CrmStage } from '@/domain/enums';
import { crmLeads as seedLeads } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';

/** Store reativa de leads do CRM (dual-mode — ver docs/ARCHITECTURE.md §3.1/§3.2). */
const STORAGE_KEY = 'namira-leads';
const TABLE = 'crm_leads';

export type LeadInput = Omit<CrmLead, 'id' | 'orgId' | 'createdAt'>;

interface LeadsState {
  leads: CrmLead[];
  add: (input: LeadInput) => CrmLead;
  update: (id: string, patch: Partial<CrmLead>) => void;
  setStage: (id: string, stage: CrmStage) => void;
  remove: (id: string) => void;
}

function load(): CrmLead[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CrmLead[];
  } catch {
    /* ignora */
  }
  return seedLeads;
}
function persist(list: CrmLead[]) {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignora */
  }
}
const uid = () => 'l-' + Math.random().toString(36).slice(2, 9);

function syncUpdate(id: string, rollback: CrmLead[]) {
  if (!supabaseEnabled || !supabase) return;
  const updated = useLeadsStore.getState().leads.find((l) => l.id === id);
  if (!updated) return;
  supabase
    .from(TABLE)
    .update(toSnakeRow(updated as unknown as Record<string, unknown>))
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        useLeadsStore.setState({ leads: rollback });
        toast('Não foi possível salvar o lead — tente novamente.', { tone: 'danger' });
      }
    });
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  leads: load(),
  add: (input) => {
    const lead: CrmLead = { id: uid(), orgId: currentOrgId(), createdAt: new Date().toISOString(), ...input };
    const next = [lead, ...get().leads];
    set({ leads: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(lead as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ leads: get().leads.filter((l) => l.id !== lead.id) });
            toast('Não foi possível criar o lead — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      persist(next);
    }
    return lead;
  },
  update: (id, patch) => {
    const prev = get().leads;
    const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
    set({ leads: next });
    if (supabaseEnabled) syncUpdate(id, prev); else persist(next);
  },
  setStage: (id, stage) => {
    const prev = get().leads;
    const next = prev.map((l) => (l.id === id ? { ...l, stage } : l));
    set({ leads: next });
    if (supabaseEnabled) syncUpdate(id, prev); else persist(next);
  },
  remove: (id) => {
    const prev = get().leads;
    const next = prev.filter((l) => l.id !== id);
    set({ leads: next });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ leads: prev });
            toast('Não foi possível excluir o lead — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      persist(next);
    }
  },
}));

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useLeadsStore.setState({ leads: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<CrmLead>(r)) });
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useLeadsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useLeadsStore.setState({ leads: state.leads.filter((l) => l.id !== oldId) });
        return;
      }
      const lead = fromSnakeRow<CrmLead>(payload.new as Record<string, unknown>);
      const exists = state.leads.some((l) => l.id === lead.id);
      useLeadsStore.setState({
        leads: exists ? state.leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...state.leads],
      });
    })
    .subscribe();
}
