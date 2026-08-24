/**
 * Aplicação — fachada de acesso a dados.
 * Abstrai a fonte (seed em memória hoje; Supabase/Postgres no futuro),
 * expondo consultas de domínio às camadas de apresentação.
 *
 * Trocar a fonte é uma questão de reimplementar estas funções contra
 * o cliente Supabase — as telas não mudam (Dependency Inversion / SOLID).
 */
import * as seed from '@/infrastructure/seed/data';
import { useCustomersStore } from '@/store/customersStore';
import { useAreasStore, useEquipmentStore, useProductsStore, usePestsStore, useServiceTypesStore, useUsersStore } from '@/store/entityStores';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useStockStore } from '@/store/stockStore';
import { centralStockLocationId } from '@/store/stockLocations';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { RELEASED_TO_TECH_STATUSES } from '@/lib/confirmation';
import type {
  Appointment,
  Customer,
  Equipment,
  Pest,
  Product,
  ServiceOrder,
  TreatedArea,
  User,
} from '@/domain/types';

export const db = seed;

// Lê das stores reativas para manter Clientes/Produtos consistentes em todos os
// módulos (Agenda, OS, PDF, App do Técnico) — evita divergência com o seed.
export function getCustomer(id: string): Customer | undefined {
  return useCustomersStore.getState().customers.find((c) => c.id === id);
}

/** Telefone do contato principal do cliente — quem de fato atende/agenda,
 *  com fallback para o telefone principal/WhatsApp de cadastros antigos. */
export function primaryContactPhone(c?: Customer): string | undefined {
  if (!c) return undefined;
  const principal = c.contacts?.find((ct) => ct.isPrincipal) ?? c.contacts?.[0];
  return principal?.phone ?? c.whatsapp ?? c.phone;
}

export function getUser(id?: string): User | undefined {
  if (!id) return undefined;
  return useUsersStore.getState().items.find((u) => u.id === id);
}

export function allUsers(): User[] {
  return useUsersStore.getState().items;
}

export function allTechnicians(): User[] {
  return useUsersStore.getState().items.filter((u) => u.role === 'tecnico');
}

export function activeTechnicians(): User[] {
  return allTechnicians().filter((u) => u.isActive);
}

export function getProduct(id: string): Product | undefined {
  return useProductsStore.getState().items.find((p) => p.id === id);
}

export function getServiceType(id?: string) {
  return useServiceTypesStore.getState().items.find((s) => s.id === id);
}

/** Lê da store reativa de pragas — nunca do seed estático, para que pragas
 *  cadastradas depois do carregamento inicial apareçam na documentação. */
export function getPest(id?: string): Pest | undefined {
  if (!id) return undefined;
  return usePestsStore.getState().items.find((p) => p.id === id);
}

/** Lê da store reativa de áreas tratadas — mesmo padrão de getPest/getEquipment. */
export function getArea(id?: string): TreatedArea | undefined {
  if (!id) return undefined;
  return useAreasStore.getState().items.find((a) => a.id === id);
}

export function getEquipment(id?: string): Equipment | undefined {
  if (!id) return undefined;
  return useEquipmentStore.getState().items.find((e) => e.id === id);
}

export function centralBalance(productId: string): number {
  const central = centralStockLocationId();
  return central ? useStockStore.getState().balanceOf(central, productId) : 0;
}

export function technicianBalances(locationId: string) {
  return useStockStore.getState().balances
    .filter((b) => b.locationId === locationId)
    .map((b) => ({ product: getProduct(b.productId), quantity: b.quantity }))
    .filter((x): x is { product: Product; quantity: number } => !!x.product);
}

export function lowStockProducts() {
  return seed.products
    .map((p) => ({ product: p, qty: centralBalance(p.id) }))
    .filter(({ product, qty }) => qty <= product.minQuantity);
}

export function appointmentsByDay(iso: string): Appointment[] {
  const day = iso.slice(0, 10);
  return useAppointmentsStore.getState().appointments
    .filter((a) => a.scheduledStart.slice(0, 10) === day)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

export function serviceOrdersForCustomer(customerId: string): ServiceOrder[] {
  return useServiceOrdersStore.getState().orders
    .filter((so) => so.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Última Ordem de Serviço do cliente — base para o preenchimento inteligente. */
export function lastOrderForCustomer(customerId: string): ServiceOrder | undefined {
  return serviceOrdersForCustomer(customerId)[0];
}

/** OS vinculada a um agendamento — usada para trazer a "Mensagem para o Técnico" (uso interno) ao app de campo. */
export function serviceOrderForAppointment(appointmentId: string): ServiceOrder | undefined {
  return useServiceOrdersStore.getState().orders.find((so) => so.appointmentId === appointmentId);
}

/** Agendamentos em aberto do cliente — usados para vincular a OS a uma visita. */
export function appointmentsForCustomer(customerId: string): Appointment[] {
  return useAppointmentsStore.getState().appointments
    .filter((a) => a.customerId === customerId && a.status !== 'cancelado')
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
}

export function appointmentsForTechnician(
  technicianId: string,
  dayIso: string,
): Appointment[] {
  const day = dayIso.slice(0, 10);
  return useAppointmentsStore.getState().appointments
    .filter(
      (a) =>
        a.technicianId === technicianId &&
        a.scheduledStart.slice(0, 10) === day,
    )
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

/** Agendamentos do técnico num intervalo de datas (ex.: semana atual) — ordenados cronologicamente. */
export function appointmentsForTechnicianRange(
  technicianId: string,
  startIso: string,
  endIso: string,
): Appointment[] {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  return useAppointmentsStore.getState().appointments
    .filter((a) => {
      const day = a.scheduledStart.slice(0, 10);
      return a.technicianId === technicianId && day >= start && day <= end;
    })
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

/** Agendamentos do dia já liberados ao técnico — exclui visitas "programada"/
 *  "agendado" (ainda não confirmadas pelo cliente), que ficam visíveis apenas
 *  administrativamente até a confirmação (RBAC: App do Técnico). */
export function releasedAppointmentsForTechnician(technicianId: string, dayIso: string): Appointment[] {
  return appointmentsForTechnician(technicianId, dayIso).filter((a) => RELEASED_TO_TECH_STATUSES.includes(a.status));
}

/** Mesma regra de liberação, para um intervalo de datas (ex.: semana atual). */
export function releasedAppointmentsForTechnicianRange(technicianId: string, startIso: string, endIso: string): Appointment[] {
  return appointmentsForTechnicianRange(technicianId, startIso, endIso).filter((a) => RELEASED_TO_TECH_STATUSES.includes(a.status));
}

/** Histórico de visitas do técnico (todas as datas) — mais recentes primeiro. */
export function appointmentsHistoryForTechnician(technicianId: string): Appointment[] {
  return useAppointmentsStore.getState().appointments
    .filter((a) => a.technicianId === technicianId)
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
}

/** Ordens de Serviço em que o técnico participou — mais recentes primeiro. */
export function serviceOrdersForTechnician(technicianId: string): ServiceOrder[] {
  return useServiceOrdersStore.getState().orders
    .filter((so) => so.technicianId === technicianId || so.technicianIds?.includes(technicianId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
