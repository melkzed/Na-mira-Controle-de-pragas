import { create } from 'zustand';
import type { EquipmentRequest } from '@/domain/types';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';
import { uid } from './createEntityStore';

/** Solicitações de ferramentas/equipamentos feitas pelo técnico no app de
 *  campo, aprovadas/negadas no Módulo de Técnicos (dual-mode — ver
 *  docs/ARCHITECTURE.md §3.1/§3.2). */
const KEY = 'namira-equipment-requests';
const TABLE = 'equipment_requests';

export type EquipmentRequestInput = { technicianId: string; equipmentId: string; note?: string; expectedReturnAt?: string };

interface EquipmentRequestsState {
  requests: EquipmentRequest[];
  add: (input: EquipmentRequestInput) => void;
  resolve: (id: string, status: 'aprovada' | 'negada', resolvedBy?: string) => void;
}

function load(): EquipmentRequest[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EquipmentRequest[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: EquipmentRequest[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* cota — ignora */
  }
};

function syncUpdate(id: string, rollback: EquipmentRequest[]) {
  if (!supabaseEnabled || !supabase) return;
  const updated = useEquipmentRequestsStore.getState().requests.find((r) => r.id === id);
  if (!updated) return;
  supabase
    .from(TABLE)
    .update(toSnakeRow(updated as unknown as Record<string, unknown>))
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        useEquipmentRequestsStore.setState({ requests: rollback });
        toast('Não foi possível salvar a solicitação — tente novamente.', { tone: 'danger' });
      }
    });
}

export const useEquipmentRequestsStore = create<EquipmentRequestsState>((set, get) => ({
  requests: load(),
  add: (input) => {
    const req: EquipmentRequest = {
      id: uid('eqreq'), orgId: currentOrgId(), status: 'pendente', createdAt: new Date().toISOString(), ...input,
    };
    const requests = [req, ...get().requests];
    set({ requests });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(req as unknown as Record<string, unknown>))
        .then(({ error }) => {
          if (error) {
            set({ requests: get().requests.filter((r) => r.id !== req.id) });
            toast('Não foi possível criar a solicitação — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(requests);
    }
  },
  resolve: (id, status, resolvedBy) => {
    const prev = get().requests;
    const requests = prev.map((r) => (r.id === id ? { ...r, status, resolvedAt: new Date().toISOString(), resolvedBy } : r));
    set({ requests });
    if (supabaseEnabled) syncUpdate(id, prev); else save(requests);
  },
}));

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        useEquipmentRequestsStore.setState({ requests: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<EquipmentRequest>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useEquipmentRequestsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useEquipmentRequestsStore.setState({ requests: state.requests.filter((r) => r.id !== oldId) });
        return;
      }
      const req = fromSnakeRow<EquipmentRequest>(payload.new as Record<string, unknown>);
      const exists = state.requests.some((r) => r.id === req.id);
      useEquipmentRequestsStore.setState({
        requests: exists ? state.requests.map((r) => (r.id === req.id ? req : r)) : [req, ...state.requests],
      });
    })
    .subscribe();
}
