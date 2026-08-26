/**
 * Portal do Cliente — pagamentos.
 *
 * Visão deliberadamente reduzida: só o que o cliente pagou ou deve pagar.
 * Nada de custo interno, margem, comissão, contas a pagar da empresa ou
 * qualquer lançamento de outro cliente — o recorte vem de `portalData`.
 */
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, type Column } from '../../components/ui/Table';
import { FileText, Wallet } from 'lucide-react';
import { printServiceOrder } from '@/lib/printOrder';
import { formatCurrency } from '@/lib/utils';
import { fmtDate } from '@/lib/date';
import type { FinanceEntry } from '@/domain/types';
import { paymentTone, usePortalData } from './portalData';

export function PortalFinanceiroPage() {
  const { finance, orders } = usePortalData();

  const pendentes = finance.filter((e) => e.status !== 'pago');
  const totalPendente = pendentes.reduce((s, e) => s + e.amount, 0);
  const totalPago = finance.filter((e) => e.status === 'pago').reduce((s, e) => s + e.amount, 0);

  const columns: Column<FinanceEntry>[] = [
    { key: 'desc', header: 'Serviço', render: (e) => (
      <div>
        <p className="font-medium text-foreground">{e.description}</p>
        {e.paidAt && <p className="text-xs text-muted-foreground">Pago em {fmtDate(e.paidAt)}</p>}
      </div>
    ) },
    { key: 'venc', header: 'Vencimento', render: (e) => <span className="text-muted-foreground">{e.dueDate ? fmtDate(e.dueDate) : '—'}</span> },
    { key: 'valor', header: 'Valor', align: 'right', render: (e) => formatCurrency(e.amount) },
    { key: 'sit', header: 'Situação', align: 'right', render: (e) => {
      const st = paymentTone(e);
      return <Badge tone={st.tone} dot>{st.label}</Badge>;
    } },
    { key: 'doc', header: '', align: 'right', render: (e) => {
      const so = e.serviceOrderId ? orders.find((o) => o.id === e.serviceOrderId) : undefined;
      if (!so) return null;
      return <Button size="sm" variant="outline" leftIcon={<FileText size={13} />} onClick={() => printServiceOrder(so)}>Documento</Button>;
    } },
  ];

  return (
    <div>
      <PageHeader title="Pagamentos" description="Situação dos serviços prestados à sua empresa" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <p className="text-lg font-bold text-foreground">{formatCurrency(totalPendente)}</p>
          <p className="text-xs text-muted-foreground">Em aberto{pendentes.length ? ` · ${pendentes.length} lançamento(s)` : ''}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <p className="text-lg font-bold text-foreground">{formatCurrency(totalPago)}</p>
          <p className="text-xs text-muted-foreground">Já pago</p>
        </div>
      </div>

      {finance.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
            <Wallet size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
          </CardBody>
        </Card>
      ) : (
        <Table columns={columns} rows={finance} keyField={(e) => e.id} />
      )}
    </div>
  );
}
