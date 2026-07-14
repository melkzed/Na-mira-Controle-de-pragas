import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus } from 'lucide-react';
import { PageHeader, Stagger } from '../components/ui/misc';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer } from '@/application/repository';
import type { FinanceEntry } from '@/domain/types';
import { FinanceEntryStatus } from '@/domain/enums';
import { formatCompactCurrency, formatCurrency } from '@/lib/utils';
import { fmtDate } from '@/lib/date';
import { useState } from 'react';

const statusMeta: Record<FinanceEntryStatus, { label: string; tone: any }> = {
  pago: { label: 'Pago', tone: 'success' },
  pendente: { label: 'Pendente', tone: 'warning' },
  atrasado: { label: 'Atrasado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export function FinanceiroPage() {
  const [tab, setTab] = useState<'receber' | 'pagar'>('receber');

  const totals = useMemo(() => {
    const receber = seed.financeEntries.filter((e) => e.type === 'receita' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + e.amount, 0);
    const pagar = seed.financeEntries.filter((e) => e.type === 'despesa' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + e.amount, 0);
    const recebido = seed.financeEntries.filter((e) => e.type === 'receita' && e.status === 'pago').reduce((s, e) => s + e.amount, 0);
    const pago = seed.financeEntries.filter((e) => e.type === 'despesa' && e.status === 'pago').reduce((s, e) => s + e.amount, 0);
    return { receber, pagar, saldo: recebido - pago, recebido };
  }, []);

  const rows = seed.financeEntries.filter((e) => (tab === 'receber' ? e.type === 'receita' : e.type === 'despesa'));

  const columns: Column<FinanceEntry>[] = [
    { key: 'desc', header: 'Descrição', render: (e) => (
      <div><p className="font-medium">{e.description}</p>{e.customerId && <p className="text-xs text-muted-foreground">{getCustomer(e.customerId)?.name}</p>}</div>
    ) },
    { key: 'due', header: 'Vencimento', render: (e) => e.dueDate ? fmtDate(e.dueDate) : '—' },
    { key: 'amount', header: 'Valor', align: 'right', render: (e) => <span className={tab === 'receber' ? 'font-semibold text-success' : 'font-semibold text-foreground'}>{formatCurrency(e.amount)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (e) => <Badge tone={statusMeta[e.status].tone} dot>{statusMeta[e.status].label}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a pagar e a receber"
        actions={<Button leftIcon={<Plus size={16} />}>Novo lançamento</Button>}
      />

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Saldo em caixa" value={totals.saldo} icon="Wallet" tone="brand" format={formatCompactCurrency} />
        <StatCard label="A receber" value={totals.receber} icon="TrendingUp" tone="success" format={formatCompactCurrency} />
        <StatCard label="A pagar" value={totals.pagar} icon="TrendingDown" tone="danger" format={formatCompactCurrency} />
        <StatCard label="Recebido no mês" value={totals.recebido} icon="CircleDollarSign" tone="info" format={formatCompactCurrency} />
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="DRE simplificado" subtitle="Receita x Despesa mensal" />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={seed.revenueSeries} margin={{ left: -18, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip cursor={{ fill: 'rgb(var(--color-muted) / 0.5)' }} content={({ active, payload, label }: any) => active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-elevated">
                    <p className="mb-1 font-semibold text-foreground">{label}</p>
                    {payload.map((p: any, i: number) => <p key={i} className="text-muted-foreground">{p.name}: <span className="font-semibold text-foreground">{formatCompactCurrency(p.value)}</span></p>)}
                  </div>
                ) : null} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} />
                <Bar dataKey="despesa" name="Despesa" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Resumo do mês" />
          <CardBody className="space-y-3">
            <SummaryRow label="Receita bruta" value={seed.revenueSeries.at(-1)!.receita} tone="success" />
            <SummaryRow label="Despesas" value={-seed.revenueSeries.at(-1)!.despesa} tone="danger" />
            <div className="border-t border-border pt-3">
              <SummaryRow label="Lucro líquido" value={seed.revenueSeries.at(-1)!.receita - seed.revenueSeries.at(-1)!.despesa} tone="brand" bold />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Margem de lucro: <span className="font-semibold text-foreground">{Math.round(((seed.revenueSeries.at(-1)!.receita - seed.revenueSeries.at(-1)!.despesa) / seed.revenueSeries.at(-1)!.receita) * 100)}%</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-4">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'receber', label: 'Contas a receber' }, { value: 'pagar', label: 'Contas a pagar' }]} />
        </div>
        <Table columns={columns} rows={rows} keyField={(e) => e.id} />
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone, bold }: { label: string; value: number; tone: string; bold?: boolean }) {
  const color = { success: 'text-success', danger: 'text-danger', brand: 'text-brand' }[tone] ?? 'text-foreground';
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</span>
    </div>
  );
}
