/**
 * Relatórios — um construtor por relatório.
 *
 * Antes o conteúdo era decidido pelo GRUPO, não pelo relatório escolhido: os
 * seis cards de Operação devolviam a mesma lista de ordens de serviço, os seis
 * de Equipes a mesma lista de produtos, os seis de Financeiro o mesmo extrato.
 * Vinte e dois botões para quatro conteúdos — "Tempo médio de deslocamento" e
 * "Cancelamentos" saíam idênticos.
 *
 * Agora cada relatório é um registro com colunas, linhas e resumo próprios, e
 * o grupo serve só para organizar a tela. Acrescentar um relatório é
 * acrescentar um item em `REPORTS`.
 */
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useCustomersStore } from '@/store/customersStore';
import { useInvoicesStore } from '@/store/invoicesStore';
import { useStockStore } from '@/store/stockStore';
import {
  useEquipmentStore, useFinanceStore, useLicensesStore, useNonConformitiesStore,
  useProductsStore, useStockLocationsStore, useVehiclesStore,
} from '@/store/entityStores';
import type { ReportColumn } from '@/lib/printReports';
import { fmtDate } from '@/lib/date';
import { formatCurrency, compareText } from '@/lib/utils';
import { APPOINTMENT_STATUS_META, SERVICE_ORDER_STATUS_META, type AppointmentStatus, type ServiceOrderStatus } from '@/domain/enums';
import { haversineKm } from '@/lib/geo';

export interface ReportFilters {
  search: string;
  customerId: string;
  technicianId: string;
  serviceTypeId: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface ReportData {
  columns: ReportColumn<any>[];
  rows: any[];
  summary: { label: string; value: string | number }[];
}

export interface ReportDef {
  name: string;
  group: string;
  icon: string;
  /** A pergunta que este relatório responde — aparece no card. */
  question: string;
  build: (f: ReportFilters) => ReportData;
}

// ── Utilidades comuns ───────────────────────────────────────────────────────

/** Início/fim do período respeitam exatamente as datas escolhidas. */
export function rangeBounds(f: ReportFilters): { start: Date; end: Date } {
  const start = f.startDate ? new Date(`${f.startDate}T00:00:00`) : new Date(0);
  const end = f.endDate ? new Date(`${f.endDate}T23:59:59.999`) : new Date();
  return { start, end };
}
const inRange = (iso: string | undefined, start: Date, end: Date) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= start && d <= end;
};
const termo = (f: ReportFilters) => f.search.trim().toLowerCase();
const contem = (q: string, ...campos: (string | number | undefined)[]) =>
  !q || campos.some((c) => String(c ?? '').toLowerCase().includes(q));
const nomeCliente = (id?: string) => (id ? getCustomer(id)?.name ?? '' : '');
const nomeUsuario = (id?: string) => (id ? getUser(id)?.name ?? '' : '');
const minutos = (n: number) => `${Math.round(n)} min`;
const horas = (min: number) => `${Math.round(min / 60)}h`;

/** Ordens de serviço no período, já com os filtros comuns aplicados. */
function ordensFiltradas(f: ReportFilters) {
  const { start, end } = rangeBounds(f);
  const q = termo(f);
  return useServiceOrdersStore.getState().orders
    .filter((so) => inRange(so.executionDate ?? so.createdAt, start, end))
    .filter((so) => !f.customerId || so.customerId === f.customerId)
    .filter((so) => !f.technicianId || so.technicianId === f.technicianId || so.technicianIds?.includes(f.technicianId))
    .filter((so) => !f.serviceTypeId || so.serviceTypeId === f.serviceTypeId || so.serviceTypeIds?.includes(f.serviceTypeId))
    .filter((so) => !f.status || so.status === f.status)
    .filter((so) => contem(q, `#${so.number}`, nomeCliente(so.customerId), getServiceType(so.serviceTypeId)?.name, nomeUsuario(so.technicianId), so.status))
    .sort((a, b) => (a.executionDate ?? a.createdAt) < (b.executionDate ?? b.createdAt) ? 1 : -1);
}

/** Visitas no período, com os filtros comuns aplicados. */
function visitasFiltradas(f: ReportFilters) {
  const { start, end } = rangeBounds(f);
  const q = termo(f);
  return useAppointmentsStore.getState().appointments
    .filter((a) => inRange(a.scheduledStart, start, end))
    .filter((a) => !f.customerId || a.customerId === f.customerId)
    .filter((a) => !f.technicianId || a.technicianId === f.technicianId)
    .filter((a) => !f.serviceTypeId || a.serviceTypeId === f.serviceTypeId)
    .filter((a) => contem(q, nomeCliente(a.customerId), nomeUsuario(a.technicianId), getServiceType(a.serviceTypeId)?.name, a.status))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

/** Lançamentos financeiros no período. Lê da store, nunca do seed. */
function lancamentosFiltrados(f: ReportFilters, tipo?: 'receita' | 'despesa') {
  const { start, end } = rangeBounds(f);
  const q = termo(f);
  return useFinanceStore.getState().items
    .filter((e) => !tipo || e.type === tipo)
    .filter((e) => inRange(e.dueDate ?? e.createdAt, start, end))
    .filter((e) => !f.customerId || e.customerId === f.customerId)
    .filter((e) => contem(q, e.description, nomeCliente(e.customerId), e.status, e.taxKind))
    .sort((a, b) => (a.dueDate ?? a.createdAt) < (b.dueDate ?? b.createdAt) ? 1 : -1);
}

const liquido = (e: { amount: number; discount?: number }) => e.amount - (e.discount ?? 0);

/** Valor do serviço de uma OS — o informado, ou a soma dos preços padrão. */
function valorOs(so: ReturnType<typeof ordensFiltradas>[number]): number {
  if (so.serviceValue != null) return so.serviceValue;
  return (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId])
    .reduce((s, id) => s + (id ? getServiceType(id)?.defaultPrice ?? 0 : 0), 0);
}

// ── Operação ────────────────────────────────────────────────────────────────

const OPERACAO: ReportDef[] = [
  {
    name: 'Atendimentos por período', group: 'Operação', icon: 'CalendarCheck',
    question: 'O que foi executado no período, por dia',
    build: (f) => {
      const rows = ordensFiltradas(f);
      const concluidas = rows.filter((so) => so.status === 'concluida');
      const minutosTotais = rows.reduce((s, so) => s + (so.totalMinutes ?? 0), 0);
      return {
        columns: [
          { header: 'Data', value: (so) => fmtDate(so.executionDate ?? so.createdAt) },
          { header: 'OS', value: (so) => `#${so.number}` },
          { header: 'Cliente', value: (so) => nomeCliente(so.customerId) },
          { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
          { header: 'Técnico', value: (so) => nomeUsuario(so.technicianId) },
          { header: 'Status', value: (so) => SERVICE_ORDER_STATUS_META[so.status as ServiceOrderStatus]?.label ?? so.status },
        ],
        rows,
        summary: [
          { label: 'Atendimentos', value: rows.length },
          { label: 'Concluídos', value: concluidas.length },
          { label: 'Cancelados', value: rows.filter((so) => so.status === 'cancelada').length },
          { label: 'Tempo total', value: horas(minutosTotais) },
        ],
      };
    },
  },
  {
    name: 'Agendamentos e ocupação', group: 'Operação', icon: 'CalendarDays',
    question: 'Quantas visitas por dia e quanto da agenda foi ocupado',
    build: (f) => {
      const rows = visitasFiltradas(f);
      const dias = new Set(rows.map((a) => a.scheduledStart.slice(0, 10)));
      const minutosPrevistos = rows.reduce((s, a) => s + (a.estimatedMinutes ?? 60), 0);
      return {
        columns: [
          { header: 'Data', value: (a) => fmtDate(a.scheduledStart.slice(0, 10)) },
          { header: 'Início', value: (a) => new Date(a.scheduledStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
          { header: 'Cliente', value: (a) => nomeCliente(a.customerId) },
          { header: 'Serviço', value: (a) => getServiceType(a.serviceTypeId)?.name ?? '' },
          { header: 'Técnico', value: (a) => nomeUsuario(a.technicianId) },
          { header: 'Previsto', value: (a) => `${a.estimatedMinutes ?? 60} min`, align: 'right' },
          { header: 'Situação', value: (a) => APPOINTMENT_STATUS_META[a.status as AppointmentStatus]?.label ?? a.status },
        ],
        rows,
        summary: [
          { label: 'Visitas', value: rows.length },
          { label: 'Dias com agenda', value: dias.size },
          { label: 'Média por dia', value: dias.size ? (rows.length / dias.size).toFixed(1) : '0' },
          { label: 'Horas agendadas', value: horas(minutosPrevistos) },
        ],
      };
    },
  },
  {
    name: 'Ordens de Serviço', group: 'Operação', icon: 'ClipboardList',
    question: 'Cada OS com valor, pagamento e garantia',
    build: (f) => {
      const rows = ordensFiltradas(f);
      const total = rows.reduce((s, so) => s + valorOs(so), 0);
      const pagas = rows.filter((so) => so.paymentStatus === 'pago');
      return {
        columns: [
          { header: 'OS', value: (so) => `#${so.number}` },
          { header: 'Data', value: (so) => fmtDate(so.executionDate ?? so.createdAt) },
          { header: 'Cliente', value: (so) => nomeCliente(so.customerId) },
          { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
          { header: 'Status', value: (so) => SERVICE_ORDER_STATUS_META[so.status as ServiceOrderStatus]?.label ?? so.status },
          { header: 'Pagamento', value: (so) => (so.paymentStatus === 'pago' ? 'Pago' : 'Pendente') },
          { header: 'Valor (R$)', value: (so) => formatCurrency(valorOs(so)), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Ordens', value: rows.length },
          { label: 'Valor total', value: formatCurrency(total) },
          { label: 'Ticket médio', value: formatCurrency(rows.length ? total / rows.length : 0) },
          { label: 'Já pagas', value: `${pagas.length} · ${formatCurrency(pagas.reduce((s, so) => s + valorOs(so), 0))}` },
        ],
      };
    },
  },
  {
    name: 'Tempo médio de atendimento', group: 'Operação', icon: 'Timer',
    question: 'Quanto cada técnico leva por atendimento',
    build: (f) => {
      const ordens = ordensFiltradas(f).filter((so) => (so.totalMinutes ?? 0) > 0);
      const porTecnico = new Map<string, { atendimentos: number; minutos: number }>();
      ordens.forEach((so) => {
        const id = so.technicianIds?.[0] ?? so.technicianId ?? '—';
        const atual = porTecnico.get(id) ?? { atendimentos: 0, minutos: 0 };
        porTecnico.set(id, { atendimentos: atual.atendimentos + 1, minutos: atual.minutos + (so.totalMinutes ?? 0) });
      });
      const rows = [...porTecnico.entries()]
        .map(([id, v]) => ({ id, tecnico: nomeUsuario(id) || '—', ...v, media: v.minutos / v.atendimentos }))
        .sort((a, b) => a.media - b.media);
      const totalMin = rows.reduce((s, r) => s + r.minutos, 0);
      const totalAtend = rows.reduce((s, r) => s + r.atendimentos, 0);
      return {
        columns: [
          { header: 'Técnico', value: (r) => r.tecnico },
          { header: 'Atendimentos', value: (r) => r.atendimentos, align: 'right' },
          { header: 'Tempo total', value: (r) => horas(r.minutos), align: 'right' },
          { header: 'Média por atendimento', value: (r) => minutos(r.media), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Técnicos', value: rows.length },
          { label: 'Atendimentos medidos', value: totalAtend },
          { label: 'Média geral', value: totalAtend ? minutos(totalMin / totalAtend) : '—' },
          { label: 'Mais rápido', value: rows[0]?.tecnico ?? '—' },
        ],
      };
    },
  },
  {
    name: 'Tempo médio de deslocamento', group: 'Operação', icon: 'Navigation',
    question: 'Distância e tempo entre uma visita e a seguinte',
    build: (f) => {
      // Deslocamento é o trecho ENTRE duas visitas consecutivas do mesmo
      // técnico no mesmo dia — só existe a partir da segunda visita do dia.
      const visitas = visitasFiltradas(f).filter((a) => a.latitude != null && a.longitude != null);
      const porTecnicoDia = new Map<string, typeof visitas>();
      visitas.forEach((a) => {
        const chave = `${a.technicianId ?? '—'}|${a.scheduledStart.slice(0, 10)}`;
        porTecnicoDia.set(chave, [...(porTecnicoDia.get(chave) ?? []), a]);
      });
      const rows: { data: string; tecnico: string; de: string; para: string; km: number; minutos: number }[] = [];
      porTecnicoDia.forEach((lista, chave) => {
        const ordenada = [...lista].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
        for (let i = 1; i < ordenada.length; i += 1) {
          const ant = ordenada[i - 1];
          const atual = ordenada[i];
          const km = haversineKm(
            { lat: ant.latitude as number, lng: ant.longitude as number },
            { lat: atual.latitude as number, lng: atual.longitude as number },
          );
          // Fim previsto da anterior até o início da seguinte.
          const gap = (new Date(atual.scheduledStart).getTime() - new Date(ant.scheduledEnd).getTime()) / 60000;
          rows.push({
            data: fmtDate(atual.scheduledStart.slice(0, 10)),
            tecnico: nomeUsuario(chave.split('|')[0]) || '—',
            de: nomeCliente(ant.customerId),
            para: nomeCliente(atual.customerId),
            km,
            minutos: Math.max(0, gap),
          });
        }
      });
      const totalKm = rows.reduce((s, r) => s + r.km, 0);
      const totalMin = rows.reduce((s, r) => s + r.minutos, 0);
      return {
        columns: [
          { header: 'Data', value: (r) => r.data },
          { header: 'Técnico', value: (r) => r.tecnico },
          { header: 'De', value: (r) => r.de },
          { header: 'Para', value: (r) => r.para },
          { header: 'Distância (km)', value: (r) => r.km.toFixed(1), align: 'right' },
          { header: 'Intervalo', value: (r) => minutos(r.minutos), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Trechos', value: rows.length },
          { label: 'Distância total', value: `${totalKm.toFixed(1)} km` },
          { label: 'Distância média', value: rows.length ? `${(totalKm / rows.length).toFixed(1)} km` : '—' },
          { label: 'Intervalo médio', value: rows.length ? minutos(totalMin / rows.length) : '—' },
        ],
      };
    },
  },
  {
    name: 'Cancelamentos e reagendamentos', group: 'Operação', icon: 'CalendarX',
    question: 'O que não aconteceu, e de quem partiu',
    build: (f) => {
      const ordens = ordensFiltradas(f).filter((so) => so.status === 'cancelada');
      const visitas = visitasFiltradas(f).filter((a) => a.status === 'cancelado' || a.status === 'reagendado');
      const rows = [
        ...ordens.map((so) => ({
          data: fmtDate(so.cancelledAt ?? so.executionDate ?? so.createdAt),
          tipo: 'Ordem de serviço',
          referencia: `#${so.number}`,
          cliente: nomeCliente(so.customerId),
          origem: so.cancelledBy === 'cliente' ? 'Cliente' : 'Empresa',
          motivo: so.cancelReason ?? '',
        })),
        ...visitas.map((a) => ({
          data: fmtDate(a.scheduledStart.slice(0, 10)),
          tipo: a.status === 'reagendado' ? 'Visita reagendada' : 'Visita cancelada',
          referencia: nomeUsuario(a.technicianId) || '—',
          cliente: nomeCliente(a.customerId),
          origem: a.rescheduleRequest ? 'Cliente' : 'Empresa',
          motivo: a.notes ?? '',
        })),
      ].sort((a, b) => compareText(b.data, a.data));
      return {
        columns: [
          { header: 'Data', value: (r) => r.data },
          { header: 'Tipo', value: (r) => r.tipo },
          { header: 'Referência', value: (r) => r.referencia },
          { header: 'Cliente', value: (r) => r.cliente },
          { header: 'Partiu de', value: (r) => r.origem },
          { header: 'Motivo', value: (r) => r.motivo },
        ],
        rows,
        summary: [
          { label: 'Total', value: rows.length },
          { label: 'OS canceladas', value: ordens.length },
          { label: 'Visitas afetadas', value: visitas.length },
          { label: 'Pedido pelo cliente', value: rows.filter((r) => r.origem === 'Cliente').length },
        ],
      };
    },
  },
];

// ── Equipes & Recursos ──────────────────────────────────────────────────────

/** Produtos aplicados nas OS do período — base do consumo por técnico/cliente. */
function aplicacoes(f: ReportFilters) {
  return ordensFiltradas(f).flatMap((so) =>
    so.products
      .filter((p) => Number(p.usedQty) > 0)
      .map((p) => ({ so, productId: p.productId, qty: Number(p.usedQty) })),
  );
}

const EQUIPES: ReportDef[] = [
  {
    name: 'Eficiência por técnico', group: 'Equipes & Recursos', icon: 'Gauge',
    question: 'Quem entrega mais, e com que taxa de conclusão',
    build: (f) => {
      const ordens = ordensFiltradas(f);
      const porTecnico = new Map<string, { total: number; concluidas: number; canceladas: number; minutos: number; valor: number }>();
      ordens.forEach((so) => {
        const id = so.technicianIds?.[0] ?? so.technicianId ?? '—';
        const a = porTecnico.get(id) ?? { total: 0, concluidas: 0, canceladas: 0, minutos: 0, valor: 0 };
        porTecnico.set(id, {
          total: a.total + 1,
          concluidas: a.concluidas + (so.status === 'concluida' ? 1 : 0),
          canceladas: a.canceladas + (so.status === 'cancelada' ? 1 : 0),
          minutos: a.minutos + (so.totalMinutes ?? 0),
          valor: a.valor + valorOs(so),
        });
      });
      const rows = [...porTecnico.entries()]
        .map(([id, v]) => ({ id, tecnico: nomeUsuario(id) || '—', ...v, taxa: v.total ? (v.concluidas / v.total) * 100 : 0 }))
        .sort((a, b) => b.concluidas - a.concluidas);
      return {
        columns: [
          { header: 'Técnico', value: (r) => r.tecnico },
          { header: 'Atendimentos', value: (r) => r.total, align: 'right' },
          { header: 'Concluídos', value: (r) => r.concluidas, align: 'right' },
          { header: 'Cancelados', value: (r) => r.canceladas, align: 'right' },
          { header: 'Taxa de conclusão', value: (r) => `${r.taxa.toFixed(0)}%`, align: 'right' },
          { header: 'Tempo médio', value: (r) => (r.concluidas ? minutos(r.minutos / r.concluidas) : '—'), align: 'right' },
          { header: 'Valor gerado (R$)', value: (r) => formatCurrency(r.valor), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Técnicos', value: rows.length },
          { label: 'Atendimentos', value: ordens.length },
          { label: 'Concluídos', value: ordens.filter((so) => so.status === 'concluida').length },
          { label: 'Destaque', value: rows[0]?.tecnico ?? '—' },
        ],
      };
    },
  },
  {
    name: 'Consumo por técnico', group: 'Equipes & Recursos', icon: 'Boxes',
    question: 'Quanto de cada produto cada técnico aplicou',
    build: (f) => {
      const mapa = new Map<string, { tecnico: string; produto: string; unidade: string; qty: number; aplicacoes: number }>();
      aplicacoes(f).forEach(({ so, productId, qty }) => {
        const tecnicoId = so.technicianIds?.[0] ?? so.technicianId ?? '—';
        const chave = `${tecnicoId}|${productId}`;
        const prod = getProduct(productId);
        const a = mapa.get(chave);
        mapa.set(chave, {
          tecnico: nomeUsuario(tecnicoId) || '—',
          produto: prod?.name ?? '—',
          unidade: prod?.unit ?? '',
          qty: (a?.qty ?? 0) + qty,
          aplicacoes: (a?.aplicacoes ?? 0) + 1,
        });
      });
      const rows = [...mapa.values()].sort((a, b) => compareText(a.tecnico, b.tecnico) || b.qty - a.qty);
      return {
        columns: [
          { header: 'Técnico', value: (r) => r.tecnico },
          { header: 'Produto', value: (r) => r.produto },
          { header: 'Aplicações', value: (r) => r.aplicacoes, align: 'right' },
          { header: 'Quantidade', value: (r) => `${r.qty} ${r.unidade}`, align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Linhas', value: rows.length },
          { label: 'Técnicos', value: new Set(rows.map((r) => r.tecnico)).size },
          { label: 'Produtos', value: new Set(rows.map((r) => r.produto)).size },
          { label: 'Aplicações', value: rows.reduce((s, r) => s + r.aplicacoes, 0) },
        ],
      };
    },
  },
  {
    name: 'Consumo por cliente', group: 'Equipes & Recursos', icon: 'Users',
    question: 'Quanto de produto cada cliente consome',
    build: (f) => {
      const mapa = new Map<string, { cliente: string; produto: string; unidade: string; qty: number; visitas: number }>();
      aplicacoes(f).forEach(({ so, productId, qty }) => {
        const chave = `${so.customerId}|${productId}`;
        const prod = getProduct(productId);
        const a = mapa.get(chave);
        mapa.set(chave, {
          cliente: nomeCliente(so.customerId),
          produto: prod?.name ?? '—',
          unidade: prod?.unit ?? '',
          qty: (a?.qty ?? 0) + qty,
          visitas: (a?.visitas ?? 0) + 1,
        });
      });
      const rows = [...mapa.values()].sort((a, b) => compareText(a.cliente, b.cliente) || b.qty - a.qty);
      return {
        columns: [
          { header: 'Cliente', value: (r) => r.cliente },
          { header: 'Produto', value: (r) => r.produto },
          { header: 'Visitas', value: (r) => r.visitas, align: 'right' },
          { header: 'Quantidade', value: (r) => `${r.qty} ${r.unidade}`, align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Linhas', value: rows.length },
          { label: 'Clientes', value: new Set(rows.map((r) => r.cliente)).size },
          { label: 'Produtos', value: new Set(rows.map((r) => r.produto)).size },
        ],
      };
    },
  },
  {
    name: 'Produtos vencendo / vencidos', group: 'Equipes & Recursos', icon: 'PackageX',
    question: 'Que lote não pode mais ser aplicado, e o que vence antes',
    build: (f) => {
      const q = termo(f);
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const rows = useProductsStore.getState().items
        .flatMap((prod) => (prod.batches ?? []).map((b) => ({ prod, b })))
        .filter(({ b }) => b.expiresAt)
        .map(({ prod, b }) => ({
          produto: prod.name,
          lote: b.code,
          quantidade: `${b.quantity} ${prod.unit}`,
          validade: b.expiresAt as string,
          dias: Math.round((new Date(b.expiresAt as string).setHours(0, 0, 0, 0) - hoje.getTime()) / 86400000),
        }))
        .filter((r) => contem(q, r.produto, r.lote))
        .sort((a, b) => a.dias - b.dias);
      return {
        columns: [
          { header: 'Produto', value: (r) => r.produto },
          { header: 'Lote', value: (r) => r.lote },
          { header: 'Quantidade', value: (r) => r.quantidade, align: 'right' },
          { header: 'Validade', value: (r) => fmtDate(r.validade) },
          { header: 'Situação', value: (r) => (r.dias < 0 ? `Vencido há ${Math.abs(r.dias)} dia(s)` : r.dias === 0 ? 'Vence hoje' : `Vence em ${r.dias} dia(s)`) },
        ],
        rows,
        summary: [
          { label: 'Lotes', value: rows.length },
          { label: 'Vencidos', value: rows.filter((r) => r.dias < 0).length },
          { label: 'Vencem em 30 dias', value: rows.filter((r) => r.dias >= 0 && r.dias <= 30).length },
        ],
      };
    },
  },
  {
    name: 'Movimentação de estoque', group: 'Equipes & Recursos', icon: 'ArrowLeftRight',
    question: 'O que saiu do estoque, para qual atendimento',
    build: (f) => {
      // A saída real de estoque é o produto aplicado num atendimento: é ela que
      // baixa o saldo. Entradas e transferências ficam no módulo de Estoque,
      // que guarda saldo, não histórico.
      const rows = aplicacoes(f)
        .map(({ so, productId, qty }) => {
          const prod = getProduct(productId);
          return {
            data: fmtDate(so.executionDate ?? so.createdAt),
            produto: prod?.name ?? '—',
            quantidade: `${qty} ${prod?.unit ?? ''}`,
            os: `#${so.number}`,
            cliente: nomeCliente(so.customerId),
            tecnico: nomeUsuario(so.technicianIds?.[0] ?? so.technicianId),
          };
        })
        .sort((a, b) => compareText(b.data, a.data));
      const saldoTotal = useStockStore.getState().balances.reduce((s, b) => s + b.quantity, 0);
      return {
        columns: [
          { header: 'Data', value: (r) => r.data },
          { header: 'Produto', value: (r) => r.produto },
          { header: 'Saída', value: (r) => r.quantidade, align: 'right' },
          { header: 'OS', value: (r) => r.os },
          { header: 'Cliente', value: (r) => r.cliente },
          { header: 'Técnico', value: (r) => r.tecnico },
        ],
        rows,
        summary: [
          { label: 'Saídas', value: rows.length },
          { label: 'Produtos movimentados', value: new Set(rows.map((r) => r.produto)).size },
          { label: 'Locais de estoque', value: useStockLocationsStore.getState().items.length },
          { label: 'Saldo atual (unid.)', value: saldoTotal },
        ],
      };
    },
  },
  {
    name: 'Veículos e equipamentos', group: 'Equipes & Recursos', icon: 'Truck',
    question: 'O que está em operação, com quem, e o que precisa de manutenção',
    build: (f) => {
      const q = termo(f);
      const veiculos = useVehiclesStore.getState().items.map((v) => ({
        tipo: 'Veículo',
        identificacao: v.plate,
        descricao: v.model ?? '',
        situacao: v.inOperation === false ? 'Fora de operação' : v.isActive ? 'Em operação' : 'Inativo',
        responsavel: nomeUsuario(v.driverId),
        proximo: v.odometerKm ? `${v.odometerKm.toLocaleString('pt-BR')} km` : '',
      }));
      const equipamentos = useEquipmentStore.getState().items.map((e) => ({
        tipo: 'Equipamento',
        identificacao: e.code ?? e.name,
        descricao: e.kind ? `${e.name} · ${e.kind}` : e.name,
        situacao: e.status,
        responsavel: nomeUsuario(e.checkedOutTo ?? e.assignedTo),
        proximo: e.nextMaintenanceAt ? `Manutenção ${fmtDate(e.nextMaintenanceAt)}` : '',
      }));
      const rows = [...veiculos, ...equipamentos]
        .filter((r) => contem(q, r.identificacao, r.descricao, r.responsavel))
        .sort((a, b) => compareText(a.tipo, b.tipo) || compareText(a.identificacao, b.identificacao));
      return {
        columns: [
          { header: 'Tipo', value: (r) => r.tipo },
          { header: 'Identificação', value: (r) => r.identificacao },
          { header: 'Descrição', value: (r) => r.descricao },
          { header: 'Situação', value: (r) => r.situacao },
          { header: 'Responsável', value: (r) => r.responsavel },
          { header: 'Observação', value: (r) => r.proximo },
        ],
        rows,
        summary: [
          { label: 'Itens', value: rows.length },
          { label: 'Veículos', value: veiculos.length },
          { label: 'Equipamentos', value: equipamentos.length },
          { label: 'Em operação', value: rows.filter((r) => r.situacao === 'Em operação' || r.situacao === 'disponivel').length },
        ],
      };
    },
  },
];

// ── Vencimentos ─────────────────────────────────────────────────────────────

interface ExpiryRow { kind: string; description: string; reference: string; expiresAt: string; daysLeft: number }

function expiryStatus(daysLeft: number): string {
  if (daysLeft < 0) return `Vencido há ${Math.abs(daysLeft)} dia(s)`;
  if (daysLeft === 0) return 'Vence hoje';
  if (daysLeft <= 30) return `Vence em ${daysLeft} dia(s)`;
  return 'Em dia';
}

/**
 * Base dos quatro relatórios de vencimento.
 *
 * O período filtra pela data de VENCIMENTO, e o que já venceu entra sempre,
 * independentemente da data inicial: a pergunta é "o que está vencido ou vence
 * até tal dia", e um vencimento antigo esquecido não pode sumir do relatório
 * só porque saiu da janela.
 */
function vencimentos(f: ReportFilters, tipos: string[]): ReportData {
  const q = termo(f);
  const { end } = rangeBounds(f);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = (iso: string) => Math.round((new Date(iso).setHours(0, 0, 0, 0) - hoje.getTime()) / 86400000);
  const rows: ExpiryRow[] = [];

  if (tipos.includes('Licença / Alvará')) {
    useLicensesStore.getState().items.forEach((l) => {
      if (!l.expiresAt) return;
      rows.push({ kind: 'Licença / Alvará', description: l.name, reference: l.number ? `nº ${l.number}` : (l.issuer ?? ''), expiresAt: l.expiresAt, daysLeft: dias(l.expiresAt) });
    });
  }
  if (tipos.includes('Contrato')) {
    useCustomersStore.getState().customers.forEach((c) => {
      (c.contracts ?? []).forEach((ct) => {
        if (!ct.endDate || ct.status === 'cancelado') return;
        rows.push({ kind: 'Contrato', description: `Contrato · ${ct.renewal ?? 'renovação não definida'}`, reference: c.name, expiresAt: ct.endDate, daysLeft: dias(ct.endDate) });
      });
    });
  }
  if (tipos.includes('Lote de produto')) {
    useProductsStore.getState().items.forEach((prod) => {
      (prod.batches ?? []).forEach((b) => {
        if (!b.expiresAt) return;
        rows.push({ kind: 'Lote de produto', description: `${prod.name} · lote ${b.code}`, reference: `${b.quantity} ${prod.unit}`, expiresAt: b.expiresAt, daysLeft: dias(b.expiresAt) });
      });
    });
  }
  if (tipos.includes('Certificado') || tipos.includes('Validade do serviço')) {
    useServiceOrdersStore.getState().orders.forEach((so) => {
      const date = so.certificateValidityDate ?? so.validityDate;
      if (!date) return;
      rows.push({ kind: so.certificateValidityDate ? 'Certificado' : 'Validade do serviço', description: `OS #${so.number}`, reference: nomeCliente(so.customerId), expiresAt: date, daysLeft: dias(date) });
    });
  }

  const filtradas = rows
    .filter((r) => new Date(r.expiresAt) <= end || r.daysLeft < 0)
    .filter((r) => contem(q, r.description, r.reference, r.kind))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    columns: [
      { header: 'Tipo', value: (r) => r.kind },
      { header: 'Descrição', value: (r) => r.description },
      { header: 'Referência', value: (r) => r.reference },
      { header: 'Vencimento', value: (r) => fmtDate(r.expiresAt) },
      { header: 'Situação', value: (r) => expiryStatus(r.daysLeft) },
    ],
    rows: filtradas,
    summary: [
      { label: 'Itens', value: filtradas.length },
      { label: 'Vencidos', value: filtradas.filter((r) => r.daysLeft < 0).length },
      { label: 'Vencem em 30 dias', value: filtradas.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length },
    ],
  };
}

const VENCIMENTOS: ReportDef[] = [
  { name: 'Licenças e certificados a vencer', group: 'Vencimentos', icon: 'ShieldCheck', question: 'Que documento da empresa vence antes', build: (f) => vencimentos(f, ['Licença / Alvará']) },
  { name: 'Contratos a vencer', group: 'Vencimentos', icon: 'FileClock', question: 'Que contrato precisa de renovação', build: (f) => vencimentos(f, ['Contrato']) },
  { name: 'Lotes de produto vencendo', group: 'Vencimentos', icon: 'PackageX', question: 'Que lote não poderá mais ser aplicado', build: (f) => vencimentos(f, ['Lote de produto']) },
  { name: 'Validade de serviços executados', group: 'Vencimentos', icon: 'CalendarClock', question: 'Que garantia de serviço está acabando', build: (f) => vencimentos(f, ['Certificado', 'Validade do serviço']) },
];

// ── Financeiro & Fiscal ─────────────────────────────────────────────────────

const FINANCEIRO: ReportDef[] = [
  {
    name: 'Faturamento', group: 'Financeiro & Fiscal', icon: 'TrendingUp',
    question: 'Quanto foi faturado, quanto entrou e quanto falta entrar',
    build: (f) => {
      const rows = lancamentosFiltrados(f, 'receita');
      const recebido = rows.filter((e) => e.status === 'pago');
      const aberto = rows.filter((e) => e.status !== 'pago' && e.status !== 'cancelado');
      return {
        columns: [
          { header: 'Vencimento', value: (e) => (e.dueDate ? fmtDate(e.dueDate) : '') },
          { header: 'Cliente', value: (e) => nomeCliente(e.customerId) },
          { header: 'Descrição', value: (e) => e.description },
          { header: 'Status', value: (e) => e.status },
          { header: 'Recebido em', value: (e) => (e.paidAt ? fmtDate(e.paidAt) : '') },
          { header: 'Valor (R$)', value: (e) => formatCurrency(liquido(e)), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Lançamentos', value: rows.length },
          { label: 'Faturado', value: formatCurrency(rows.reduce((s, e) => s + liquido(e), 0)) },
          { label: 'Recebido', value: formatCurrency(recebido.reduce((s, e) => s + liquido(e), 0)) },
          { label: 'A receber', value: formatCurrency(aberto.reduce((s, e) => s + liquido(e), 0)) },
        ],
      };
    },
  },
  {
    name: 'Custos operacionais', group: 'Financeiro & Fiscal', icon: 'TrendingDown',
    question: 'Para onde o dinheiro foi, por tipo de despesa',
    build: (f) => {
      const despesas = lancamentosFiltrados(f, 'despesa');
      const mapa = new Map<string, { tipo: string; lancamentos: number; total: number; pago: number }>();
      despesas.forEach((e) => {
        const tipo = e.taxKind || 'Operacional';
        const a = mapa.get(tipo) ?? { tipo, lancamentos: 0, total: 0, pago: 0 };
        mapa.set(tipo, {
          tipo,
          lancamentos: a.lancamentos + 1,
          total: a.total + liquido(e),
          pago: a.pago + (e.status === 'pago' ? liquido(e) : 0),
        });
      });
      const rows = [...mapa.values()].sort((a, b) => b.total - a.total);
      const total = rows.reduce((s, r) => s + r.total, 0);
      return {
        columns: [
          { header: 'Tipo de despesa', value: (r) => r.tipo },
          { header: 'Lançamentos', value: (r) => r.lancamentos, align: 'right' },
          { header: 'Pago (R$)', value: (r) => formatCurrency(r.pago), align: 'right' },
          { header: 'Em aberto (R$)', value: (r) => formatCurrency(r.total - r.pago), align: 'right' },
          { header: 'Total (R$)', value: (r) => formatCurrency(r.total), align: 'right' },
          { header: '% do custo', value: (r) => (total ? `${((r.total / total) * 100).toFixed(0)}%` : '—'), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Tipos', value: rows.length },
          { label: 'Despesas', value: despesas.length },
          { label: 'Custo total', value: formatCurrency(total) },
          { label: 'Maior custo', value: rows[0]?.tipo ?? '—' },
        ],
      };
    },
  },
  {
    name: 'Lucro e DRE', group: 'Financeiro & Fiscal', icon: 'PiggyBank',
    question: 'Receita menos despesa, mês a mês',
    build: (f) => {
      const { start, end } = rangeBounds(f);
      const todos = useFinanceStore.getState().items
        .filter((e) => e.status !== 'cancelado')
        .filter((e) => inRange(e.dueDate ?? e.createdAt, start, end));
      const mapa = new Map<string, { mes: string; receita: number; despesa: number }>();
      todos.forEach((e) => {
        const mes = (e.dueDate ?? e.createdAt).slice(0, 7);
        const a = mapa.get(mes) ?? { mes, receita: 0, despesa: 0 };
        if (e.type === 'receita') a.receita += liquido(e); else a.despesa += liquido(e);
        mapa.set(mes, a);
      });
      const rows = [...mapa.values()]
        .map((r) => ({ ...r, resultado: r.receita - r.despesa, margem: r.receita ? ((r.receita - r.despesa) / r.receita) * 100 : 0 }))
        .sort((a, b) => compareText(a.mes, b.mes));
      const receita = rows.reduce((s, r) => s + r.receita, 0);
      const despesa = rows.reduce((s, r) => s + r.despesa, 0);
      const mesRef = (mes: string) => {
        const [ano, m] = mes.split('-');
        return `${m}/${ano}`;
      };
      return {
        columns: [
          { header: 'Mês', value: (r) => mesRef(r.mes) },
          { header: 'Receita (R$)', value: (r) => formatCurrency(r.receita), align: 'right' },
          { header: 'Despesa (R$)', value: (r) => formatCurrency(r.despesa), align: 'right' },
          { header: 'Resultado (R$)', value: (r) => formatCurrency(r.resultado), align: 'right' },
          { header: 'Margem', value: (r) => `${r.margem.toFixed(0)}%`, align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Meses', value: rows.length },
          { label: 'Receita', value: formatCurrency(receita) },
          { label: 'Despesa', value: formatCurrency(despesa) },
          { label: 'Resultado', value: formatCurrency(receita - despesa) },
        ],
      };
    },
  },
  {
    name: 'Comissões', group: 'Financeiro & Fiscal', icon: 'HandCoins',
    question: 'Quanto cada vendedor trouxe — a base de cálculo da comissão',
    build: (f) => {
      // O sistema ainda não guarda percentual de comissão por vendedor; o que
      // dá para responder com honestidade é a BASE: o que cada um vendeu.
      const comVendedor = ordensFiltradas(f).filter((so) => so.sellerId);
      const mapa = new Map<string, { vendedor: string; ordens: number; base: number; recebido: number }>();
      comVendedor.forEach((so) => {
        const id = so.sellerId as string;
        const a = mapa.get(id) ?? { vendedor: nomeUsuario(id) || '—', ordens: 0, base: 0, recebido: 0 };
        mapa.set(id, {
          vendedor: a.vendedor,
          ordens: a.ordens + 1,
          base: a.base + valorOs(so),
          recebido: a.recebido + (so.paymentStatus === 'pago' ? valorOs(so) : 0),
        });
      });
      const rows = [...mapa.values()].sort((a, b) => b.base - a.base);
      return {
        columns: [
          { header: 'Vendedor', value: (r) => r.vendedor },
          { header: 'Ordens', value: (r) => r.ordens, align: 'right' },
          { header: 'Base de cálculo (R$)', value: (r) => formatCurrency(r.base), align: 'right' },
          { header: 'Já recebido (R$)', value: (r) => formatCurrency(r.recebido), align: 'right' },
          { header: 'Ticket médio (R$)', value: (r) => formatCurrency(r.ordens ? r.base / r.ordens : 0), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Vendedores', value: rows.length },
          { label: 'Ordens com vendedor', value: comVendedor.length },
          { label: 'Base total', value: formatCurrency(rows.reduce((s, r) => s + r.base, 0)) },
          { label: 'Já recebido', value: formatCurrency(rows.reduce((s, r) => s + r.recebido, 0)) },
        ],
      };
    },
  },
  {
    name: 'Relatório fiscal', group: 'Financeiro & Fiscal', icon: 'FileText',
    question: 'Notas emitidas, ISS e retenções do período',
    build: (f) => {
      const { start, end } = rangeBounds(f);
      const q = termo(f);
      const rows = useInvoicesStore.getState().invoices
        .filter((i) => inRange(i.issuedAt, start, end))
        .filter((i) => !f.customerId || i.customerId === f.customerId)
        .filter((i) => contem(q, i.number, nomeCliente(i.customerId), i.description, i.status))
        .sort((a, b) => b.number - a.number);
      const emitidas = rows.filter((i) => i.status === 'emitida');
      const bruto = emitidas.reduce((s, i) => s + i.amount, 0);
      const iss = emitidas.reduce((s, i) => s + i.taxAmount, 0);
      const retencoes = emitidas.reduce((s, i) => s + (i.taxes?.totalRetencoes ?? 0), 0);
      return {
        columns: [
          { header: 'Nota', value: (i) => i.number },
          { header: 'Emissão', value: (i) => fmtDate(i.issuedAt) },
          { header: 'Tomador', value: (i) => nomeCliente(i.customerId) },
          { header: 'Situação', value: (i) => i.status },
          { header: 'Bruto (R$)', value: (i) => formatCurrency(i.amount), align: 'right' },
          { header: 'ISS (R$)', value: (i) => formatCurrency(i.taxAmount), align: 'right' },
          { header: 'Retenções (R$)', value: (i) => formatCurrency(i.taxes?.totalRetencoes ?? 0), align: 'right' },
          { header: 'Líquido (R$)', value: (i) => formatCurrency(i.taxes?.net ?? i.amount - i.taxAmount), align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Notas', value: rows.length },
          { label: 'Faturamento bruto', value: formatCurrency(bruto) },
          { label: 'ISS', value: formatCurrency(iss) },
          { label: 'Líquido a receber', value: formatCurrency(bruto - iss - retencoes) },
        ],
      };
    },
  },
  {
    name: 'Licenças e conformidade', group: 'Financeiro & Fiscal', icon: 'ShieldCheck',
    question: 'A empresa está regular, e o que os clientes precisam corrigir',
    build: (f) => {
      const q = termo(f);
      const { start, end } = rangeBounds(f);
      const hoje = new Date();
      const licencas = useLicensesStore.getState().items.map((l) => ({
        origem: 'Licença da empresa',
        item: l.name,
        referencia: l.number ? `nº ${l.number}` : (l.issuer ?? ''),
        data: l.expiresAt ? fmtDate(l.expiresAt) : '',
        situacao: !l.expiresAt ? 'Sem validade' : new Date(l.expiresAt) < hoje ? 'Vencida' : 'Ativa',
      }));
      const ncs = useNonConformitiesStore.getState().items
        .filter((n) => inRange(n.date, start, end))
        .filter((n) => !f.customerId || n.customerId === f.customerId)
        .map((n) => ({
          origem: 'Não conformidade',
          item: n.description,
          referencia: nomeCliente(n.customerId),
          data: fmtDate(n.date),
          situacao: n.status === 'resolvida' ? 'Resolvida' : n.status === 'em_andamento' ? 'Em andamento' : 'Aberta',
        }));
      const rows = [...licencas, ...ncs].filter((r) => contem(q, r.item, r.referencia, r.situacao));
      return {
        columns: [
          { header: 'Origem', value: (r) => r.origem },
          { header: 'Item', value: (r) => r.item },
          { header: 'Referência', value: (r) => r.referencia },
          { header: 'Data', value: (r) => r.data },
          { header: 'Situação', value: (r) => r.situacao },
        ],
        rows,
        summary: [
          { label: 'Itens', value: rows.length },
          { label: 'Licenças vencidas', value: licencas.filter((l) => l.situacao === 'Vencida').length },
          { label: 'Não conformidades abertas', value: ncs.filter((n) => n.situacao !== 'Resolvida').length },
        ],
      };
    },
  },
];

// ── Registro ────────────────────────────────────────────────────────────────

export const REPORTS: ReportDef[] = [...OPERACAO, ...EQUIPES, ...VENCIMENTOS, ...FINANCEIRO];

/** Grupos na ordem em que aparecem na tela. */
export const REPORT_GROUPS = [...new Set(REPORTS.map((r) => r.group))];

export function reportsOfGroup(group: string): ReportDef[] {
  return REPORTS.filter((r) => r.group === group);
}

export function buildReport(name: string, f: ReportFilters): ReportData {
  const def = REPORTS.find((r) => r.name === name);
  if (!def) return { columns: [], rows: [], summary: [] };
  return def.build(f);
}
