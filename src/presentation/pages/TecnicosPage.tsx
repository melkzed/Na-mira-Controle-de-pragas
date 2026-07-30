import { useEffect, useState } from 'react';
import { Check, ClipboardList, Package, PackageCheck, Plus, Trash2, Wrench } from 'lucide-react';
import { PageHeader, Stagger } from '../components/ui/misc';
import { StatCard } from '../components/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input } from '../components/ui/Field';
import { Combobox } from '../components/ui/Combobox';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import { useUsersStore, useEquipmentStore, useVehiclesStore } from '@/store/entityStores';
import { useEquipmentRequestsStore } from '@/store/equipmentRequestsStore';
import { useStockRequestsStore } from '@/store/stockRequestsStore';
import { useStockStore } from '@/store/stockStore';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { uid } from '@/store/createEntityStore';
import { getProduct, appointmentsHistoryForTechnician, getCustomer, getServiceType, serviceOrdersForTechnician } from '@/application/repository';
import { isEquipmentOverdue } from './EquipamentosPage';
import { EQUIPMENT_STATUS_META as statusMeta } from '@/domain/equipmentMeta';
import type { User, Equipment } from '@/domain/types';
import type { EquipmentStatus } from '@/domain/enums';
import { fmtDate } from '@/lib/date';

const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Módulo de Técnicos — gestão da equipe de campo: cadastro, permissões,
 * ferramentas/equipamentos vinculados (com histórico e alertas de devolução)
 * e aprovação de solicitações (equipamentos e produtos) feitas pelo app de campo.
 */
export function TecnicosPage() {
  const users = useUsersStore((s) => s.items);
  const equipment = useEquipmentStore((s) => s.items);
  const { requests: equipRequests } = useEquipmentRequestsStore();
  const { requests: stockRequests } = useStockRequestsStore();

  const technicians = users.filter((u) => u.role === 'tecnico');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [selected, setSelected] = useState<User | null>(null);

  const pendingEquip = equipRequests.filter((r) => r.status === 'pendente').length;
  const pendingProd = stockRequests.filter((r) => r.status === 'pendente').length;

  const columns: Column<User>[] = [
    { key: 'name', header: 'Técnico', render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div><p className="font-medium text-foreground">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div>
    ) },
    { key: 'phone', header: 'Telefone', render: (u) => <span className="text-muted-foreground">{u.phone ?? '—'}</span> },
    { key: 'access', header: 'Acesso ao app', align: 'right', render: (u) => <Badge tone={u.fieldAppAccess === false ? 'neutral' : 'brand'}>{u.fieldAppAccess === false ? 'Bloqueado' : 'Liberado'}</Badge> },
    { key: 'status', header: 'Status', align: 'right', render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'} dot>{u.isActive ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Técnicos"
        description="Equipe de campo, ferramentas/equipamentos e solicitações"
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>Novo técnico</Button>}
      />

      <Stagger className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Técnicos ativos" value={technicians.filter((t) => t.isActive).length} icon="HardHat" tone="brand" />
        <StatCard label="Ferramentas em uso" value={equipment.filter((e) => e.status === 'em_uso').length} icon="Wrench" tone="info" />
        <StatCard label="Devoluções atrasadas" value={equipment.filter(isEquipmentOverdue).length} icon="TriangleAlert" tone="danger" />
        <StatCard label="Solicitações pendentes" value={pendingEquip + pendingProd} icon="ClipboardList" tone="warning" />
        <StatCard label="Em manutenção" value={equipment.filter((e) => e.status === 'manutencao').length} icon="Hammer" tone="neutral" />
      </Stagger>

      <PendingRequestsPanel />

      <Card>
        <CardHeader title="Equipe de campo" subtitle={`${technicians.length} técnico(s)`} />
        <CardBody className="p-0">
          <div className="px-4 pb-4">
            <Table columns={columns} rows={technicians} keyField={(u) => u.id} onRowClick={setSelected} />
            {technicians.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum técnico cadastrado.</p>}
          </div>
        </CardBody>
      </Card>

      <TechnicianForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
      />

      <TechnicianDetail
        tech={selected}
        onClose={() => setSelected(null)}
        onEdit={(u) => { setSelected(null); setEditing(u); setFormOpen(true); }}
      />
    </div>
  );
}

/** Aprovação de solicitações de equipamentos e produtos vindas do app de campo. */
function PendingRequestsPanel() {
  const users = useUsersStore((s) => s.items);
  const equipment = useEquipmentStore((s) => s.items);
  const updateEquipment = useEquipmentStore((s) => s.update);
  const { requests: equipRequests, resolve: resolveEquip } = useEquipmentRequestsStore();
  const { requests: stockRequests, resolve: resolveStock } = useStockRequestsStore();
  const entry = useStockStore((s) => s.entry);
  const currentUser = useAppStore((s) => s.currentUser);

  const pendingEquip = equipRequests.filter((r) => r.status === 'pendente');
  const pendingProd = stockRequests.filter((r) => r.status === 'pendente');
  const getTechName = (id: string) => users.find((u) => u.id === id)?.name ?? 'Técnico';

  if (pendingEquip.length === 0 && pendingProd.length === 0) return null;

  const approveEquip = (reqId: string, equipmentId: string, technicianId: string) => {
    const eq = equipment.find((e) => e.id === equipmentId);
    const now = new Date().toISOString();
    updateEquipment(equipmentId, {
      status: 'em_uso',
      checkedOutAt: now,
      checkedOutTo: technicianId,
      checkedOutBy: currentUser?.name,
      checkedOutOsId: undefined,
      history: [...(eq?.history ?? []), { at: now, type: 'entrega', technicianId, by: currentUser?.name, note: 'Aprovado via solicitação do app de campo' }],
    });
    resolveEquip(reqId, 'aprovada', currentUser?.id);
    toast(`${eq?.name ?? 'Equipamento'} entregue a ${getTechName(technicianId)}.`, { tone: 'success' });
  };

  const denyEquip = (reqId: string) => { resolveEquip(reqId, 'negada', currentUser?.id); toast('Solicitação de equipamento recusada.', { tone: 'default' }); };

  const approveProd = (reqId: string, productId: string, quantity: number) => {
    entry('loc-central', productId, quantity);
    resolveStock(reqId, 'atendida');
    toast('Reposição atendida e lançada no estoque central.', { tone: 'success' });
  };
  const denyProd = (reqId: string) => { resolveStock(reqId, 'cancelada'); toast('Solicitação de produto recusada.', { tone: 'default' }); };

  return (
    <Card className="mb-4 border-warning/40">
      <CardHeader
        title={<span className="flex items-center gap-2"><ClipboardList size={16} className="text-warning" /> Solicitações pendentes</span>}
        subtitle={`${pendingEquip.length + pendingProd.length} pendência(s) — equipamentos e produtos`}
      />
      <CardBody className="space-y-2">
        {pendingEquip.map((r) => {
          const eq = equipment.find((e) => e.id === r.equipmentId);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info"><Wrench size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{eq?.name ?? r.equipmentId}</p>
                <p className="text-xs text-muted-foreground">{getTechName(r.technicianId)} · {fmtDate(r.createdAt)}{r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <Badge tone="warning" dot>Equipamento</Badge>
              <Button size="sm" variant="outline" onClick={() => denyEquip(r.id)}>Recusar</Button>
              <Button size="sm" onClick={() => approveEquip(r.id, r.equipmentId, r.technicianId)}>Aprovar</Button>
            </div>
          );
        })}
        {pendingProd.map((r) => {
          const prod = getProduct(r.productId);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Package size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{prod?.name ?? r.productId} <span className="font-normal text-muted-foreground">· {r.quantity} {prod?.unit}</span></p>
                <p className="text-xs text-muted-foreground">{getTechName(r.requestedBy ?? '')} · {fmtDate(r.createdAt)}{r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <Badge tone="warning" dot>Produto</Badge>
              <Button size="sm" variant="outline" onClick={() => denyProd(r.id)}>Recusar</Button>
              <Button size="sm" leftIcon={<PackageCheck size={14} />} onClick={() => approveProd(r.id, r.productId, r.quantity)}>Atender</Button>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/** Cadastro/edição de técnico. */
function TechnicianForm({ open, editing, onClose }: { open: boolean; editing: User | null; onClose: () => void }) {
  const add = useUsersStore((s) => s.add);
  const update = useUsersStore((s) => s.update);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [fieldAppAccess, setFieldAppAccess] = useState(true);
  const [touched, setTouched] = useState(false);

  // Recarrega os campos sempre que o drawer abre (novo cadastro ou edição).
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ''); setEmail(editing?.email ?? ''); setPhone(editing?.phone ?? '');
    setIsActive(editing?.isActive ?? true); setFieldAppAccess(editing?.fieldAppAccess ?? true); setTouched(false);
  }, [open, editing]);

  const submit = () => {
    setTouched(true);
    if (!name.trim() || !email.trim()) return;
    if (editing) {
      update(editing.id, { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, isActive, fieldAppAccess });
      toast('Técnico atualizado.', { tone: 'success' });
    } else {
      add({ id: uid('u'), orgId: 'org-namira', name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role: 'tecnico', isActive, fieldAppAccess });
      toast('Técnico cadastrado. Login com a senha demo (namira123).', { tone: 'success' });
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'Editar técnico' : 'Novo técnico'}
      subtitle="Cadastro completo da equipe de campo"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />}>{editing ? 'Salvar' : 'Cadastrar'}</Button></div>}
    >
      <div className="space-y-4">
        <Field label="Nome completo" required><Input value={name} onChange={(e) => setName(e.target.value)} />{touched && !name.trim() && <span className="mt-1 block text-xs text-danger">Informe o nome.</span>}</Field>
        <Field label="E-mail" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />{touched && !email.trim() && <span className="mt-1 block text-xs text-danger">Informe o e-mail.</span>}</Field>
        <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" /></Field>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border" id="tec-ativo" />
          <label htmlFor="tec-ativo" className="text-sm text-foreground">Técnico ativo</label>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <input type="checkbox" checked={fieldAppAccess} onChange={(e) => setFieldAppAccess(e.target.checked)} className="h-4 w-4 rounded border-border" id="tec-acesso" />
          <label htmlFor="tec-acesso" className="text-sm text-foreground">Permitir acesso ao aplicativo de campo</label>
        </div>
        <p className="text-xs text-muted-foreground">Senha de acesso: demonstração (namira123), a mesma dos demais usuários de exemplo.</p>
      </div>
    </Drawer>
  );
}

/** Detalhe do técnico: dados, equipamentos vinculados e histórico de atividades. */
function TechnicianDetail({ tech, onClose, onEdit }: { tech: User | null; onClose: () => void; onEdit: (u: User) => void }) {
  const [tab, setTab] = useState<'dados' | 'equipamentos' | 'atividades'>('dados');
  const update = useUsersStore((s) => s.update);
  const remove = useUsersStore((s) => s.remove);

  useEffect(() => { if (tech) setTab('dados'); }, [tech?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tech) return null;

  const toggleActive = () => { update(tech.id, { isActive: !tech.isActive }); toast(tech.isActive ? 'Técnico desativado.' : 'Técnico ativado.', { tone: 'success' }); };
  const del = () => { remove(tech.id); toast('Técnico excluído.', { tone: 'default' }); onClose(); };

  return (
    <Drawer
      open={!!tech}
      onClose={onClose}
      title={tech.name}
      subtitle={tech.email}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={del}>Excluir</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleActive}>{tech.isActive ? 'Desativar' : 'Ativar'}</Button>
            <Button onClick={() => onEdit(tech)}>Editar</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={tech.name} size="lg" />
          <div>
            <p className="font-semibold text-foreground">{tech.name}</p>
            <div className="mt-1 flex gap-1.5">
              <Badge tone={tech.isActive ? 'success' : 'neutral'} dot>{tech.isActive ? 'Ativo' : 'Inativo'}</Badge>
              <Badge tone={tech.fieldAppAccess === false ? 'neutral' : 'brand'}>{tech.fieldAppAccess === false ? 'App bloqueado' : 'App liberado'}</Badge>
            </div>
          </div>
        </div>

        <Segmented value={tab} onChange={setTab} size="sm" options={[
          { value: 'dados', label: 'Dados' },
          { value: 'equipamentos', label: 'Equipamentos' },
          { value: 'atividades', label: 'Atividades' },
        ]} />

        {tab === 'dados' && <TechDadosTab tech={tech} />}
        {tab === 'equipamentos' && <TechEquipmentTab key={tech.id} tech={tech} />}
        {tab === 'atividades' && <TechActivityTab key={tech.id} tech={tech} />}
      </div>
    </Drawer>
  );
}

/** Dados cadastrais do técnico + veículo atualmente associado. */
function TechDadosTab({ tech }: { tech: User }) {
  const vehicles = useVehiclesStore((s) => s.items);
  const vehicle = vehicles.find((v) => v.driverId === tech.id);

  return (
    <div className="space-y-2.5">
      <InfoRow label="Telefone" value={tech.phone ?? '—'} />
      <InfoRow label="E-mail" value={tech.email} />
      <InfoRow label="Acesso ao app de campo" value={tech.fieldAppAccess === false ? 'Bloqueado' : 'Liberado'} />
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Veículo associado</p>
        {vehicle ? (
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{vehicle.plate}{vehicle.model ? ` · ${vehicle.model}` : ''}</span>
            <Badge tone={vehicle.isActive ? 'success' : 'neutral'} dot>{vehicle.isActive ? 'Ativo' : 'Inativo'}</Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">Nenhum veículo associado.</span>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Equipamentos vinculados ao técnico — entrega manual, devolução e status. */
function TechEquipmentTab({ tech }: { tech: User }) {
  const equipment = useEquipmentStore((s) => s.items);
  const update = useEquipmentStore((s) => s.update);
  const currentUser = useAppStore((s) => s.currentUser);
  const [assignId, setAssignId] = useState('');
  const [returnAt, setReturnAt] = useState('');

  const mine = equipment.filter((e) => e.checkedOutTo === tech.id);
  const available = equipment.filter((e) => e.status === 'disponivel');

  const deliver = () => {
    if (!assignId) return;
    const eq = equipment.find((e) => e.id === assignId);
    const now = new Date().toISOString();
    update(assignId, {
      status: 'em_uso', checkedOutAt: now, checkedOutTo: tech.id, checkedOutBy: currentUser?.name,
      expectedReturnAt: returnAt ? new Date(returnAt).toISOString() : undefined,
      history: [...(eq?.history ?? []), { at: now, type: 'entrega', technicianId: tech.id, by: currentUser?.name, note: 'Entrega registrada manualmente' }],
    });
    toast(`${eq?.name} entregue a ${tech.name}.`, { tone: 'success' });
    setAssignId(''); setReturnAt('');
  };

  const giveBack = (eq: Equipment) => {
    const now = new Date().toISOString();
    update(eq.id, {
      status: 'disponivel', checkedOutAt: undefined, checkedOutTo: undefined, checkedOutOsId: undefined, checkedOutBy: undefined, expectedReturnAt: undefined,
      history: [...(eq.history ?? []), { at: now, type: 'devolucao', technicianId: tech.id, by: currentUser?.name }],
    });
    toast(`Devolução de ${eq.name} registrada.`, { tone: 'success' });
  };

  const setStatus = (eq: Equipment, status: EquipmentStatus) => {
    const now = new Date().toISOString();
    update(eq.id, { status, history: [...(eq.history ?? []), { at: now, type: 'status', technicianId: tech.id, by: currentUser?.name, note: `Status alterado para ${statusMeta[status].label}` }] });
    toast(`${eq.name}: status atualizado para ${statusMeta[status].label}.`, { tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Comigo agora</p>
        {mine.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum equipamento vinculado.</p> : (
          <div className="space-y-2">
            {mine.map((e) => (
              <div key={e.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{e.name}{e.code ? ` (${e.code})` : ''}</p>
                    <p className="text-xs text-muted-foreground">
                      Entregue {fmtDateTime(e.checkedOutAt)}{e.checkedOutBy ? ` · por ${e.checkedOutBy}` : ''}
                      {e.expectedReturnAt && <> · devolução prevista {fmtDateTime(e.expectedReturnAt)}</>}
                    </p>
                  </div>
                  <Badge tone={isEquipmentOverdue(e) ? 'danger' : statusMeta[e.status].tone}>{isEquipmentOverdue(e) ? 'Atrasado' : statusMeta[e.status].label}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => giveBack(e)}>Registrar devolução</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(e, 'manutencao')}>Manutenção</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatus(e, 'perdido')}>Perdido</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatus(e, 'danificado')}>Danificado</Button>
                </div>
                {!!e.history?.length && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Histórico de movimentação ({e.history.length})</summary>
                    <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                      {[...e.history].reverse().map((h, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          {fmtDateTime(h.at)} — {h.type === 'entrega' ? 'Entrega' : h.type === 'devolucao' ? 'Devolução' : 'Status'}{h.by ? ` · ${h.by}` : ''}{h.note ? ` · ${h.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Registrar entrega</p>
        <div className="space-y-2">
          <Combobox value={assignId} onChange={setAssignId} placeholder="Buscar equipamento disponível…" options={available.map((e) => ({ value: e.id, label: e.name, sub: e.code }))} />
          <div className="flex gap-2">
            <input type="date" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} className="h-9 flex-1 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
            <Button size="sm" disabled={!assignId} onClick={deliver}>Entregar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Histórico de atividades/serviços do técnico. */
function TechActivityTab({ tech }: { tech: User }) {
  const orders = serviceOrdersForTechnician(tech.id).slice(0, 15);
  const visits = appointmentsHistoryForTechnician(tech.id).slice(0, 15);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Ordens de Serviço</p>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">Sem OS registradas.</p> : (
          <div className="space-y-1.5">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="text-foreground">#{o.number} · {getCustomer(o.customerId)?.name ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Visitas / atendimentos</p>
        {visits.length === 0 ? <p className="text-sm text-muted-foreground">Sem visitas registradas.</p> : (
          <div className="space-y-1.5">
            {visits.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="text-foreground">{getCustomer(a.customerId)?.name ?? '—'} <span className="text-muted-foreground">· {getServiceType(a.serviceTypeId)?.name}</span></span>
                <span className="text-xs text-muted-foreground">{fmtDate(a.scheduledStart)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
