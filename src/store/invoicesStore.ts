import { create } from 'zustand';
import type { Invoice } from '@/domain/types';
import { invoicesSeed } from '@/infrastructure/seed/data';
import { getOrgProfile } from '@/store/orgProfileStore';
import { computeTaxes, type TaxConfig } from '@/application/fiscal/tax';
import { getProvider } from '@/application/fiscal/providers';
import type { FiscalConfig } from './settingsStore';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { currentOrgId } from './appStore';

/**
 * Notas Fiscais de Serviço (NFS-e) — dual-mode (ver docs/ARCHITECTURE.md
 * §3.1/§3.2). `emitFiscal` calcula a tributação e emite pelo provedor
 * configurado (Governo · NFS-e Nacional via backend, ou simulação).
 */
const KEY = 'namira-invoices';
const TABLE = 'invoices';

export type InvoiceInput = Omit<Invoice, 'id' | 'orgId' | 'number' | 'series' | 'status' | 'issuedAt'>;
export interface FiscalEmitInput { serviceOrderId?: string; customerId?: string; description: string; amount: number }
export interface Tomador { documento?: string; nome?: string; pessoaJuridica: boolean }

const taxConfigFrom = (cfg: FiscalConfig): TaxConfig => ({
  issRate: cfg.issRate, regime: cfg.regime, issRetido: cfg.issRetido, retencoes: cfg.retencoes, inssRetido: cfg.inssRetido, irrfRate: cfg.irrfRate,
});

interface InvoicesState {
  invoices: Invoice[];
  emit: (input: InvoiceInput) => Invoice;
  emitFiscal: (input: FiscalEmitInput, cfg: FiscalConfig, tomador: Tomador) => Promise<Invoice>;
  cancel: (id: string) => void;
}

function load(): Invoice[] {
  if (supabaseEnabled) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Invoice[];
  } catch {
    /* ignora */
  }
  return invoicesSeed;
}
const save = (v: Invoice[]) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
};

function insertRemote(invoice: Invoice) {
  if (!supabaseEnabled || !supabase) return;
  supabase
    .from(TABLE)
    .insert(toSnakeRow(invoice as unknown as Record<string, unknown>))
    .then(({ error }) => {
      if (error) {
        useInvoicesStore.setState({ invoices: useInvoicesStore.getState().invoices.filter((i) => i.id !== invoice.id) });
        toast('Não foi possível registrar a nota fiscal — tente novamente.', { tone: 'danger' });
      }
    });
}

export const useInvoicesStore = create<InvoicesState>((set, get) => ({
  invoices: load(),
  emit: (input) => {
    const nextNumber = get().invoices.reduce((max, i) => Math.max(max, i.number), 1000) + 1;
    const invoice: Invoice = {
      id: 'inv-' + Math.random().toString(36).slice(2, 9),
      orgId: currentOrgId(),
      number: nextNumber,
      series: 'RPS-1',
      status: 'emitida',
      issuedAt: new Date().toISOString(),
      ...input,
    };
    const invoices = [invoice, ...get().invoices];
    set({ invoices });
    if (supabaseEnabled) insertRemote(invoice); else save(invoices);
    return invoice;
  },
  emitFiscal: async (input, cfg, tomador) => {
    const taxes = computeTaxes(input.amount, taxConfigFrom(cfg), tomador.pessoaJuridica);
    const provider = getProvider(cfg.provider);
    const org = getOrgProfile();
    const result = await provider.emit({
      serviceOrderId: input.serviceOrderId,
      customerId: input.customerId,
      description: input.description,
      amount: input.amount,
      taxes,
      prestador: { cnpj: org.cnpj, razaoSocial: org.legalName, municipioIbge: cfg.municipioIbge, regime: cfg.regime },
      tomador: { documento: tomador.documento, nome: tomador.nome, pessoaJuridica: tomador.pessoaJuridica },
    }, cfg);
    const nextNumber = get().invoices.reduce((max, i) => Math.max(max, i.number), 1000) + 1;
    const invoice: Invoice = {
      id: 'inv-' + Math.random().toString(36).slice(2, 9),
      orgId: currentOrgId(),
      number: nextNumber,
      series: '00001',
      serviceOrderId: input.serviceOrderId,
      customerId: input.customerId,
      description: input.description,
      amount: input.amount,
      taxAmount: taxes.iss,
      status: result.status,
      issuedAt: new Date().toISOString(),
      provider: result.provider,
      accessKey: result.accessKey,
      protocol: result.protocol,
      verificationCode: result.verificationCode,
      message: result.message,
      taxes,
    };
    const invoices = [invoice, ...get().invoices];
    set({ invoices });
    if (supabaseEnabled) insertRemote(invoice); else save(invoices);
    return invoice;
  },
  cancel: (id) => {
    const prev = get().invoices;
    const invoices = prev.map((i) => (i.id === id ? { ...i, status: 'cancelada' as const } : i));
    set({ invoices });
    if (supabaseEnabled && supabase) {
      const updated = invoices.find((i) => i.id === id);
      if (!updated) return;
      supabase
        .from(TABLE)
        .update(toSnakeRow(updated as unknown as Record<string, unknown>))
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            set({ invoices: prev });
            toast('Não foi possível cancelar a nota fiscal — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      save(invoices);
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
      .order('issued_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          useInvoicesStore.setState({ invoices: (data as Record<string, unknown>[]).map((r) => fromSnakeRow<Invoice>(r)) });
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useInvoicesStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useInvoicesStore.setState({ invoices: state.invoices.filter((i) => i.id !== oldId) });
        return;
      }
      const invoice = fromSnakeRow<Invoice>(payload.new as Record<string, unknown>);
      const exists = state.invoices.some((i) => i.id === invoice.id);
      useInvoicesStore.setState({
        invoices: exists ? state.invoices.map((i) => (i.id === invoice.id ? invoice : i)) : [invoice, ...state.invoices],
      });
    })
    .subscribe();
}
