import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { Input, Select } from '../components/ui/Field';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getServiceType, getUser } from '@/application/repository';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useProductsStore } from '@/store/entityStores';
import { useCustomersStore } from '@/store/customersStore';
import { downloadCsv, downloadXls } from '@/lib/export';
import { printDataReport, type ReportColumn } from '@/lib/printReports';
import { fmtDate } from '@/lib/date';
import { formatCurrency } from '@/lib/utils';

interface Filters { search: string; customerId: string; technicianId: string; serviceTypeId: string; range: string }
interface ReportData {
  columns: ReportColumn<any>[];
  rows: any[];
  summary: { label: string; value: string | number }[];
}

function cutoffFor(range: string): Date {
  const now = Date.now();
  if (range === '7d') return new Date(now - 7 * 864e5);
  if (range === '30d') return new Date(now - 30 * 864e5);
  if (range === '90d') return new Date(now - 90 * 864e5);
  return new Date(new Date().getFullYear(), 0, 1);
}

/** Monta o conjunto de dados do relatório aplicando os filtros e a pesquisa. */
function buildReport(group: string, f: Filters): ReportData {
  const q = f.search.trim().toLowerCase();
  const cutoff = cutoffFor(f.range);

  if (group === 'Financeiro & Fiscal') {
    let rows = seed.financeEntries.filter((e) => new Date(e.dueDate ?? e.createdAt) >= cutoff);
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
  let rows = useServiceOrdersStore.getState().orders.filter((so) => new Date(so.createdAt) >= cutoff);
  if (f.customerId) rows = rows.filter((so) => so.customerId === f.customerId);
  if (f.technicianId) rows = rows.filter((so) => so.technicianId === f.technicianId);
  if (f.serviceTypeId) rows = rows.filter((so) => so.serviceTypeId === f.serviceTypeId);
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
  { group: 'Financeiro & Fiscal', items: [
    { name: 'Faturamento', icon: 'TrendingUp' },
    { name: 'Custos operacionais', icon: 'TrendingDown' },
    { name: 'Lucro e DRE', icon: 'PiggyBank' },
    { name: 'Comissões', icon: 'HandCoins' },
    { name: 'Relatório fiscal', icon: 'FileText' },
    { name: 'Licenças e conformidade', icon: 'ShieldCheck' },
  ] },
];

const RANGE_LABEL: Record<string, string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', year: 'Este ano' };
const fileName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

export function RelatoriosPage() {
  const customers = useCustomersStore((s) => s.customers);
  useServiceOrdersStore((s) => s.orders); // reatividade das contagens
  useProductsStore((s) => s.items);

  const [f, setF] = useState<Filters>({ search: '', customerId: '', technicianId: '', serviceTypeId: '', range: 'year' });
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const hasFilter = !!(f.search || f.customerId || f.technicianId || f.serviceTypeId) || f.range !== 'year';

  // Contagem por grupo, reativa aos filtros.
  const counts = useMemo(() => ({
    'Operação': buildReport('Operação', f).rows.length,
    'Equipes & Recursos': buildReport('Equipes & Recursos', f).rows.length,
    'Financeiro & Fiscal': buildReport('Financeiro & Fiscal', f).rows.length,
  }), [f]);

  const subtitleFor = (group: string) => {
    const parts = [RANGE_LABEL[f.range]];
    if (f.customerId) parts.push(getCustomer(f.customerId)?.name ?? '');
    if (f.technicianId) parts.push(getUser(f.technicianId)?.name ?? '');
    if (f.serviceTypeId) parts.push(getServiceType(f.serviceTypeId)?.name ?? '');
    if (f.search) parts.push(`"${f.search}"`);
    return `${group} · ${parts.filter(Boolean).join(' · ')}`;
  };

  const exportPdf = (group: string, name: string) => { const { columns, rows, summary } = buildReport(group, f); printDataReport(name, subtitleFor(group), columns, rows, summary); };
  const exportXls = (group: string, name: string) => { const { columns, rows } = buildReport(group, f); downloadXls(fileName(name), rows, columns, `${name} — ${RANGE_LABEL[f.range]}`); };
  const exportCsv = (group: string, name: string) => { const { columns, rows } = buildReport(group, f); downloadCsv(fileName(name), rows, columns); };

  return (
    <div>
      <PageHeader title="Relatórios" description="Filtre, pesquise e exporte exatamente o que precisa" />

      {/* Barra de filtros e pesquisa — aplica-se à exportação e às contagens */}
      <Card className="mb-6">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Pesquisar (cliente, serviço, técnico, status…)" className="pl-9" />
          </div>
          <Select value={f.customerId} onChange={(e) => set({ customerId: e.target.value })} aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={f.technicianId} onChange={(e) => set({ technicianId: e.target.value })} aria-label="Filtrar por técnico">
            <option value="">Todos os técnicos</option>
            {seed.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select value={f.serviceTypeId} onChange={(e) => set({ serviceTypeId: e.target.value })} aria-label="Filtrar por serviço">
            <option value="">Todos os serviços</option>
            {seed.serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
            <Select value={f.range} onChange={(e) => set({ range: e.target.value })} className="sm:max-w-[200px]" aria-label="Período">
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="year">Este ano</option>
            </Select>
            {hasFilter && (
              <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={() => setF({ search: '', customerId: '', technicianId: '', serviceTypeId: '', range: 'year' })}>Limpar filtros</Button>
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
                        <p className="text-xs text-muted-foreground">{RANGE_LABEL[f.range]} · {counts[section.group as keyof typeof counts]} registro(s)</p>
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
