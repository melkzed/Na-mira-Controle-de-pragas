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
import { useProductsStore, useServiceTypesStore } from '@/store/entityStores';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useStockStore } from '@/store/stockStore';
import type {
  Appointment,
  Customer,
  Product,
  ServiceOrder,
  User,
} from '@/domain/types';

export const db = seed;

// Lê das stores reativas para manter Clientes/Produtos consistentes em todos os
// módulos (Agenda, OS, PDF, App do Técnico) — evita divergência com o seed.
export function getCustomer(id: string): Customer | undefined {
  return useCustomersStore.getState().customers.find((c) => c.id === id);
}

export function getUser(id?: string): User | undefined {
  if (!id) return undefined;
  return seed.users.find((u) => u.id === id);
}

export function getProduct(id: string): Product | undefined {
  return useProductsStore.getState().items.find((p) => p.id === id);
}

export function getServiceType(id?: string) {
  return useServiceTypesStore.getState().items.find((s) => s.id === id);
}

export function centralBalance(productId: string): number {
  return useStockStore.getState().balanceOf('loc-central', productId);
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
  return seed.serviceOrders
    .filter((so) => so.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
