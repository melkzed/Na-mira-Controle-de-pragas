import { useEffect, useState } from 'react';
import { Check, Download, FileSignature, Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Avatar } from '../components/ui/Avatar';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import type { ServiceOrder } from '@/domain/types';
import type { ServiceOrderStatus } from '@/domain/enums';
import { fmtDate } from '@/lib/date';
import { downloadCsv } from '@/lib/export';
import { printServiceOrder } from '@/lib/printOrder';
import { currentBatch } from '@/lib/batches';
import { useInvoicesStore } from '@/store/invoicesStore';
import { useServiceOrdersStore, type ServiceOrderInput } from '@/store/serviceOrdersStore';
import { useCustomersStore } from '@/store/customersStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { downloadNfseXml, printNfse } from '@/lib/printInvoice';
import { FileCode, Receipt } from 'lucide-react';

const OS_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  rascunho: 'Rascunho', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};

export function OrdensPage() {
  const orders = useServiceOrdersStore((s) => s.orders);
  const [selected, setSelected] = useState<ServiceOrder | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const exportCsv = () => {
    downloadCsv('ordens-de-servico', orders, [
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
        description={`${orders.length} ordens registradas`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova OS</Button>
          </>
        }
      />
      <Table columns={columns} rows={orders} keyField={(so) => so.id} onRowClick={setSelected} />

      <NovaOsForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={(so) => { setFormOpen(false); setSelected(so); }} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Ordem de Serviço #${selected?.number}`}
        subtitle={selected ? getCustomer(selected.customerId)?.name : ''}
        width="max-w-xl"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" leftIcon={<Download size={15} />} onClick={() => selected && printServiceOrder(selected)}>Gerar PDF</Button><Button>Editar</Button></div>}
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
                {selected.products.map((p) => {
                  const prod = getProduct(p.productId);
                  const batch = currentBatch(prod);
                  return (
                    <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                      <div>
                        <span className="text-sm text-foreground">{prod?.name}</span>
                        {batch && <p className="text-xs text-muted-foreground">Lote {batch.code}{batch.expiresAt ? ` · val. ${new Date(batch.expiresAt).toLocaleDateString('pt-BR')}` : ''}</p>}
                      </div>
                      <Badge tone="brand">{p.usedQty} {prod?.unit}</Badge>
                    </div>
                  );
                })}
                {selected.products.length === 0 && <span className="text-sm text-muted-foreground">Nenhum produto lançado.</span>}
              </div>
            </Section>

            <FiscalSection so={selected} />

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

/** Formulário de nova Ordem de Serviço. */
function NovaOsForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (so: ServiceOrder) => void }) {
  const add = useServiceOrdersStore((s) => s.add);
  const customers = useCustomersStore((s) => s.customers);
  const [customerId, setCustomerId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(seed.serviceTypes[0]?.id ?? '');
  const [technicianId, setTechnicianId] = useState(seed.technicians[0]?.id ?? '');
  const [status, setStatus] = useState<ServiceOrderStatus>('em_andamento');
  const [areaTreated, setAreaTreated] = useState('');
  const [duration, setDuration] = useState('');
  const [procedures, setProcedures] = useState('');
  const [pestIds, setPestIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId(customers[0]?.id ?? '');
      setServiceTypeId(seed.serviceTypes[0]?.id ?? '');
      setTechnicianId(seed.technicians[0]?.id ?? '');
      setStatus('em_andamento'); setAreaTreated(''); setDuration(''); setProcedures(''); setPestIds([]); setTouched(false);
    }
  }, [open, customers]);

  const togglePest = (id: string) => setPestIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () => {
    setTouched(true);
    if (!customerId) return;
    const input: ServiceOrderInput = {
      customerId,
      serviceTypeId,
      technicianId: technicianId || undefined,
      status,
      areaTreated: areaTreated.trim() || undefined,
      procedures: procedures.trim() || undefined,
      totalMinutes: duration ? Number(duration) : undefined,
      startedAt: status !== 'rascunho' ? new Date().toISOString() : undefined,
      finishedAt: status === 'concluida' ? new Date().toISOString() : undefined,
      pestIds,
      products: [],
      hasCustomerSignature: false,
    };
    const so = add(input);
    logChange('criação', 'ordem de serviço', `OS #${so.number} · ${getCustomer(customerId)?.name ?? ''}`, so.id);
    toast(`OS #${so.number} criada.`, { tone: 'success' });
    onCreated(so);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova Ordem de Serviço" subtitle="Registro de atendimento" width="max-w-xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!customerId}>Criar OS</Button></div>}>
      <div className="space-y-4">
        <Field label="Cliente" required>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Selecione…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {touched && !customerId && <span className="mt-1 block text-xs text-danger">Selecione um cliente.</span>}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de serviço"><Select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>{seed.serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Técnico"><Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>{seed.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as ServiceOrderStatus)}>{(Object.keys(OS_STATUS_LABEL) as ServiceOrderStatus[]).map((s) => <option key={s} value={s}>{OS_STATUS_LABEL[s]}</option>)}</Select></Field>
          <Field label="Duração (min)"><Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" /></Field>
          <Field label="Área atendida" className="col-span-2"><Input value={areaTreated} onChange={(e) => setAreaTreated(e.target.value)} placeholder="Ex.: cozinha, estoque, área externa" /></Field>
        </div>
        <Field label="Pragas combatidas">
          <div className="flex flex-wrap gap-1.5">
            {seed.pests.map((p) => (
              <button key={p.id} type="button" onClick={() => togglePest(p.id)} className={`rounded-full border px-2.5 py-1 text-xs transition ${pestIds.includes(p.id) ? 'border-warning bg-warning-soft text-warning' : 'border-border text-muted-foreground hover:bg-muted'}`}>{p.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Procedimentos realizados"><Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} placeholder="Descreva o que foi feito no atendimento…" /></Field>
      </div>
    </Drawer>
  );
}

/** Emissão de NFS-e a partir da OS concluída (fluxo: concluída → emitir → XML/PDF). */
function FiscalSection({ so }: { so: ServiceOrder }) {
  const { invoices, emit } = useInvoicesStore();
  const invoice = invoices.find((i) => i.serviceOrderId === so.id);
  const customer = getCustomer(so.customerId);
  const svc = getServiceType(so.serviceTypeId);

  const doEmit = () => {
    const amount = svc?.defaultPrice ?? 300;
    const inv = emit({
      serviceOrderId: so.id,
      customerId: so.customerId,
      description: `${svc?.name ?? 'Serviço'} · ${customer?.name ?? ''}`,
      amount,
      taxAmount: Math.round(amount * 0.03 * 100) / 100,
    });
    logChange('emissão', 'fiscal', `NFS-e #${inv.number} emitida · ${customer?.name ?? ''}`, so.id);
  };

  return (
    <Section title="Fiscal (NFS-e)">
      {so.status !== 'concluida' ? (
        <p className="text-sm text-muted-foreground">A emissão da NFS-e fica disponível após a conclusão do serviço.</p>
      ) : invoice ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">NFS-e #{invoice.number} · {invoice.series}</p>
              <p className="text-xs text-muted-foreground">Emitida em {new Date(invoice.issuedAt).toLocaleDateString('pt-BR')} · {invoice.status}</p>
            </div>
            <Badge tone={invoice.status === 'emitida' ? 'success' : 'danger'} dot>{invoice.status === 'emitida' ? 'Emitida' : 'Cancelada'}</Badge>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" leftIcon={<Download size={14} />} onClick={() => printNfse(invoice, customer)}>PDF</Button>
            <Button size="sm" variant="outline" leftIcon={<FileCode size={14} />} onClick={() => downloadNfseXml(invoice, customer)}>XML</Button>
            <Button size="sm" variant="ghost" onClick={() => toast('NFS-e enviada ao cliente (simulação).', { tone: 'success' })}>Enviar ao cliente</Button>
          </div>
        </div>
      ) : (
        <Button leftIcon={<Receipt size={15} />} onClick={doEmit}>Emitir NFS-e em um clique</Button>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>{children}</div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
