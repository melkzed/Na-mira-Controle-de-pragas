import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { Badge } from '../components/ui/Badge';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getServiceType, getUser } from '@/application/repository';
import { downloadCsv, downloadXls } from '@/lib/export';
import { printDataReport, type ReportColumn } from '@/lib/printReports';
import { fmtDate } from '@/lib/date';
import { formatCurrency } from '@/lib/utils';

interface ReportData {
  columns: ReportColumn<any>[];
  rows: any[];
  summary: { label: string; value: string | number }[];
}

/** Monta o conjunto de dados do relatório solicitado (colunas + linhas + resumo). */
function buildReport(group: string): ReportData {
  if (group === 'Financeiro & Fiscal') {
    const rows = seed.financeEntries;
    const receita = rows.filter((e) => e.type === 'receita').reduce((s, e) => s + e.amount, 0);
    const despesa = rows.filter((e) => e.type === 'despesa').reduce((s, e) => s + e.amount, 0);
    return {
      columns: [
        { header: 'Descrição', value: (e) => e.description },
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
    const rows = seed.products;
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
  const rows = seed.serviceOrders;
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

export function RelatoriosPage() {
  const [range, setRange] = useState('30d');
  const rangeLabel: Record<string, string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', year: 'Este ano' };

  const fileName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

  const exportPdf = (group: string, name: string) => {
    const { columns, rows, summary } = buildReport(group);
    printDataReport(name, `Relatório · ${rangeLabel[range]}`, columns, rows, summary);
  };
  const exportXls = (group: string, name: string) => {
    const { columns, rows } = buildReport(group);
    downloadXls(fileName(name), rows, columns, `${name} — ${rangeLabel[range]}`);
  };
  const exportCsv = (group: string, name: string) => {
    const { columns, rows } = buildReport(group);
    downloadCsv(fileName(name), rows, columns);
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Relatórios com filtros avançados e exportação"
        actions={
          <div className="flex items-center gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value)} className="h-9 rounded-lg border border-input bg-surface px-3 text-sm">
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="year">Este ano</option>
            </select>
          </div>
        }
      />

      <div className="space-y-6">
        {reports.map((section) => (
          <div key={section.group}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{section.group}</h2>
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
                        <p className="text-xs text-muted-foreground">Período: {range}</p>
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

      <Card className="mt-6">
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Relatório personalizado</p>
            <p className="text-xs text-muted-foreground">Combine filtros por cliente, técnico, serviço, produto e período.</p>
          </div>
          <Badge tone="brand">Construtor de relatórios</Badge>
        </CardBody>
      </Card>
    </div>
  );
}
