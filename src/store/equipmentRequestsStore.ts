import { create } from 'zustand';
import type { EquipmentRequest } from '@/domain/types';
import { uid } from './createEntityStore';

/** Solicitações de ferramentas/equipamentos feitas pelo técnico no app de campo,
 *  aprovadas/negadas no Módulo de Técnicos. */
const KEY = 'namira-equipment-requests';

export type EquipmentRequestInput = { technicianId: string; equipmentId: string; note?: string; expectedReturnAt?: string };

interface EquipmentRequestsState {
  requests: EquipmentRequest[];
  add: (input: EquipmentRequestInput) => void;
  resolve: (id: string, status: 'aprovada' | 'negada', resolvedBy?: string) => void;
}

function load(): EquipmentRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EquipmentRequest[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* cota — ignora */ } };

export const useEquipmentRequestsStore = create<EquipmentRequestsState>((set, get) => ({
  requests: load(),
  add: (input) => {
    const req: EquipmentRequest = {
      id: uid('eqreq'), orgId: 'org-namira', status: 'pendente', createdAt: new Date().toISOString(), ...input,
    };
    const requests = [req, ...get().requests];
    save(requests); set({ requests });
  },
  resolve: (id, status, resolvedBy) => {
    const requests = get().requests.map((r) => (r.id === id ? { ...r, status, resolvedAt: new Date().toISOString(), resolvedBy } : r));
    save(requests); set({ requests });
  },
}));
