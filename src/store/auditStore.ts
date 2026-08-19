import { create } from 'zustand';
import { currentOrgId, useAppStore } from './appStore';
import { auditSeed } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';

/** Registro de auditoria: quem, quando e o que mudou (#13). Dual-mode (ver
 *  docs/ARCHITECTURE.md §3.1/§3.2) — só insere, nunca edita/remove. */
export interface AuditEntry {
  id: string;
  orgId: string;
  userId?: string;
  userName?: string;
  action: string; // criação, alteração, exclusão, confirmação, reagendamento, inspeção...
  entityType: string; // agendamento, cliente, produto, armadilha, não conformidade...
  entityId?: string;
  description: string;
  createdAt: string;
}

const KEY = 'namira-audit';
const TABLE = 'audit_logs';
const CAP = 300;

interface AuditState {
  entries: AuditEntry[];
  log: (e: Omit<AuditEntry, 'id' | 'orgId' | 'createdAt' | 'userId' | 'userName'>) => void;
}

function load(): AuditEntry[] {
  if (supabaseEnabled) return [];
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
      orgId: currentOrgId(),
      createdAt: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name,
      ...e,
    };
    const entries = [entry, ...get().entries].slice(0, supabaseEnabled ? undefined : CAP);
    set({ entries });
    if (supabaseEnabled && supabase) {
      supabase
        .from(TABLE)
        .insert(toSnakeRow(entry as unknown as Record<string, unknown>))
        .then(({ error }) => {
          // Falha silenciosa de propósito — auditoria não deve travar/avisar
          // sobre a ação real que o usuário estava tentando fazer.
          if (error) set({ entries: get().entries.filter((it) => it.id !== entry.id) });
        });
    } else {
      try {
        localStorage.setItem(KEY, JSON.stringify(entries));
      } catch {
        /* ignora */
      }
    }
  },
}));

/** Atalho para registrar uma alteração de qualquer lugar da UI. */
export function logChange(action: string, entityType: string, description: string, entityId?: string) {
  useAuditStore.getState().log({ action, entityType, description, entityId });
}

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(CAP)
    .then(({ data, error }) => {
      if (!error && data) {
        useAuditStore.setState({ entries: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<AuditEntry>(r)) });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
      const entry = fromSnakeRow<AuditEntry>(payload.new as Record<string, unknown>);
      const state = useAuditStore.getState();
      if (state.entries.some((e) => e.id === entry.id)) return;
      useAuditStore.setState({ entries: [entry, ...state.entries] });
    })
    .subscribe();
}
