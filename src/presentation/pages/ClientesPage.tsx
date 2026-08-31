import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, Building2, Download, ExternalLink, FileText, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Upload, User } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Field';
import { CustomerForm } from '../components/CustomerForm';
import { ImportDrawer } from '../components/ImportDrawer';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import { TrapsPanel } from '../components/client/TrapsPanel';
import { useCustomersStore } from '@/store/customersStore';
import { useUsersStore } from '@/store/entityStores';
import { logChange } from '@/store/auditStore';
import { getPest, getProduct, getServiceType, getUser, serviceOrdersForCustomer } from '@/application/repository';
import type { Customer, ContractStatus } from '@/domain/types';
import { formatDocument } from '@/lib/utils';
import { downloadCsv } from '@/lib/export';
import { customersImport } from '@/lib/importModules';
import { fmtDate } from '@/lib/date';
import { printServiceOrder } from '@/lib/printOrder';
import { printCertificate, printLaudo } from '@/lib/printDocuments';

const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  ativo: 'Ativo', vencido: 'Vencido', renovacao_pendente: 'Renovação pendente', cancelado: 'Cancelado',
};

export function ClientesPage() {
  const [params] = useSearchParams();
  const { customers, add, update, remove } = useCustomersStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(
    params.get('id') ? customers.find((c) => c.id === params.get('id')) ?? null : null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
            <Button variant="outline" leftIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Importar planilha</Button>
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
              <Card hover className="cursor-pointer p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => setSelected(c)}
                role="button" tabIndex={0} aria-label={`Abrir cliente ${c.name}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(c); } }}>
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

      <ImportDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        spec={customersImport}
        items={customers}
        add={(c) => { const saved = add(c); logChange('criação', 'cliente', `Cliente importado de planilha · ${saved.name}`, saved.id); }}
        update={update}
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
  const staff = useUsersStore((s) => s.items);
  const navigate = useNavigate();
  if (!customer) return null;
  const history = serviceOrdersForCustomer(customer.id);
  const isBasico = customer.registrationTier === 'basico';
  const openOs = (osId: string) => navigate(`/ordens?id=${osId}`);

  return (
    <Drawer
      open={!!customer}
      onClose={() => { setConfirmDel(false); onClose(); }}
      title={customer.name}
      subtitle={formatDocument(customer.document)}
      wide
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={customer.type === 'pj' ? 'info' : 'neutral'}>{customer.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}</Badge>
              <Badge tone={isBasico ? 'warning' : 'neutral'}>{isBasico ? 'Cadastro básico' : 'Cadastro completo'}</Badge>
            </div>
            {customer.companyName && <p className="mt-1 text-sm text-muted-foreground">{customer.companyName}</p>}
          </div>
        </div>

        {isBasico && (
          <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning-soft/50 px-3 py-2 text-sm">
            <span className="text-warning">Cadastro rápido — sem estrutura do local, contratos ou armadilhas.</span>
            <button onClick={() => onEdit(customer)} className="shrink-0 font-medium text-warning underline">Completar cadastro</button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {customer.phone && <ContactRow icon={<Phone size={14} />} value={customer.phone} />}
          {(customer.contacts?.length ? customer.contacts : customer.whatsapp ? [{ id: 'legacy', name: 'Contato', phone: customer.whatsapp, isPrincipal: true }] : []).map((ct) => (
            <ContactRow
              key={ct.id}
              icon={<Phone size={14} className="text-success" />}
              value={`Telefone de contato${ct.name && ct.name !== 'Contato' ? ` (${ct.name}${ct.role ? ` · ${ct.role}` : ''})` : ''}${ct.isPrincipal ? ' · principal' : ''}: ${ct.phone}`}
            />
          ))}
          {customer.email && <ContactRow icon={<Mail size={14} />} value={customer.email} />}
          {(customer.street || customer.city) && (
            <ContactRow icon={<MapPin size={14} />} value={[customer.street && `${customer.street}, ${customer.number ?? 's/n'}`, customer.district, customer.city && `${customer.city}/${customer.state ?? ''}`].filter(Boolean).join(' — ')} />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Info label="Tipo de imóvel" value={customer.propertyType ?? '—'} />
          <Info label="Área" value={customer.areaM2 ? `${customer.areaM2} m²` : '—'} />
          <Info label="Cômodos" value={customer.roomCount ? String(customer.roomCount) : '—'} />
          <Info label="Cliente desde" value={fmtDate(customer.createdAt)} />
        </div>

        {customer.permanentNotes && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Observações permanentes do contrato</p>
            <p className="mt-0.5 text-sm text-foreground">{customer.permanentNotes}</p>
          </div>
        )}

        {!!customer.localStructure?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Estrutura do local</p>
            <div className="flex flex-wrap gap-1.5">
              {customer.localStructure.map((s) => {
                const qty = customer.localStructureQty?.[s];
                return <Badge key={s} tone="neutral">{qty && qty > 1 ? `${qty} ${s}` : s}</Badge>;
              })}
            </div>
          </div>
        )}

        {!!customer.reservoirs?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Reservatórios</p>
            <div className="space-y-1.5">
              {customer.reservoirs.map((r) => <div key={r.id} className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-foreground">{r.type}{r.location ? ` · ${r.location}` : ''}</div>)}
            </div>
          </div>
        )}

        {customer.contactSchedule && (customer.contactSchedule.nextContactAt || customer.contactSchedule.responsibleId || customer.contactSchedule.notes) && (
          <div className="rounded-lg border border-info/30 bg-info-soft/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-info">Agenda de contato</p>
            <p className="mt-0.5 text-sm text-foreground">
              {customer.contactSchedule.nextContactAt ? `Próximo contato: ${fmtDate(customer.contactSchedule.nextContactAt)}` : 'Sem próximo contato definido'}
              {customer.contactSchedule.responsibleId ? ` · ${staff.find((u) => u.id === customer.contactSchedule?.responsibleId)?.name ?? ''}` : ''}
            </p>
            {customer.contactSchedule.notes && <p className="mt-0.5 text-xs text-muted-foreground">{customer.contactSchedule.notes}</p>}
          </div>
        )}

        {!!customer.contracts?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Contratos</p>
            <div className="space-y-1.5">
              {customer.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                  <span className="text-foreground">{c.startDate ? fmtDate(c.startDate) : '—'} → {c.endDate ? fmtDate(c.endDate) : '—'} · {c.renewal}</span>
                  <Badge tone={c.status === 'ativo' ? 'success' : c.status === 'vencido' ? 'danger' : c.status === 'renovacao_pendente' ? 'warning' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {!!customer.complementaryServices?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Outros serviços</p>
            <div className="flex flex-wrap gap-1.5">{customer.complementaryServices.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
          </div>
        )}

      </div>

      <div className="space-y-5">
        {customer.monitoringContracted && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Monitoramento (armadilhas / MIP)</p>
            <TrapsPanel customerId={customer.id} compact />
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Histórico de atendimentos ({history.length})</p>
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>}
            {history.map((so) => {
              const pestNames = so.pestIds.map((id) => getPest(id)?.name).filter(Boolean).join(', ');
              const productNames = so.products.map((p) => getProduct(p.productId)?.name).filter(Boolean).join(', ');
              const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId]).map((id) => getUser(id)?.name).filter(Boolean).join(', ');
              return (
                <div
                  key={so.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir OS #${so.number}`}
                  onDoubleClick={() => openOs(so.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openOs(so.id); }}
                  className="cursor-pointer rounded-lg border border-border p-3 transition hover:border-brand/40 hover:bg-muted/30"
                  title="Duplo clique para abrir a OS"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">OS #{so.number} · {getServiceType(so.serviceTypeId)?.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(so.createdAt)} · {so.totalMinutes ? `${so.totalMinutes} min` : 'em aberto'}</p>
                    </div>
                    <ServiceOrderStatusBadge status={so.status} cancelledBy={so.cancelledBy} />
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {techNames && <p>Técnico(s): {techNames}</p>}
                    {pestNames && <p>Pragas: {pestNames}</p>}
                    {productNames && <p>Produtos: {productNames}</p>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" leftIcon={<ExternalLink size={13} />} onClick={(e) => { e.stopPropagation(); openOs(so.id); }}>Abrir OS</Button>
                    <Button size="sm" variant="outline" leftIcon={<Download size={13} />} onClick={(e) => { e.stopPropagation(); printServiceOrder(so); }}>PDF</Button>
                    <Button size="sm" variant="outline" leftIcon={<Award size={13} />} onClick={(e) => { e.stopPropagation(); printCertificate(so); }}>Certificado</Button>
                    <Button size="sm" variant="outline" leftIcon={<FileText size={13} />} onClick={(e) => { e.stopPropagation(); printLaudo(so); }}>Laudo</Button>
                  </div>
                </div>
              );
            })}
          </div>
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
