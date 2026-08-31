import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { DateInput, Input, Select } from '../components/ui/Field';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getServiceType, getUser } from '@/application/repository';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useLicensesStore, useProductsStore, useUsersStore } from '@/store/entityStores';
import { useCustomersStore } from '@/store/customersStore';
import { downloadCsv, downloadXls } from '@/lib/export';
import { printDataReport, type ReportColumn } from '@/lib/printReports';
import { fmtDate, toDateInputValue } from '@/lib/date';
import { formatCurrency, sortByName } from '@/lib/utils';
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from '@/domain/enums';

interface Filters { search: string; customerId: string; technicianId: string; serviceTypeId: string; status: string; startDate: string; endDate: string }
interface ReportData {
  columns: ReportColumn<any>[];
  rows: any[];
  summary: { label: string; value: string | number }[];
}

/** Início/fim do período respeitam exatamente as datas escolhidas — início às
 *  00:00 e fim às 23:59:59 do dia selecionado, sem depender de presets fixos. */
function rangeBounds(f: Filters): { start: Date; end: Date } {
  const start = f.startDate ? new Date(`${f.startDate}T00:00:00`) : new Date(0);
  const end = f.endDate ? new Date(`${f.endDate}T23:59:59.999`) : new Date();
  return { start, end };
}
const inRange = (iso: string, start: Date, end: Date) => { const d = new Date(iso); return d >= start && d <= end; };

const defaultFilters = (): Filters => ({
  search: '', customerId: '', technicianId: '', serviceTypeId: '', status: '',
  startDate: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)),
  endDate: toDateInputValue(new Date()),
});

/** Uma coisa que vence: licença da empresa, contrato do cliente, lote de
 *  produto ou validade de um serviço executado. */
interface ExpiryRow {
  kind: string;
  description: string;
  reference: string;
  expiresAt: string;
  daysLeft: number;
}

/** Quais tipos cada card do grupo "Vencimentos" mostra. */
const EXPIRY_REPORT_KINDS: Record<string, string[]> = {
  'Licenças e certificados a vencer': ['Licença / Alvará'],
  'Contratos a vencer': ['Contrato'],
  'Lotes de produto vencendo': ['Lote de produto'],
  'Validade de serviços executados': ['Certificado', 'Validade do serviço'],
};

/** Situação legível a partir dos dias restantes. */
function expiryStatus(daysLeft: number): string {
  if (daysLeft < 0) return `Vencido há ${Math.abs(daysLeft)} dia(s)`;
  if (daysLeft === 0) return 'Vence hoje';
  if (daysLeft <= 30) return `Vence em ${daysLeft} dia(s)`;
  return 'Em dia';
}

/**
 * Tudo que tem prazo, num lugar só — o que já venceu e o que vence em breve.
 * Contrato vencido é receita perdida e licença vencida é risco legal, então
 * ambos precisam aparecer antes da data, não depois.
 *
 * Diferente dos outros relatórios, aqui o período filtra pela data de
 * vencimento e o que já venceu entra sempre (independente da data inicial):
 * a pergunta útil é "o que está vencido ou vence até tal dia", e um vencimento
 * antigo esquecido não pode sumir do relatório só porque saiu da janela.
 */
function buildExpiryReport(f: Filters, reportName?: string): ReportData {
  const q = f.search.trim().toLowerCase();
  const { end } = rangeBounds(f);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysFrom = (iso: string) => Math.round((new Date(iso).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);

  const rows: ExpiryRow[] = [];

  // Licenças, alvarás e registros da empresa.
  useLicensesStore.getState().items.forEach((l) => {
    if (!l.expiresAt) return;
    rows.push({
      kind: 'Licença / Alvará',
      description: l.name,
      reference: l.number ? `nº ${l.number}` : (l.issuer ?? ''),
      expiresAt: l.expiresAt,
      daysLeft: daysFrom(l.expiresAt),
    });
  });

  // Contratos dos clientes.
  useCustomersStore.getState().customers.forEach((c) => {
    (c.contracts ?? []).forEach((ct) => {
      if (!ct.endDate || ct.status === 'cancelado') return;
      rows.push({
        kind: 'Contrato',
        description: `Contrato · ${ct.renewal ?? 'renovação não definida'}`,
        reference: c.name,
        expiresAt: ct.endDate,
        daysLeft: daysFrom(ct.endDate),
      });
    });
  });

  // Lotes de produto — produto vencido não pode ser aplicado.
  useProductsStore.getState().items.forEach((prod) => {
    (prod.batches ?? []).forEach((b) => {
      if (!b.expiresAt) return;
      rows.push({
        kind: 'Lote de produto',
        description: `${prod.name} · lote ${b.code}`,
        reference: `${b.quantity} ${prod.unit}`,
        expiresAt: b.expiresAt,
        daysLeft: daysFrom(b.expiresAt),
      });
    });
  });

  // Validade do serviço/certificado emitido por OS.
  useServiceOrdersStore.getState().orders.forEach((so) => {
    const date = so.certificateValidityDate ?? so.validityDate;
    if (!date) return;
    rows.push({
      kind: so.certificateValidityDate ? 'Certificado' : 'Validade do serviço',
      description: `OS #${so.number}`,
      reference: getCustomer(so.customerId)?.name ?? '',
      expiresAt: date,
      daysLeft: daysFrom(date),
    });
  });

  // Cada card do grupo mostra só o seu tipo — clicar em "Contratos a vencer"
  // e receber a lista inteira não ajuda ninguém.
  const kinds = reportName ? EXPIRY_REPORT_KINDS[reportName] : undefined;
  let filtered = rows.filter((r) => (!kinds || kinds.includes(r.kind))
    && (new Date(r.expiresAt) <= end || r.daysLeft < 0));
  if (f.customerId) {
    const nome = getCustomer(f.customerId)?.name ?? '';
    filtered = filtered.filter((r) => r.reference === nome);
  }
  if (q) {
    filtered = filtered.filter((r) =>
      r.description.toLowerCase().includes(q)
      || r.reference.toLowerCase().includes(q)
      || r.kind.toLowerCase().includes(q));
  }
  // Mais urgente primeiro.
  filtered.sort((a, b) => a.daysLeft - b.daysLeft);

  const vencidos = filtered.filter((r) => r.daysLeft < 0).length;
  const em30 = filtered.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length;

  return {
    columns: [
      { header: 'Tipo', value: (r: ExpiryRow) => r.kind },
      { header: 'Descrição', value: (r: ExpiryRow) => r.description },
      { header: 'Referência', value: (r: ExpiryRow) => r.reference },
      { header: 'Vencimento', value: (r: ExpiryRow) => fmtDate(r.expiresAt) },
      { header: 'Situação', value: (r: ExpiryRow) => expiryStatus(r.daysLeft) },
    ],
    rows: filtered,
    summary: [
      { label: 'Itens', value: filtered.length },
      { label: 'Vencidos', value: vencidos },
      { label: 'Vencem em 30 dias', value: em30 },
    ],
  };
}

/** Monta o conjunto de dados do relatório aplicando os filtros e a pesquisa. */
function buildReport(group: string, f: Filters, reportName?: string): ReportData {
  if (group === 'Vencimentos') return buildExpiryReport(f, reportName);

  const q = f.search.trim().toLowerCase();
  const { start, end } = rangeBounds(f);

  if (group === 'Financeiro & Fiscal') {
    let rows = seed.financeEntries.filter((e) => inRange(e.dueDate ?? e.createdAt, start, end));
    if (f.customerId) rows = rows.filter((e) => e.customerId === f.customerId);
    if (q) rows = rows.filter((e) => e.description.toLowerCase().includes(q) || e.type.includes(q) || e.status.includes(q));
    const receita = rows.filter((e) => e.type === 'receita').reduce((s, e) => s + e.amount, 0);
    const despesa = rows.filter((e) => e.type === 'despesa').reduce((s, e) => s + e.amount, 0);
    return {
      columns: [
        { header: 'Descrição', value: (e) => e.description },
        { header: 'Cliente', value: (e) => getCustomer(e.customerId)?.name ?? '' },
        { header: 'Tipo', value: (e) => (e.type === 'receita' ? 'Receita' : 'Despesa') },
        { header: 'Status', value: (e) => e.status },
        { header: 'Valor (R$)', value: (e) => formatCurrency(e.amount), align: 'right' },
        { header: 'Vencimento', value: (e) => (e.dueDate ? fmtDate(e.dueDate) : '') },
      ],
      rows,
      summary: [
        { label: 'Lançamentos', value: rows.length },
        { label: 'Receitas', value: formatCurrency(receita) },
        { label: 'Despesas', value: formatCurrency(despesa) },
        { label: 'Saldo', value: formatCurrency(receita - despesa) },
      ],
    };
  }

  if (group === 'Equipes & Recursos') {
    let rows = useProductsStore.getState().items;
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q) || (p.activeIngredient ?? '').toLowerCase().includes(q));
    return {
      columns: [
        { header: 'Produto', value: (p) => p.name },
        { header: 'Princípio ativo', value: (p) => p.activeIngredient ?? '' },
        { header: 'Unidade', value: (p) => p.unit },
        { header: 'Estoque mínimo', value: (p) => p.minQuantity, align: 'right' },
        { header: 'Preço (R$)', value: (p) => formatCurrency(p.price), align: 'right' },
      ],
      rows,
      summary: [
        { label: 'Produtos', value: rows.length },
        { label: 'Regulados', value: rows.filter((p) => p.isRegulated).length },
      ],
    };
  }

  // Operação (padrão): ordens de serviço
  let rows = useServiceOrdersStore.getState().orders.filter((so) => inRange(so.createdAt, start, end));
  if (f.customerId) rows = rows.filter((so) => so.customerId === f.customerId);
  if (f.technicianId) rows = rows.filter((so) => so.technicianId === f.technicianId);
  if (f.serviceTypeId) rows = rows.filter((so) => so.serviceTypeId === f.serviceTypeId);
  if (f.status) rows = rows.filter((so) => so.status === f.status);
  if (q) rows = rows.filter((so) =>
    `#${so.number}`.includes(q)
    || (getCustomer(so.customerId)?.name ?? '').toLowerCase().includes(q)
    || (getServiceType(so.serviceTypeId)?.name ?? '').toLowerCase().includes(q)
    || (getUser(so.technicianId)?.name ?? '').toLowerCase().includes(q)
    || so.status.includes(q));
  const finalizadas = rows.filter((so) => so.status === 'concluida').length;
  const totalMin = rows.reduce((s, so) => s + (so.totalMinutes ?? 0), 0);
  return {
    columns: [
      { header: 'OS', value: (so) => `#${so.number}` },
      { header: 'Cliente', value: (so) => getCustomer(so.customerId)?.name ?? '' },
      { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
      { header: 'Técnico', value: (so) => getUser(so.technicianId)?.name ?? '' },
      { header: 'Status', value: (so) => so.status },
      { header: 'Duração (min)', value: (so) => so.totalMinutes ?? '', align: 'right' },
    ],
    rows,
    summary: [
      { label: 'Ordens', value: rows.length },
      { label: 'Finalizadas', value: finalizadas },
      { label: 'Tempo total', value: `${Math.round(totalMin / 60)}h` },
    ],
  };
}

const reports = [
  { group: 'Operação', items: [
    { name: 'Atendimentos por período', icon: 'CalendarCheck' },
    { name: 'Agendamentos e ocupação', icon: 'CalendarDays' },
    { name: 'Ordens de Serviço', icon: 'ClipboardList' },
    { name: 'Tempo médio de atendimento', icon: 'Timer' },
    { name: 'Tempo médio de deslocamento', icon: 'Navigation' },
    { name: 'Cancelamentos e reagendamentos', icon: 'CalendarX' },
  ] },
  { group: 'Equipes & Recursos', items: [
    { name: 'Eficiência por técnico', icon: 'Gauge' },
    { name: 'Consumo por técnico', icon: 'Boxes' },
    { name: 'Consumo por cliente', icon: 'Users' },
    { name: 'Produtos vencendo / vencidos', icon: 'PackageX' },
    { name: 'Movimentação de estoque', icon: 'ArrowLeftRight' },
    { name: 'Veículos e equipamentos', icon: 'Truck' },
  ] },
  { group: 'Vencimentos', items: [
    { name: 'Licenças e certificados a vencer', icon: 'ShieldCheck' },
    { name: 'Contratos a vencer', icon: 'FileClock' },
    { name: 'Lotes de produto vencendo', icon: 'PackageX' },
    { name: 'Validade de serviços executados', icon: 'CalendarClock' },
  ] },
  { group: 'Financeiro & Fiscal', items: [
    { name: 'Faturamento', icon: 'TrendingUp' },
    { name: 'Custos operacionais', icon: 'TrendingDown' },
    { name: 'Lucro e DRE', icon: 'PiggyBank' },
    { name: 'Comissões', icon: 'HandCoins' },
    { name: 'Relatório fiscal', icon: 'FileText' },
    { name: 'Licenças e conformidade', icon: 'ShieldCheck' },
  ] },
];

const fileName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

/** Atalhos que só preenchem período inicial/final — não substituem a escolha
 *  livre de datas, apenas evitam digitar um intervalo comum manualmente. */
const QUICK_RANGES: { label: string; days: number }[] = [
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

/** Datas que um atalho de período produziria hoje — usado tanto para aplicar
 *  quanto para saber se ele já está aplicado (e então desmarcar). */
function quickRangeDates(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
}

export function RelatoriosPage() {
  const customers = useCustomersStore((s) => s.customers);
  const technicians = useUsersStore((s) => sortByName(s.items.filter((u) => u.role === 'tecnico')));
  useServiceOrdersStore((s) => s.orders); // reatividade das contagens
  useProductsStore((s) => s.items);

  const [f, setF] = useState<Filters>(defaultFilters);
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const def = useMemo(defaultFilters, []);
  const hasFilter = !!(f.search || f.customerId || f.technicianId || f.serviceTypeId || f.status) || f.startDate !== def.startDate || f.endDate !== def.endDate;

  // Período exibido de forma legível — respeita exatamente as datas escolhidas.
  const rangeLabel = `${f.startDate ? fmtDate(f.startDate) : '…'} até ${f.endDate ? fmtDate(f.endDate) : '…'}`;
  /** Qual atalho está aplicado agora, se algum — comparando as datas do
   *  filtro com o que cada atalho produziria hoje. */
  const activeQuickRange = QUICK_RANGES.find((qr) => {
    const r = quickRangeDates(qr.days);
    return f.startDate === r.startDate && f.endDate === r.endDate;
  })?.days;

  /** Um clique marca o período; outro clique no mesmo desmarca e devolve o
   *  intervalo padrão (do início do ano até hoje). */
  const toggleQuickRange = (days: number) => {
    if (activeQuickRange === days) {
      set({ startDate: def.startDate, endDate: def.endDate });
      return;
    }
    set(quickRangeDates(days));
  };

  // Contagem por grupo, reativa aos filtros.
  const counts = useMemo(() => ({
    'Operação': buildReport('Operação', f).rows.length,
    'Equipes & Recursos': buildReport('Equipes & Recursos', f).rows.length,
    'Vencimentos': buildReport('Vencimentos', f).rows.length,
    'Financeiro & Fiscal': buildReport('Financeiro & Fiscal', f).rows.length,
  }), [f]);

  const subtitleFor = (group: string) => {
    const parts = [rangeLabel];
    if (f.customerId) parts.push(getCustomer(f.customerId)?.name ?? '');
    if (f.technicianId) parts.push(getUser(f.technicianId)?.name ?? '');
    if (f.serviceTypeId) parts.push(getServiceType(f.serviceTypeId)?.name ?? '');
    if (f.status) parts.push(SERVICE_ORDER_STATUS_META[f.status as ServiceOrderStatus]?.label ?? f.status);
    if (f.search) parts.push(`"${f.search}"`);
    return `${group} · ${parts.filter(Boolean).join(' · ')}`;
  };

  const exportPdf = (group: string, name: string) => { const { columns, rows, summary } = buildReport(group, f, name); printDataReport(name, subtitleFor(group), columns, rows, summary); };
  const exportXls = (group: string, name: string) => { const { columns, rows } = buildReport(group, f, name); downloadXls(fileName(name), rows, columns, `${name} — ${rangeLabel}`); };
  const exportCsv = (group: string, name: string) => { const { columns, rows } = buildReport(group, f, name); downloadCsv(fileName(name), rows, columns); };

  return (
    <div>
      <PageHeader title="Relatórios" description="Filtre, pesquise e exporte exatamente o que precisa" />

      {/* Barra de filtros e pesquisa — aplica-se à exportação e às contagens.
       *  Período inicial/final são livres (qualquer intervalo); os demais
       *  filtros são opcionais e não exigem seleção para restringir só por data. */}
      <Card className="mb-6">
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Período inicial</label>
              <DateInput type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} aria-label="Período inicial" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Período final</label>
              <DateInput type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} aria-label="Período final" />
            </div>
            <div className="flex items-end gap-1.5">
              {QUICK_RANGES.map((qr) => {
                const ativo = activeQuickRange === qr.days;
                return (
                  <Button
                    key={qr.label}
                    type="button"
                    variant={ativo ? 'primary' : 'outline'}
                    size="sm"
                    aria-pressed={ativo}
                    title={ativo ? `Clique para desmarcar ${qr.label}` : `Últimos ${qr.label}`}
                    onClick={() => toggleQuickRange(qr.days)}
                  >
                    {qr.label}
                  </Button>
                );
              })}
            </div>
            {/* O `relative` precisa envolver só o campo: no contêiner
                `items-end` (mais alto que o input) o `top-1/2` centralizava a
                lupa na altura da linha inteira, não na do campo. */}
            <div className="flex items-end">
              <div className="relative w-full">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Pesquisar…" className="pl-9" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={f.customerId} onChange={(e) => set({ customerId: e.target.value })} aria-label="Filtrar por cliente">
              <option value="">Todos os clientes</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={f.technicianId} onChange={(e) => set({ technicianId: e.target.value })} aria-label="Filtrar por técnico">
              <option value="">Todos os técnicos</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={f.serviceTypeId} onChange={(e) => set({ serviceTypeId: e.target.value })} aria-label="Filtrar por serviço">
              <option value="">Todos os serviços</option>
              {seed.serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {(Object.keys(SERVICE_ORDER_STATUS_META) as ServiceOrderStatus[]).map((s) => <option key={s} value={s}>{SERVICE_ORDER_STATUS_META[s].label}</option>)}
            </Select>
            {hasFilter && (
              <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={() => setF(defaultFilters())}>Limpar filtros</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        {reports.map((section) => (
          <div key={section.group}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{section.group}</h2>
              <span className="text-xs text-muted-foreground">{counts[section.group as keyof typeof counts]} registro(s) no filtro</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((r, i) => (
                <motion.div key={r.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card hover className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Icon name={r.icon} size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{rangeLabel} · {buildReport(section.group, f, r.name).rows.length} registro(s)</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <Button variant="outline" size="sm" leftIcon={<FileText size={13} />} onClick={() => exportPdf(section.group, r.name)}>PDF</Button>
                      <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet size={13} />} onClick={() => exportXls(section.group, r.name)}>Excel</Button>
                      <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={() => exportCsv(section.group, r.name)}>CSV</Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
