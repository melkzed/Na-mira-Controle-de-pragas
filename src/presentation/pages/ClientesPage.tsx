import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Download, Mail, MapPin, Pencil, Phone, Plus, Radar, Search, Trash2, User } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Field';
import { CustomerForm } from '../components/CustomerForm';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import { useCustomersStore } from '@/store/customersStore';
import { logChange } from '@/store/auditStore';
import { getServiceType, serviceOrdersForCustomer } from '@/application/repository';
import type { Customer } from '@/domain/types';
import { formatDocument } from '@/lib/utils';
import { downloadCsv } from '@/lib/export';
import { fmtDate } from '@/lib/date';

export function ClientesPage() {
  const [params] = useSearchParams();
  const { customers, remove } = useCustomersStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(
    params.get('id') ? customers.find((c) => c.id === params.get('id')) ?? null : null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const filtered = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.document ?? '').includes(query)),
    [customers, query],
  );

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setFormOpen(true); setSelected(null); };
  const handleDelete = (c: Customer) => { remove(c.id); logChange('exclusão', 'cliente', `Cliente excluído · ${c.name}`, c.id); setSelected(null); };

  const exportCsv = () => {
    downloadCsv('clientes', filtered, [
      { header: 'Nome', value: (c) => c.name },
      { header: 'Tipo', value: (c) => (c.type === 'pj' ? 'PJ' : 'PF') },
      { header: 'Documento', value: (c) => c.document ?? '' },
      { header: 'Telefone', value: (c) => c.phone ?? '' },
      { header: 'E-mail', value: (c) => c.email ?? '' },
      { header: 'Cidade', value: (c) => c.city ?? '' },
      { header: 'UF', value: (c) => c.state ?? '' },
      { header: 'Bairro', value: (c) => c.district ?? '' },
    ]);
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${customers.length} clientes cadastrados`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />} onClick={openNew}>Novo cliente</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou documento…" className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} resultado(s)</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum cliente encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou cadastre um novo cliente.</p>
          <Button className="mt-4" leftIcon={<Plus size={16} />} onClick={openNew}>Novo cliente</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <Card hover className="cursor-pointer p-4" onClick={() => setSelected(c)}>
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatDocument(c.document)}</p>
                  </div>
                  <Badge tone={c.type === 'pj' ? 'info' : 'neutral'}>{c.type === 'pj' ? <><Building2 size={11} className="mr-1" />PJ</> : <><User size={11} className="mr-1" />PF</>}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><MapPin size={12} />{c.district || '—'}{c.city ? `, ${c.city}` : ''}</p>
                  <p className="flex items-center gap-1.5"><Phone size={12} />{c.phone || '—'}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.tags.map((t) => <Badge key={t} tone="neutral" className="text-[10px]">{t}</Badge>)}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <ClienteDetail
        customer={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <CustomerForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(c, isNew) => { setFormOpen(false); setSelected(c); logChange(isNew ? 'criação' : 'alteração', 'cliente', `${isNew ? 'Cliente cadastrado' : 'Cadastro alterado'} · ${c.name}`, c.id); }}
      />
    </div>
  );
}

function ClienteDetail({
  customer, onClose, onEdit, onDelete,
}: {
  customer: Customer | null;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  if (!customer) return null;
  const history = serviceOrdersForCustomer(customer.id);

  return (
    <Drawer
      open={!!customer}
      onClose={() => { setConfirmDel(false); onClose(); }}
      title={customer.name}
      subtitle={formatDocument(customer.document)}
      footer={
        <div className="flex items-center justify-between gap-2">
          {confirmDel ? (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm text-danger">Excluir este cliente?</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirmDel(false)}>Cancelar</Button>
                <Button variant="danger" onClick={() => onDelete(customer)}>Excluir</Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="ghost" leftIcon={<Trash2 size={15} />} className="text-danger" onClick={() => setConfirmDel(true)}>Excluir</Button>
              <div className="flex gap-2">
                <Button variant="outline" leftIcon={<Pencil size={15} />} onClick={() => onEdit(customer)}>Editar</Button>
                <Button>Novo agendamento</Button>
              </div>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} size="lg" />
          <div>
            <Badge tone={customer.type === 'pj' ? 'info' : 'neutral'}>{customer.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}</Badge>
            {customer.companyName && <p className="mt-1 text-sm text-muted-foreground">{customer.companyName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {customer.phone && <ContactRow icon={<Phone size={14} />} value={customer.phone} />}
          {customer.whatsapp && <ContactRow icon={<Phone size={14} className="text-success" />} value={`WhatsApp: ${customer.whatsapp}`} />}
          {customer.email && <ContactRow icon={<Mail size={14} />} value={customer.email} />}
          {(customer.street || customer.city) && (
            <ContactRow icon={<MapPin size={14} />} value={[customer.street && `${customer.street}, ${customer.number ?? 's/n'}`, customer.district, customer.city && `${customer.city}/${customer.state ?? ''}`].filter(Boolean).join(' — ')} />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Info label="Tipo de imóvel" value={customer.propertyType ?? '—'} />
          <Info label="Área" value={customer.areaM2 ? `${customer.areaM2} m²` : '—'} />
          <Info label="Cliente desde" value={fmtDate(customer.createdAt)} />
        </div>

        {customer.monitoringContracted && (
          <a href={`/monitoramento?client=${customer.id}`} className="flex items-center justify-between rounded-lg border border-info/30 bg-info-soft/50 px-3 py-2 text-sm transition hover:brightness-105">
            <span className="flex items-center gap-2 font-medium text-info"><Radar size={15} /> Monitoramento contratado (armadilhas / MIP)</span>
            <span className="text-xs text-info">Abrir →</span>
          </a>
        )}

        {customer.permanentNotes && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Observações permanentes do contrato</p>
            <p className="mt-0.5 text-sm text-foreground">{customer.permanentNotes}</p>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Histórico de atendimentos ({history.length})</p>
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>}
            {history.map((so) => (
              <div key={so.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">OS #{so.number} · {getServiceType(so.serviceTypeId)?.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(so.createdAt)} · {so.totalMinutes ? `${so.totalMinutes} min` : 'em aberto'}</p>
                </div>
                <ServiceOrderStatusBadge status={so.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
      <span className="text-muted-foreground">{icon}</span>
      {value}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
