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
import { downloadCsv } from '@/lib/export';
import { fmtDate } from '@/lib/date';

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

  // Exporta um dataset representativo conforme o grupo do relatório.
  const exportReport = (group: string, name: string) => {
    const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (group === 'Financeiro & Fiscal') {
      downloadCsv(file, seed.financeEntries, [
        { header: 'Descrição', value: (e) => e.description },
        { header: 'Tipo', value: (e) => e.type },
        { header: 'Status', value: (e) => e.status },
        { header: 'Valor', value: (e) => e.amount },
        { header: 'Vencimento', value: (e) => (e.dueDate ? fmtDate(e.dueDate) : '') },
      ]);
    } else if (group === 'Equipes & Recursos') {
      downloadCsv(file, seed.products, [
        { header: 'Produto', value: (p) => p.name },
        { header: 'Princípio ativo', value: (p) => p.activeIngredient ?? '' },
        { header: 'Unidade', value: (p) => p.unit },
        { header: 'Estoque mínimo', value: (p) => p.minQuantity },
        { header: 'Preço', value: (p) => p.price },
      ]);
    } else {
      downloadCsv(file, seed.serviceOrders, [
        { header: 'OS', value: (so) => so.number },
        { header: 'Cliente', value: (so) => getCustomer(so.customerId)?.name ?? '' },
        { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
        { header: 'Técnico', value: (so) => getUser(so.technicianId)?.name ?? '' },
        { header: 'Status', value: (so) => so.status },
        { header: 'Duração (min)', value: (so) => so.totalMinutes ?? '' },
      ]);
    }
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
                      <Button variant="outline" size="sm" leftIcon={<FileText size={13} />} onClick={() => window.print()}>PDF</Button>
                      <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet size={13} />} onClick={() => exportReport(section.group, r.name)}>Excel</Button>
                      <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={() => exportReport(section.group, r.name)}>CSV</Button>
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
