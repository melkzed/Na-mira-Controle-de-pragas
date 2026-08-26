/**
 * Dados do Portal do Cliente — sempre recortados pelo cliente logado.
 *
 * Todas as telas do Portal passam por aqui em vez de ler as stores direto,
 * para o recorte por `customerId` existir num lugar só. É esse mesmo recorte
 * que a RLS do Supabase vai reforçar no servidor quando o Portal sair do
 * modo standalone (ver docs/ARCHITECTURE.md §3.8).
 */
import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useCustomersStore } from '@/store/customersStore';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useFinanceStore } from '@/store/entityStores';
import { useTrapsStore } from '@/store/trapsStore';
import {
  appointmentsForCustomer, financeEntriesForCustomer, serviceOrdersForCustomer,
  trapInspectionsForCustomer, trapsForCustomer,
} from '@/application/repository';
import type {
  Appointment, Customer, FinanceEntry, ServiceOrder, TrapDevice, TrapInspection,
} from '@/domain/types';

export interface PortalData {
  customer?: Customer;
  appointments: Appointment[];
  orders: ServiceOrder[];
  finance: FinanceEntry[];
  traps: TrapDevice[];
  inspections: TrapInspection[];
}

/** Tudo que o cliente logado pode ver, já filtrado e reativo às stores. */
export function usePortalData(): PortalData {
  const customerId = useAppStore((s) => s.currentUser?.customerId);
  // Assinaturas explícitas: as consultas do repository leem via getState(),
  // que não dispara re-render sozinho.
  const customers = useCustomersStore((s) => s.customers);
  const appts = useAppointmentsStore((s) => s.appointments);
  const orders = useServiceOrdersStore((s) => s.orders);
  const finance = useFinanceStore((s) => s.items);
  const traps = useTrapsStore((s) => s.traps);
  const inspections = useTrapsStore((s) => s.inspections);

  return useMemo(() => {
    if (!customerId) {
      return { customer: undefined, appointments: [], orders: [], finance: [], traps: [], inspections: [] };
    }
    return {
      customer: customers.find((c) => c.id === customerId),
      appointments: appointmentsForCustomer(customerId),
      orders: serviceOrdersForCustomer(customerId),
      finance: financeEntriesForCustomer(customerId),
      traps: trapsForCustomer(customerId),
      inspections: trapInspectionsForCustomer(customerId),
    };
    // As listas entram nas dependências de propósito: as consultas do
    // repository leem via getState(), então o lint não as vê no corpo do memo
    // — mas sem elas o Portal congelaria no primeiro render e não
    // acompanharia nenhuma alteração feita no escritório.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, customers, appts, orders, finance, traps, inspections]);
}

/** Próximos atendimentos (do mais próximo para o mais distante). */
export function upcoming(appointments: Appointment[]): Appointment[] {
  const agora = new Date().toISOString();
  return appointments
    .filter((a) => a.scheduledStart >= agora && a.status !== 'cancelado' && a.status !== 'finalizado')
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

/** Atendimentos já realizados, do mais recente para o mais antigo. */
export function past(appointments: Appointment[]): Appointment[] {
  return appointments
    .filter((a) => a.status === 'finalizado')
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
}

/** Situação de um lançamento na visão do cliente. */
export function paymentTone(e: FinanceEntry): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (e.status === 'pago') return { label: 'Pago', tone: 'success' };
  const vencido = e.dueDate ? e.dueDate < new Date().toISOString() : false;
  if (e.status === 'atrasado' || vencido) return { label: 'Vencido', tone: 'danger' };
  return { label: 'Pendente', tone: 'warning' };
}
