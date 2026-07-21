import { create } from 'zustand';
import type { Invoice } from '@/domain/types';
import { invoicesSeed } from '@/infrastructure/seed/data';

/**
 * Notas Fiscais de Serviço (NFS-e) — estrutura + emissão SIMULADA (#7).
 * Em produção, `emit` chama o provedor municipal (NFS-e) e persiste número/
 * série/protocolo/XML retornados — a UI e o fluxo permanecem os mesmos.
 */
const KEY = 'namira-invoices';

export type InvoiceInput = Omit<Invoice, 'id' | 'orgId' | 'number' | 'series' | 'status' | 'issuedAt'>;

interface InvoicesState {
  invoices: Invoice[];
  emit: (input: InvoiceInput) => Invoice;
  cancel: (id: string) => void;
}

function load(): Invoice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Invoice[];
  } catch {
    /* ignora */
  }
  return invoicesSeed;
}
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };

export const useInvoicesStore = create<InvoicesState>((set, get) => ({
  invoices: load(),
  emit: (input) => {
    const nextNumber = get().invoices.reduce((max, i) => Math.max(max, i.number), 1000) + 1;
    const invoice: Invoice = {
      id: 'inv-' + Math.random().toString(36).slice(2, 9),
      orgId: 'org-namira',
      number: nextNumber,
      series: 'RPS-1',
      status: 'emitida',
      issuedAt: new Date().toISOString(),
      ...input,
    };
    const invoices = [invoice, ...get().invoices];
    save(invoices); set({ invoices });
    return invoice;
  },
  cancel: (id) => {
    const invoices = get().invoices.map((i) => (i.id === id ? { ...i, status: 'cancelada' as const } : i));
    save(invoices); set({ invoices });
  },
}));
