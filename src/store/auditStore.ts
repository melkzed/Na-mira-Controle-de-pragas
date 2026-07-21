import { create } from 'zustand';
import { useAppStore } from './appStore';
import { auditSeed } from '@/infrastructure/seed/data';

/** Registro de auditoria: quem, quando e o que mudou (#13). */
export interface AuditEntry {
  id: string;
  userId?: string;
  userName?: string;
  action: string; // criação, alteração, exclusão, confirmação, reagendamento, inspeção...
  entityType: string; // agendamento, cliente, produto, armadilha, não conformidade...
  entityId?: string;
  description: string;
  createdAt: string;
}

const KEY = 'namira-audit';
const CAP = 300;

interface AuditState {
  entries: AuditEntry[];
  log: (e: Omit<AuditEntry, 'id' | 'createdAt' | 'userId' | 'userName'>) => void;
}

function load(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AuditEntry[];
  } catch {
    /* ignora */
  }
  return auditSeed;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  entries: load(),
  log: (e) => {
    const user = useAppStore.getState().currentUser;
    const entry: AuditEntry = {
      id: 'aud-' + Math.random().toString(36).slice(2, 9),
      createdAt: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name,
      ...e,
    };
    const entries = [entry, ...get().entries].slice(0, CAP);
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignora */ }
    set({ entries });
  },
}));

/** Atalho para registrar uma alteração de qualquer lugar da UI. */
export function logChange(action: string, entityType: string, description: string, entityId?: string) {
  useAuditStore.getState().log({ action, entityType, description, entityId });
}
