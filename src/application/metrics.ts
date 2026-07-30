/**
 * Aplicação — cálculo de indicadores (KPIs) do dashboard.
 * Deriva métricas a partir da fonte de dados sem lógica de UI.
 */
import * as seed from '@/infrastructure/seed/data';
import { activeTechnicians, centralBalance } from './repository';
import { useProductsStore } from '@/store/entityStores';
import { expiringBatches } from '@/lib/batches';
import { daysUntil } from '@/lib/utils';

const today = () => new Date().toISOString().slice(0, 10);

function isSameDay(iso: string, day: string) {
  return iso.slice(0, 10) === day;
}

function isThisWeek(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

export interface DashboardMetrics {
  todayAppointments: number;
  weekAppointments: number;
  completed: number;
  pending: number;
  cancelled: number;
  activeCustomers: number;
  newCustomers: number;
  techniciansWorking: number;
  techniciansAvailable: number;
  revenueToday: number;
  revenueMonth: number;
  expensesMonth: number;
  profitMonth: number;
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
  vehiclesInOperation: number;
  avgServiceMinutes: number;
  licensesExpiringSoon: number;
}

export function computeDashboard(): DashboardMetrics {
  const day = today();
  const appts = seed.appointments;

  const todayAppointments = appts.filter((a) => isSameDay(a.scheduledStart, day)).length;
  const weekAppointments = appts.filter((a) => isThisWeek(a.scheduledStart)).length;

  const completed = appts.filter((a) => a.status === 'finalizado').length;
  const cancelled = appts.filter((a) => a.status === 'cancelado').length;
  const pending = appts.filter((a) =>
    ['agendado', 'confirmado', 'em_deslocamento', 'em_atendimento'].includes(a.status),
  ).length;

  const activeCustomers = seed.customers.filter((c) => c.isActive).length;
  const newCustomers = seed.customers.filter(
    (c) => (daysUntil(c.createdAt) ?? -999) >= -30,
  ).length;

  const workingStatuses = ['em_deslocamento', 'em_atendimento'];
  const busyTechIds = new Set(
    appts
      .filter((a) => isSameDay(a.scheduledStart, day) && workingStatuses.includes(a.status))
      .map((a) => a.technicianId),
  );
  const techniciansWorking = busyTechIds.size;
  const techniciansAvailable = activeTechnicians().length - techniciansWorking;

  const paidToday = seed.financeEntries.filter(
    (e) => e.type === 'receita' && e.status === 'pago' && isSameDay(e.paidAt ?? '', day),
  );
  const revenueToday = paidToday.reduce((s, e) => s + e.amount, 0);

  const revenueMonth = seed.revenueSeries.at(-1)?.receita ?? 0;
  const expensesMonth = seed.revenueSeries.at(-1)?.despesa ?? 0;
  const profitMonth = revenueMonth - expensesMonth;

  const lowStockCount = seed.products.filter(
    (p) => centralBalance(p.id) <= p.minQuantity,
  ).length;

  const expiring = expiringBatches(useProductsStore.getState().items);
  const expiringCount = expiring.filter((r) => r.level === 'vencendo').length;
  const expiredCount = expiring.filter((r) => r.level === 'vencido').length;

  const vehiclesInOperation = seed.vehicles.filter((v) => v.inOperation).length;

  const durations = seed.serviceOrders
    .filter((so) => so.totalMinutes)
    .map((so) => so.totalMinutes!);
  const avgServiceMinutes = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const licensesExpiringSoon = seed.licenses.filter((l) => {
    const d = daysUntil(l.expiresAt) ?? 999;
    return d <= 30;
  }).length;

  return {
    todayAppointments,
    weekAppointments,
    completed,
    pending,
    cancelled,
    activeCustomers,
    newCustomers,
    techniciansWorking,
    techniciansAvailable,
    revenueToday,
    revenueMonth,
    expensesMonth,
    profitMonth,
    lowStockCount,
    expiringCount,
    expiredCount,
    vehiclesInOperation,
    avgServiceMinutes,
    licensesExpiringSoon,
  };
}

/** Consumo de produtos agregado a partir das OS concluídas. */
export function productConsumption() {
  const map = new Map<string, number>();
  for (const so of seed.serviceOrders) {
    for (const p of so.products) {
      map.set(p.productId, (map.get(p.productId) ?? 0) + p.usedQty);
    }
  }
  return [...map.entries()]
    .map(([productId, qty]) => ({
      product: seed.products.find((p) => p.id === productId)!,
      qty,
    }))
    .sort((a, b) => b.qty - a.qty);
}

/** Distribuição de atendimentos por status (para gráfico). */
export function statusDistribution() {
  const counts: Record<string, number> = {};
  for (const a of seed.appointments) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }
  return counts;
}
