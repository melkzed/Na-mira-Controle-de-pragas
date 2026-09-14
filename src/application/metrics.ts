/**
 * Aplicação — cálculo de indicadores (KPIs) do dashboard.
 * Deriva métricas a partir da fonte de dados sem lógica de UI.
 */
import { activeTechnicians, centralBalance } from './repository';
import { monthlySeries } from './financeSeries';
import { useFinanceStore, useLicensesStore, useProductsStore, useVehiclesStore } from '@/store/entityStores';
import { useCustomersStore } from '@/store/customersStore';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { expiringBatches } from '@/lib/batches';
import { daysUntil } from '@/lib/utils';
import { localDayKey } from '@/lib/date';

const today = () => localDayKey();

function isSameDay(iso: string, day: string) {
  return localDayKey(iso) === day;
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
  contractsExpiringSoon: number;
}

/**
 * Indicadores do painel.
 *
 * Tudo sai das stores, não do seed. O painel é a primeira tela do sistema e
 * lia o exemplo: cadastrar cliente, cancelar visita, dar baixa num
 * recebimento ou lançar um produto não mexia em número nenhum, e o painel
 * divergia dos relatórios, que já liam os dados reais.
 */
export function computeDashboard(): DashboardMetrics {
  const day = today();
  const appts = useAppointmentsStore.getState().appointments;
  const customers = useCustomersStore.getState().customers;

  const todayAppointments = appts.filter((a) => isSameDay(a.scheduledStart, day)).length;
  const weekAppointments = appts.filter((a) => isThisWeek(a.scheduledStart)).length;

  const completed = appts.filter((a) => a.status === 'finalizado').length;
  const cancelled = appts.filter((a) => a.status === 'cancelado').length;
  const pending = appts.filter((a) =>
    ['agendado', 'confirmado', 'em_deslocamento', 'em_atendimento'].includes(a.status),
  ).length;

  const activeCustomers = customers.filter((c) => c.isActive).length;
  const newCustomers = customers.filter(
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

  const paidToday = useFinanceStore.getState().items.filter(
    (e) => e.type === 'receita' && e.status === 'pago' && isSameDay(e.paidAt ?? '', day),
  );
  const revenueToday = paidToday.reduce((s, e) => s + e.amount, 0);

  // Receita e despesa do mês corrente, dos lançamentos reais — mesma conta do
  // DRE do Financeiro, para os dois não divergirem.
  const mesCorrente = monthlySeries().at(-1);
  const revenueMonth = mesCorrente?.receita ?? 0;
  const expensesMonth = mesCorrente?.despesa ?? 0;
  const profitMonth = revenueMonth - expensesMonth;

  const lowStockCount = useProductsStore.getState().items.filter(
    (p) => centralBalance(p.id) <= p.minQuantity,
  ).length;

  const expiring = expiringBatches(useProductsStore.getState().items);
  const expiringCount = expiring.filter((r) => r.level === 'vencendo').length;
  const expiredCount = expiring.filter((r) => r.level === 'vencido').length;

  const vehiclesInOperation = useVehiclesStore.getState().items.filter((v) => v.inOperation).length;

  const durations = useServiceOrdersStore.getState().orders
    .filter((so) => so.totalMinutes)
    .map((so) => so.totalMinutes!);
  const avgServiceMinutes = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Licenças/alvarás da empresa: lê a store (e não o seed) para contar também
  // o que o usuário cadastrou — senão o painel diverge do relatório.
  const licensesExpiringSoon = useLicensesStore.getState().items.filter((l) => {
    const d = daysUntil(l.expiresAt) ?? 999;
    return d <= 30;
  }).length;

  // Contrato a vencer é receita prestes a ser perdida: conta o que vence nos
  // próximos 30 dias e também o que já venceu sem renovação. Cancelado fica
  // de fora — não há o que renovar. Mesmo critério de "Contratos a vencer"
  // em Relatórios → Vencimentos.
  const contractsExpiringSoon = useCustomersStore.getState().customers.reduce(
    (total, c) => total + (c.contracts ?? []).filter((ct) => {
      if (ct.status === 'cancelado' || !ct.endDate) return false;
      const d = daysUntil(ct.endDate);
      return d !== null && d <= 30;
    }).length,
    0,
  );

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
    contractsExpiringSoon,
  };
}

/**
 * Consumo de produtos agregado a partir das OS.
 *
 * Só conta quantidade aplicada de verdade: produto que ficou zerado na OS
 * entrou na lista mas não saiu do estoque. E o produto precisa existir no
 * cadastro atual — antes a busca era no seed com `!`, então um produto
 * cadastrado depois virava `undefined` e derrubava o gráfico do painel.
 */
export function productConsumption() {
  const map = new Map<string, number>();
  for (const so of useServiceOrdersStore.getState().orders) {
    for (const p of so.products) {
      if (!(p.usedQty > 0)) continue;
      map.set(p.productId, (map.get(p.productId) ?? 0) + p.usedQty);
    }
  }
  const produtos = useProductsStore.getState().items;
  return [...map.entries()]
    .flatMap(([productId, qty]) => {
      const product = produtos.find((p) => p.id === productId);
      return product ? [{ product, qty }] : [];
    })
    .sort((a, b) => b.qty - a.qty);
}

/** Distribuição de atendimentos por status (para gráfico). */
export function statusDistribution() {
  const counts: Record<string, number> = {};
  for (const a of useAppointmentsStore.getState().appointments) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }
  return counts;
}
