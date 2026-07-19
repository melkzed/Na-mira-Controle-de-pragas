import { useState } from 'react';
import { Download, FileSignature, Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Avatar } from '../components/ui/Avatar';
import { Table, type Column } from '../components/ui/Table';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import type { ServiceOrder } from '@/domain/types';
import { fmtDate } from '@/lib/date';
import { downloadCsv } from '@/lib/export';

export function OrdensPage() {
  const [selected, setSelected] = useState<ServiceOrder | null>(null);

  const exportCsv = () => {
    downloadCsv('ordens-de-servico', seed.serviceOrders, [
      { header: 'OS', value: (so) => so.number },
      { header: 'Cliente', value: (so) => getCustomer(so.customerId)?.name ?? '' },
      { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
      { header: 'Técnico', value: (so) => getUser(so.technicianId)?.name ?? '' },
      { header: 'Status', value: (so) => so.status },
      { header: 'Duração (min)', value: (so) => so.totalMinutes ?? '' },
      { header: 'Criada em', value: (so) => fmtDate(so.createdAt) },
    ]);
  };

  const columns: Column<ServiceOrder>[] = [
    { key: 'num', header: 'OS', render: (so) => <span className="font-semibold">#{so.number}</span> },
    { key: 'cust', header: 'Cliente', render: (so) => getCustomer(so.customerId)?.name },
    { key: 'svc', header: 'Serviço', render: (so) => <Badge tone="neutral">{getServiceType(so.serviceTypeId)?.name}</Badge> },
    { key: 'tech', header: 'Técnico', render: (so) => {
      const t = getUser(so.technicianId);
      return t ? <div className="flex items-center gap-2"><Avatar name={t.name} size="xs" /><span className="text-muted-foreground">{t.name.split(' ')[0]}</span></div> : '—';
    } },
    { key: 'date', header: 'Data', render: (so) => fmtDate(so.createdAt) },
    { key: 'time', header: 'Duração', align: 'right', render: (so) => so.totalMinutes ? `${so.totalMinutes} min` : '—' },
    { key: 'status', header: 'Status', align: 'right', render: (so) => <ServiceOrderStatusBadge status={so.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description={`${seed.serviceOrders.length} ordens registradas`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />}>Nova OS</Button>
          </>
        }
      />
      <Table columns={columns} rows={seed.serviceOrders} keyField={(so) => so.id} onRowClick={setSelected} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Ordem de Serviço #${selected?.number}`}
        subtitle={selected ? getCustomer(selected.customerId)?.name : ''}
        width="max-w-xl"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" leftIcon={<Download size={15} />}>Gerar PDF</Button><Button>Editar</Button></div>}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-2"><ServiceOrderStatusBadge status={selected.status} /><Badge tone="neutral">{getServiceType(selected.serviceTypeId)?.name}</Badge></div>

            <Section title="Detalhes">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Área atendida" value={selected.areaTreated ?? '—'} />
                <Info label="Duração" value={selected.totalMinutes ? `${selected.totalMinutes} min` : 'em aberto'} />
                <Info label="Início" value={selected.startedAt ? new Date(selected.startedAt).toLocaleString('pt-BR') : '—'} />
                <Info label="Fim" value={selected.finishedAt ? new Date(selected.finishedAt).toLocaleString('pt-BR') : '—'} />
              </div>
            </Section>

            {selected.procedures && <Section title="Procedimentos realizados"><p className="text-sm text-foreground">{selected.procedures}</p></Section>}

            <Section title="Pragas combatidas">
              <div className="flex flex-wrap gap-1.5">
                {selected.pestIds.map((id) => <Badge key={id} tone="warning">{seed.pests.find((p) => p.id === id)?.name}</Badge>)}
                {selected.pestIds.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              </div>
            </Section>

            <Section title="Produtos utilizados">
              <div className="space-y-2">
                {selected.products.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <span className="text-sm text-foreground">{getProduct(p.productId)?.name}</span>
                    <Badge tone="brand">{p.usedQty} {getProduct(p.productId)?.unit}</Badge>
                  </div>
                ))}
                {selected.products.length === 0 && <span className="text-sm text-muted-foreground">Nenhum produto lançado.</span>}
              </div>
            </Section>

            <Section title="Assinaturas">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-4">
                  <FileSignature size={20} className={selected.hasCustomerSignature ? 'text-success' : 'text-muted-foreground'} />
                  <p className="mt-1 text-xs text-muted-foreground">Cliente</p>
                  <Badge tone={selected.hasCustomerSignature ? 'success' : 'neutral'} className="mt-1">{selected.hasCustomerSignature ? 'Assinado' : 'Pendente'}</Badge>
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-4">
                  <FileSignature size={20} className="text-success" />
                  <p className="mt-1 text-xs text-muted-foreground">Técnico</p>
                  <Badge tone="success" className="mt-1">Assinado</Badge>
                </div>
              </div>
            </Section>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>{children}</div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
