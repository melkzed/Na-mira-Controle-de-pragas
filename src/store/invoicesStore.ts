import { create } from 'zustand';
import type { Invoice } from '@/domain/types';
import { invoicesSeed } from '@/infrastructure/seed/data';
import { getOrgProfile } from '@/store/orgProfileStore';
import { computeTaxes, type TaxConfig } from '@/application/fiscal/tax';
import { getProvider } from '@/application/fiscal/providers';
import type { FiscalConfig } from './settingsStore';

/**
 * Notas Fiscais de Serviço (NFS-e). `emitFiscal` calcula a tributação e emite
 * pelo provedor configurado (Governo · NFS-e Nacional via backend, ou simulação).
 */
const KEY = 'namira-invoices';

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
      orgId: 'org-namira',
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
    save(invoices); set({ invoices });
    return invoice;
  },
  cancel: (id) => {
    const invoices = get().invoices.map((i) => (i.id === id ? { ...i, status: 'cancelada' as const } : i));
    save(invoices); set({ invoices });
  },
}));
