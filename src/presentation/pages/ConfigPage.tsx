import { useEffect, useState } from 'react';
import { Bug, MapPin, Plus, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { useAreasStore, usePestsStore, useProductsStore, useServiceTypesStore, useUsersStore } from '@/store/entityStores';
import { useSettingsStore } from '@/store/settingsStore';
import { uid } from '@/store/createEntityStore';
import { toast } from '@/store/toastStore';
import { SignaturePad } from '../components/SignaturePad';
import { ROLE_META, type UserRole } from '@/domain/enums';
import type { User } from '@/domain/types';

const permissionMatrix: { module: string; roles: UserRole[] }[] = [
  { module: 'Dashboard', roles: ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque'] },
  { module: 'Agenda / Ordens', roles: ['admin', 'supervisor', 'atendimento'] },
  { module: 'Clientes / CRM', roles: ['admin', 'supervisor', 'atendimento'] },
  { module: 'Estoque / Produtos', roles: ['admin', 'supervisor', 'estoque'] },
  { module: 'Financeiro / Fiscal', roles: ['admin', 'financeiro'] },
  { module: 'Relatórios', roles: ['admin', 'supervisor', 'financeiro'] },
  { module: 'App do Técnico', roles: ['tecnico', 'admin', 'supervisor'] },
];
const ALL_ROLES: UserRole[] = ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'];

export function ConfigPage() {
  const users = useUsersStore((s) => s.items);
  const columns: Column<User>[] = [
    { key: 'name', header: 'Usuário', render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div>
    ) },
    { key: 'role', header: 'Perfil', render: (u) => <Badge tone="brand">{ROLE_META[u.role].label}</Badge> },
    { key: 'phone', header: 'Telefone', render: (u) => <span className="text-muted-foreground">{u.phone ?? '—'}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'} dot>{u.isActive ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Configurações" description="Usuários, permissões e preferências da organização" actions={<Button>Convidar usuário</Button>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Usuários e equipe" subtitle={`${users.length} usuários`} />
          <CardBody className="p-0">
            <div className="px-4 pb-4"><Table columns={columns} rows={users} keyField={(u) => u.id} /></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Organização" />
          <CardBody className="space-y-2.5 text-sm">
            <Row label="Nome" value={seed.orgProfile.name} />
            <Row label="Razão social" value={seed.orgProfile.legalName} />
            <Row label="CNPJ" value={seed.orgProfile.cnpj} />
            <Row label="Cidade" value={`${seed.orgProfile.city}/${seed.orgProfile.state}`} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Matriz de permissões (RBAC)" subtitle="Controle de acesso por perfil" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulo</th>
                  {ALL_ROLES.map((r) => <th key={r} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{ROLE_META[r].label}</th>)}
                </tr>
              </thead>
              <tbody>
                {permissionMatrix.map((row) => (
                  <tr key={row.module} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{row.module}</td>
                    {ALL_ROLES.map((r) => (
                      <td key={r} className="px-3 py-3 text-center">
                        {row.roles.includes(r) ? <span className="inline-block h-2 w-2 rounded-full bg-brand" /> : <span className="inline-block h-2 w-2 rounded-full bg-border" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PestsPanel />
        <AreasPanel />
      </div>

      <SignaturesPanel />
      <EmergencyPanel />
      <ServiceDefaultsPanel />
    </div>
  );
}

/** Assinaturas digitais da empresa e dos técnicos — incorporadas ao PDF da OS. */
function SignaturesPanel() {
  const { companySignature, signatures, setCompanySignature, setUserSignature } = useSettingsStore();
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico'));
  const [userId, setUserId] = useState('');
  useEffect(() => { if (!userId && technicians[0]) setUserId(technicians[0].id); }, [userId, technicians]);

  return (
    <Card className="mt-4">
      <CardHeader title="Assinaturas digitais" subtitle="Empresa e técnicos — incorporadas automaticamente ao PDF da Ordem de Serviço" />
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Assinatura da empresa</p>
          <SignaturePad value={companySignature} onChange={(d) => setCompanySignature(d)} />
          {companySignature && <p className="mt-1 text-xs text-success">Assinatura da empresa definida.</p>}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Assinatura do técnico</p>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-8 w-auto text-xs">
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <SignaturePad key={userId} value={signatures[userId]} onChange={(d) => setUserSignature(userId, d)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {technicians.filter((t) => signatures[t.id]).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs">
                <img src={signatures[t.id]} alt={t.name} className="h-5 w-12 object-contain" /> {t.name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Configuração da emergência toxicológica (CIT) exibida nos documentos. */
function EmergencyPanel() {
  const { emergencyPhone, emergencyInfo, setEmergency } = useSettingsStore();
  const [phone, setPhone] = useState(emergencyPhone);
  const [info, setInfo] = useState(emergencyInfo);
  const dirty = phone !== emergencyPhone || info !== emergencyInfo;

  return (
    <Card className="mt-4">
      <CardHeader title="Emergência (CIT)" subtitle="Centro de Informação Toxicológica — exibido automaticamente nos documentos" />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Telefone de emergência"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Informações" className="sm:col-span-2"><Input value={info} onChange={(e) => setInfo(e.target.value)} /></Field>
        <div className="sm:col-span-3 flex justify-end">
          <Button size="sm" disabled={!dirty} onClick={() => { setEmergency(phone.trim(), info.trim()); toast('Dados de emergência atualizados.', { tone: 'success' }); }}>Salvar</Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de pragas — alimenta a Ordem de Serviço (nome, categoria, garantia). */
function PestsPanel() {
  const { items, add, remove } = usePestsStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [warranty, setWarranty] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('p'), orgId: 'org-namira', name: name.trim(), category: category.trim() || undefined, defaultWarrantyDays: warranty ? Number(warranty) : undefined });
    toast('Praga cadastrada.', { tone: 'success' });
    setName(''); setCategory(''); setWarranty('');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Bug size={16} className="text-brand" /> Pragas</span>} subtitle={`${items.length} cadastradas · alimentam a OS`} />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Percevejos" onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label="Categoria"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Rasteira / Voadora…" /></Field>
          <Field label="Garantia padrão (dias)"><Input type="number" min={0} value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="90" /></Field>
          <div className="flex items-end"><Button className="w-full" leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button></div>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {items.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
              <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
              {p.category && <Badge tone="neutral">{p.category}</Badge>}
              {p.defaultWarrantyDays != null && <Badge tone="brand">{p.defaultWarrantyDays}d</Badge>}
              <button onClick={() => remove(p.id)} aria-label={`Excluir ${p.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><X size={14} /></button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de áreas tratadas — selecionáveis na OS e exibidas no PDF. */
function AreasPanel() {
  const { items, add, remove } = useAreasStore();
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('ar'), orgId: 'org-namira', name: name.trim() });
    setName('');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><MapPin size={16} className="text-brand" /> Áreas tratadas</span>} subtitle={`${items.length} cadastradas · selecionáveis na OS`} />
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Refeitório" onKeyDown={(e) => e.key === 'Enter' && create()} />
          <Button leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
              {a.name}
              <button onClick={() => remove(a.id)} aria-label={`Excluir ${a.name}`} className="text-muted-foreground hover:text-danger"><X size={12} /></button>
            </span>
          ))}
          {items.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma área cadastrada.</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de produtos padrão por tipo de serviço (#6). */
function ServiceDefaultsPanel() {
  const { items: serviceTypes, update } = useServiceTypesStore();
  const products = useProductsStore((s) => s.items);
  const prodName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const prodUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? '';

  const addProduct = (stId: string, productId: string) => {
    if (!productId) return;
    const st = serviceTypes.find((s) => s.id === stId);
    const list = st?.defaultProducts ?? [];
    if (list.some((d) => d.productId === productId)) return;
    update(stId, { defaultProducts: [...list, { productId, qty: 1 }] });
  };
  const removeProduct = (stId: string, productId: string) => {
    const st = serviceTypes.find((s) => s.id === stId);
    update(stId, { defaultProducts: (st?.defaultProducts ?? []).filter((d) => d.productId !== productId) });
  };

  return (
    <Card className="mt-4">
      <CardHeader title="Tipos de serviço · produtos padrão" subtitle="Pré-preenchem a Ordem de Serviço; o técnico ajusta o que usou" />
      <CardBody className="space-y-3">
        {serviceTypes.map((st) => (
          <div key={st.id} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />
              <span className="text-sm font-semibold text-foreground">{st.name}</span>
              <span className="text-xs text-muted-foreground">· {st.defaultDurationMin}min</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(st.defaultProducts ?? []).map((dp) => (
                <span key={dp.productId} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
                  {prodName(dp.productId)} · {dp.qty} {prodUnit(dp.productId)}
                  <button onClick={() => removeProduct(st.id, dp.productId)} className="text-muted-foreground hover:text-danger"><X size={12} /></button>
                </span>
              ))}
              {(st.defaultProducts ?? []).length === 0 && <span className="text-xs text-muted-foreground">Nenhum produto padrão.</span>}
              <Select value="" onChange={(e) => addProduct(st.id, e.target.value)} className="h-7 w-auto text-xs">
                <option value="">+ produto</option>
                {products.filter((p) => !(st.defaultProducts ?? []).some((d) => d.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{value}</span></div>;
}
