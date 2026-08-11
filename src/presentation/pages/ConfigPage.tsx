import { useEffect, useRef, useState } from 'react';
import { Bug, Building2, ImageUp, MapPin, Plus, Radar, Trash2, Wrench, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import { useAreasStore, useDepartmentsStore, usePestsStore, useProductsStore, useServiceTypesStore, useTrapTypesStore, useUsersStore, useLicensesStore } from '@/store/entityStores';
import { useSettingsStore } from '@/store/settingsStore';
import { useOrgProfileStore } from '@/store/orgProfileStore';
import { uid } from '@/store/createEntityStore';
import { toast } from '@/store/toastStore';
import { cn, daysUntil, formatCurrency } from '@/lib/utils';
import { maskDocument, maskCep, maskPhone } from '@/lib/validation';
import { dateInputToIso } from '@/lib/date';
import { SignaturePad } from '../components/SignaturePad';
import { ROLE_META, MODULE_META, ALL_MODULES, type PermissionModule } from '@/domain/enums';
import type { Department, User } from '@/domain/types';

type Tab = 'empresa' | 'departamento' | 'cadastro' | 'operacional';

export function ConfigPage() {
  const [tab, setTab] = useState<Tab>('empresa');

  return (
    <div>
      <PageHeader title="Configurações" description="Empresa, departamentos, cadastros e operação" actions={<Button>Convidar usuário</Button>} />

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'empresa', label: 'Empresa' },
            { value: 'departamento', label: 'Departamento' },
            { value: 'cadastro', label: 'Cadastro' },
            { value: 'operacional', label: 'Operacional' },
          ]}
        />
      </div>

      {tab === 'empresa' && <EmpresaTab />}
      {tab === 'departamento' && <DepartamentoTab />}
      {tab === 'cadastro' && <CadastroTab />}
      {tab === 'operacional' && <OperacionalTab />}
    </div>
  );
}

// ── Empresa ──────────────────────────────────────────────────────────────
function EmpresaTab() {
  const { profile, setProfile } = useOrgProfileStore();
  const [form, setForm] = useState(profile);
  useEffect(() => setForm(profile), [profile]);
  const dirty = JSON.stringify(form) !== JSON.stringify(profile);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Dados da empresa" subtitle="Identidade usada nos documentos, na NFS-e e no cabeçalho do sistema" action={<Building2 size={18} className="text-brand" />} />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nome fantasia"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Razão social" className="sm:col-span-2"><Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
            <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => set('cnpj', maskDocument(e.target.value, 'pj'))} inputMode="numeric" /></Field>
            <Field label="Regime tributário">
              <Select value={form.taxRegime} onChange={(e) => set('taxRegime', e.target.value)}>
                <option value="Simples Nacional">Simples Nacional</option>
                <option value="Lucro Presumido">Lucro Presumido</option>
                <option value="Lucro Real">Lucro Real</option>
              </Select>
            </Field>
            <Field label="Inscrição municipal"><Input value={form.municipalRegistration} onChange={(e) => set('municipalRegistration', e.target.value)} placeholder="Opcional" /></Field>
            <Field label="Inscrição estadual"><Input value={form.stateRegistration} onChange={(e) => set('stateRegistration', e.target.value)} placeholder="Opcional — só se emitir NF-e/NFC-e" /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contato@empresa.com" /></Field>
            <Field label="CEP"><Input value={form.cep} onChange={(e) => set('cep', maskCep(e.target.value))} /></Field>
            <Field label="Endereço" className="sm:col-span-2"><Input value={form.street} onChange={(e) => set('street', e.target.value)} /></Field>
            <Field label="Bairro"><Input value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label="Cidade"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="UF"><Input value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={!dirty} onClick={() => { setProfile(form); toast('Dados da empresa atualizados.', { tone: 'success' }); }}>Salvar</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Logo" subtitle="Exibida no cabeçalho de OS, Certificado, Laudo e Relatórios" />
          <CardBody>
            <LogoUpload value={profile.logoDataUrl} onChange={(v) => setProfile({ logoDataUrl: v })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Responsável técnico" subtitle="Assina Certificado e Laudo — identificação + assinatura" />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Nome" className="sm:col-span-3"><Input value={form.technicalResponsibleName} onChange={(e) => { set('technicalResponsibleName', e.target.value); }} onBlur={() => setProfile({ technicalResponsibleName: form.technicalResponsibleName })} /></Field>
              <Field label="Formação"><Input value={form.technicalResponsibleRole} onChange={(e) => set('technicalResponsibleRole', e.target.value)} onBlur={() => setProfile({ technicalResponsibleRole: form.technicalResponsibleRole })} placeholder="Ex.: Farmacêutica" /></Field>
              <Field label="Registro profissional" className="sm:col-span-2"><Input value={form.technicalResponsibleRegistry} onChange={(e) => set('technicalResponsibleRegistry', e.target.value)} onBlur={() => setProfile({ technicalResponsibleRegistry: form.technicalResponsibleRegistry })} placeholder="Ex.: CRF-SP 48213" /></Field>
            </div>
            <SignatureBlock />
          </CardBody>
        </Card>
      </div>

      <SanitaryLicensePanel />
    </div>
  );
}

/** Upload de imagem (sem desenho — diferente da assinatura). */
function LogoUpload({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const load = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface">
        {value ? <img src={value} alt="Logo da empresa" className="max-h-full max-w-full object-contain p-2" /> : <span className="text-sm text-muted-foreground">Nenhuma logo definida</span>}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
        <Button type="button" variant="outline" size="sm" leftIcon={<ImageUp size={13} />} onClick={() => inputRef.current?.click()}>Carregar imagem</Button>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>Remover</Button>}
      </div>
    </div>
  );
}

/** Assinatura do responsável técnico — usada em `responsibleSignatureLine()` (printDocuments.ts). */
function SignatureBlock() {
  const { companySignature, setCompanySignature } = useSettingsStore();
  return (
    <div>
      <SignaturePad value={companySignature} onChange={(d) => setCompanySignature(d)} height={110} />
      {companySignature && <p className="mt-1 text-xs text-success">Assinatura definida.</p>}
    </div>
  );
}

/** Alvará Sanitário — busca (ou cria) a licença correspondente em useLicensesStore
 *  para edição rápida direto da aba Empresa, sem duplicar dado com o módulo Fiscal. */
function SanitaryLicensePanel() {
  const { items, add, update } = useLicensesStore();
  const license = items.find((l) => l.name === 'Alvará Sanitário');
  const [number, setNumber] = useState(license?.number ?? '');
  const [expiresAt, setExpiresAt] = useState(license?.expiresAt ? license.expiresAt.slice(0, 10) : '');
  useEffect(() => { setNumber(license?.number ?? ''); setExpiresAt(license?.expiresAt ? license.expiresAt.slice(0, 10) : ''); }, [license?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const status = expiresAt && dateInputToIso(expiresAt) < new Date().toISOString() ? 'vencida' : 'ativa';
    if (license) {
      update(license.id, { number: number.trim() || undefined, expiresAt: expiresAt ? dateInputToIso(expiresAt) : undefined, status });
    } else {
      add({ id: uid('lic'), orgId: 'org-namira', name: 'Alvará Sanitário', number: number.trim() || undefined, expiresAt: expiresAt ? dateInputToIso(expiresAt) : undefined, status });
    }
    toast('Licença sanitária atualizada.', { tone: 'success' });
  };
  const dirty = number !== (license?.number ?? '') || expiresAt !== (license?.expiresAt ? license.expiresAt.slice(0, 10) : '');
  const d = daysUntil(license?.expiresAt) ?? 999;

  return (
    <Card>
      <CardHeader
        title="Licença sanitária (Alvará)"
        subtitle="Demais licenças e responsáveis técnicos ficam em Fiscal & Conformidade"
        action={license?.expiresAt ? (d < 0 ? <Badge tone="danger" dot>Vencida</Badge> : d <= 30 ? <Badge tone="warning" dot>Vence em {d}d</Badge> : <Badge tone="success" dot>Ativa</Badge>) : undefined}
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Número"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ex.: VS-2025-0001" /></Field>
        <Field label="Vencimento"><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        <div className="flex items-end"><Button size="sm" disabled={!dirty} onClick={save} className="w-full">Salvar</Button></div>
      </CardBody>
    </Card>
  );
}

// ── Departamento ─────────────────────────────────────────────────────────
function DepartamentoTab() {
  const users = useUsersStore((s) => s.items);
  const updateUser = useUsersStore((s) => s.update);
  const departments = useDepartmentsStore((s) => s.items);
  const addDept = useDepartmentsStore((s) => s.add);
  const updateDept = useDepartmentsStore((s) => s.update);
  const removeDept = useDepartmentsStore((s) => s.remove);

  const columns: Column<User>[] = [
    { key: 'name', header: 'Usuário', render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div>
    ) },
    { key: 'role', header: 'Perfil', render: (u) => <Badge tone="brand">{ROLE_META[u.role].label}</Badge> },
    { key: 'dept', header: 'Departamento', render: (u) => (
      u.role === 'admin'
        ? <span className="text-xs text-muted-foreground">Acesso total</span>
        : <Select value={u.departmentId ?? ''} onChange={(e) => updateUser(u.id, { departmentId: e.target.value || undefined })} className="h-8 w-40 text-xs">
            <option value="">— sem departamento —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
    ) },
    { key: 'status', header: 'Status', align: 'right', render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'} dot>{u.isActive ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        O Administrador sempre tem acesso total a todos os módulos. Para os demais, o acesso é definido pelo departamento
        do usuário — e pode ser ajustado individualmente em "Exceções por usuário", abaixo (ex.: liberar Financeiro só para
        uma pessoa do Administrativo, sem abrir pro departamento inteiro).
      </div>

      <DepartmentsPanel departments={departments} onAdd={addDept} onUpdate={updateDept} onRemove={removeDept} />

      <Card>
        <CardHeader title="Usuários e equipe" subtitle={`${users.length} usuários · defina o departamento de cada um`} />
        <CardBody className="p-0">
          <div className="px-4 pb-4"><Table columns={columns} rows={users} keyField={(u) => u.id} /></div>
        </CardBody>
      </Card>

      <UserOverridesPanel users={users} departments={departments} onUpdateUser={updateUser} />
    </div>
  );
}

/** Departamentos e os módulos que cada um acessa por padrão. */
function DepartmentsPanel({ departments, onAdd, onUpdate, onRemove }: {
  departments: Department[];
  onAdd: (d: Department) => void;
  onUpdate: (id: string, patch: Partial<Department>) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const create = () => {
    if (!name.trim()) return;
    onAdd({ id: uid('dept'), orgId: 'org-namira', name: name.trim(), modules: ['dashboard'] });
    setName('');
  };
  const toggleModule = (dept: Department, mod: PermissionModule) => {
    const has = dept.modules.includes(mod);
    onUpdate(dept.id, { modules: has ? dept.modules.filter((m) => m !== mod) : [...dept.modules, mod] });
  };

  return (
    <Card>
      <CardHeader title="Departamentos" subtitle="Módulos que cada departamento acessa por padrão" />
      <CardBody className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo departamento" onKeyDown={(e) => e.key === 'Enter' && create()} />
          <Button leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button>
        </div>
        <div className="space-y-3">
          {departments.map((d) => (
            <div key={d.id} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input value={d.name} onChange={(e) => onUpdate(d.id, { name: e.target.value })} className="h-8 w-48 text-sm font-medium" aria-label={`Nome do departamento ${d.name}`} />
                <button onClick={() => onRemove(d.id)} aria-label={`Excluir ${d.name}`} className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={14} /></button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {ALL_MODULES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={d.modules.includes(m)} onChange={() => toggleModule(d, m)} className="h-3.5 w-3.5 rounded border-border" />
                    {MODULE_META[m].label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {departments.length === 0 && <p className="text-xs text-muted-foreground">Nenhum departamento cadastrado.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

/** Exceções individuais — libera ou bloqueia um módulo específico para um
 *  usuário, além do que o departamento dele já define. */
function UserOverridesPanel({ users, departments, onUpdateUser }: {
  users: User[];
  departments: Department[];
  onUpdateUser: (id: string, patch: Partial<User>) => void;
}) {
  const eligible = users.filter((u) => u.role !== 'admin' && u.role !== 'tecnico');
  const [userId, setUserId] = useState('');
  useEffect(() => { if ((!userId || !eligible.some((u) => u.id === userId)) && eligible[0]) setUserId(eligible[0].id); }, [userId, eligible]);
  const user = eligible.find((u) => u.id === userId);
  const dept = user?.departmentId ? departments.find((d) => d.id === user.departmentId) : undefined;

  const setOverride = (mod: PermissionModule, value: 'default' | 'grant' | 'deny') => {
    if (!user) return;
    const next = { ...(user.permissionOverrides ?? {}) };
    if (value === 'default') delete next[mod];
    else next[mod] = value === 'grant';
    onUpdateUser(user.id, { permissionOverrides: next });
  };

  return (
    <Card>
      <CardHeader title="Exceções por usuário" subtitle="Libera ou bloqueia um módulo específico além do padrão do departamento" />
      <CardBody className="space-y-3">
        <Field label="Usuário">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {eligible.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        {user && (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_MODULES.map((m) => {
              const override = user.permissionOverrides?.[m];
              const inherited = dept?.modules.includes(m) ?? false;
              return (
                <div key={m} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs">
                  <span className="text-foreground">{MODULE_META[m].label}</span>
                  <Select
                    value={override === undefined ? 'default' : override ? 'grant' : 'deny'}
                    onChange={(e) => setOverride(m, e.target.value as 'default' | 'grant' | 'deny')}
                    className="h-7 w-36 px-1.5 text-[11px]"
                  >
                    <option value="default">{inherited ? 'Padrão (libera)' : 'Padrão (bloqueia)'}</option>
                    <option value="grant">Liberar</option>
                    <option value="deny">Bloquear</option>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
        {!user && <p className="text-xs text-muted-foreground">Nenhum usuário elegível (admin sempre tem acesso total; técnico só usa o App de Campo).</p>}
      </CardBody>
    </Card>
  );
}

// ── Cadastro ─────────────────────────────────────────────────────────────
function CadastroTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cadastros que alimentam a Ordem de Serviço e o monitoramento. Alterações aqui refletem automaticamente nos próximos registros —
        os já existentes não são afetados.
      </p>
      <ServicesPanel />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PestsPanel />
        <AreasPanel />
      </div>
      <TrapTypesPanel />
      <Card>
        <CardHeader title="Produtos" subtitle="Categorias, fornecedores, lotes e estoque — módulo próprio" />
        <CardBody className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">O cadastro completo de produtos (com estoque e lotes) fica em Produtos, no menu lateral.</p>
          <Button variant="outline" size="sm" onClick={() => { window.location.href = '/produtos'; }}>Abrir Produtos</Button>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Operacional ──────────────────────────────────────────────────────────
function OperacionalTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configurações usadas na Agenda e na Ordem de Serviço.</p>
      <TechnicianSignaturesPanel />
      <EmergencyPanel />
    </div>
  );
}

/** Assinatura de cada técnico — incorporada ao PDF da OS/Laudo como "Técnico de Execução". */
function TechnicianSignaturesPanel() {
  const { signatures, setUserSignature } = useSettingsStore();
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico'));
  const [userId, setUserId] = useState('');
  useEffect(() => { if (!userId && technicians[0]) setUserId(technicians[0].id); }, [userId, technicians]);

  return (
    <Card>
      <CardHeader title="Assinaturas dos técnicos" subtitle="Incorporadas ao PDF da Ordem de Serviço como 'Técnico de Execução'" />
      <CardBody>
        <div className="mb-2 flex items-center gap-2">
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
    <Card>
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

/** Cadastro de pragas — alimenta a Ordem de Serviço (nome, categoria, validade
 *  do combate). Inativas somem da seleção em novas OS, mas ficam preservadas
 *  em OS/documentos já existentes (getPest continua as resolvendo). */
function PestsPanel() {
  const { items, add, update, remove } = usePestsStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [warranty, setWarranty] = useState('');
  const [validity, setValidity] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('p'), orgId: 'org-namira', name: name.trim(), category: category.trim() || undefined, defaultWarrantyDays: warranty ? Number(warranty) : undefined, defaultValidityDays: validity ? Number(validity) : undefined, isActive: true });
    toast('Praga cadastrada.', { tone: 'success' });
    setName(''); setCategory(''); setWarranty(''); setValidity('');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Bug size={16} className="text-brand" /> Pragas</span>} subtitle={`${items.length} cadastradas · validade do combate alimenta a OS`} />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Percevejos" onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label="Categoria"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Rasteira / Voadora…" /></Field>
          <Field label="Garantia padrão (dias)"><Input type="number" min={0} value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="90" /></Field>
          <Field label="Validade do combate (dias)"><Input type="number" min={0} value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Ex.: 90 (3 meses)" /></Field>
          <div className="col-span-2 flex items-end"><Button className="w-full" leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button></div>
        </div>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {items.map((p) => {
            const active = p.isActive !== false;
            return (
              <div key={p.id} className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2', !active && 'opacity-60')}>
                <Input
                  value={p.name} onChange={(e) => update(p.id, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 text-sm font-medium" aria-label={`Nome da praga ${p.name}`}
                />
                {p.category && <Badge tone="neutral">{p.category}</Badge>}
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Validade (dias)
                  <Input
                    type="number" min={0} value={p.defaultValidityDays ?? ''}
                    onChange={(e) => update(p.id, { defaultValidityDays: e.target.value ? Number(e.target.value) : undefined })}
                    className="h-7 w-20 px-2 text-xs" placeholder="—"
                    aria-label={`Validade do combate a ${p.name}`}
                  />
                </label>
                <button
                  onClick={() => update(p.id, { isActive: !active })}
                  className="shrink-0"
                  aria-label={active ? `Desativar ${p.name}` : `Ativar ${p.name}`}
                >
                  <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'Ativa' : 'Inativa'}</Badge>
                </button>
                <button onClick={() => remove(p.id)} aria-label={`Excluir ${p.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={14} /></button>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma praga cadastrada.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de áreas tratadas — selecionáveis (com quantidade) na OS e
 *  exibidas no PDF. Inativas somem da seleção em novas OS, mas ficam
 *  preservadas em OS já existentes. */
function AreasPanel() {
  const { items, add, update, remove } = useAreasStore();
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('ar'), orgId: 'org-namira', name: name.trim(), isActive: true });
    setName('');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><MapPin size={16} className="text-brand" /> Áreas tratadas</span>} subtitle={`${items.length} cadastradas · selecionáveis (com quantidade) na OS`} />
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Refeitório" onKeyDown={(e) => e.key === 'Enter' && create()} />
          <Button leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button>
        </div>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {items.map((a) => {
            const active = a.isActive !== false;
            return (
              <div key={a.id} className={cn('flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2', !active && 'opacity-60')}>
                <Input value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} className="h-8 min-w-0 flex-1 text-sm" aria-label={`Nome da área ${a.name}`} />
                <button onClick={() => update(a.id, { isActive: !active })} className="shrink-0" aria-label={active ? `Desativar ${a.name}` : `Ativar ${a.name}`}>
                  <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'Ativa' : 'Inativa'}</Badge>
                </button>
                <button onClick={() => remove(a.id)} aria-label={`Excluir ${a.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={14} /></button>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma área cadastrada.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de tipos de armadilha — alimenta o campo "Tipo" ao instalar uma
 *  armadilha no cliente (TrapsPanel). Inativos somem da seleção em novas
 *  instalações, mas ficam preservados em armadilhas já cadastradas. */
function TrapTypesPanel() {
  const { items, add, update, remove } = useTrapTypesStore();
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('tt'), orgId: 'org-namira', name: name.trim(), isActive: true });
    setName('');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Radar size={16} className="text-brand" /> Armadilhas</span>} subtitle={`${items.length} tipos cadastrados · alimenta o cadastro de armadilhas do cliente`} />
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Placa de cola" onKeyDown={(e) => e.key === 'Enter' && create()} />
          <Button leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar</Button>
        </div>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {items.map((t) => {
            const active = t.isActive !== false;
            return (
              <div key={t.id} className={cn('flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2', !active && 'opacity-60')}>
                <Input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} className="h-8 min-w-0 flex-1 text-sm" aria-label={`Nome do tipo de armadilha ${t.name}`} />
                <button onClick={() => update(t.id, { isActive: !active })} className="shrink-0" aria-label={active ? `Desativar ${t.name}` : `Ativar ${t.name}`}>
                  <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'Ativo' : 'Inativo'}</Badge>
                </button>
                <button onClick={() => remove(t.id)} aria-label={`Excluir ${t.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={14} /></button>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum tipo cadastrado.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro de serviços — nome, valor padrão (opcional, sugerido na OS e
 *  editável antes da confirmação), produtos padrão e validade. Inativos
 *  somem da seleção em novas OS, mas ficam preservados em OS já existentes
 *  (getServiceType continua as resolvendo para documentos/histórico). */
function ServicesPanel() {
  const { items: serviceTypes, add, update, remove } = useServiceTypesStore();
  const products = useProductsStore((s) => s.items);
  const prodName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const prodUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? '';
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const create = () => {
    if (!name.trim()) return;
    add({ id: uid('st'), orgId: 'org-namira', name: name.trim(), defaultDurationMin: 60, defaultPrice: price ? Number(price) : 0, color: '#0ea5e9', isActive: true });
    toast('Serviço cadastrado.', { tone: 'success' });
    setName(''); setPrice('');
  };
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
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Wrench size={16} className="text-brand" /> Serviços</span>} subtitle={`${serviceTypes.length} cadastrados · valor padrão sugere o valor da OS`} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dedetização" onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label="Valor padrão (opcional)" hint="Sugerido na OS; pode ser alterado por atendimento"><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></Field>
        </div>
        <Button leftIcon={<Plus size={15} />} onClick={create} disabled={!name.trim()}>Adicionar serviço</Button>

        <div className="space-y-2">
          {serviceTypes.map((st) => {
            const active = st.isActive !== false;
            return (
              <div key={st.id} className={cn('rounded-xl border border-border p-3', !active && 'opacity-60')}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: st.color }} />
                  <Input value={st.name} onChange={(e) => update(st.id, { name: e.target.value })} className="h-8 w-40 text-sm font-medium" aria-label={`Nome do serviço ${st.name}`} />
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    Valor padrão
                    <Input
                      type="number" min={0} step="0.01" value={st.defaultPrice || ''}
                      onChange={(e) => update(st.id, { defaultPrice: e.target.value ? Number(e.target.value) : 0 })}
                      className="h-7 w-24 px-2 text-xs" placeholder="—"
                      aria-label={`Valor padrão de ${st.name}`}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    Validade (dias)
                    <Input
                      type="number" min={0} value={st.defaultValidityDays ?? ''}
                      onChange={(e) => update(st.id, { defaultValidityDays: e.target.value ? Number(e.target.value) : undefined })}
                      className="h-7 w-20 px-2 text-xs" placeholder="—"
                      aria-label={`Validade padrão de ${st.name}`}
                    />
                  </label>
                  {st.defaultPrice > 0 && <Badge tone="brand">{formatCurrency(st.defaultPrice)}</Badge>}
                  <button onClick={() => update(st.id, { isActive: !active })} className="ml-auto shrink-0" aria-label={active ? `Desativar ${st.name}` : `Ativar ${st.name}`}>
                    <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'Ativo' : 'Inativo'}</Badge>
                  </button>
                  <button onClick={() => remove(st.id)} aria-label={`Excluir ${st.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={14} /></button>
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
            );
          })}
          {serviceTypes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum serviço cadastrado.</p>}
        </div>
      </CardBody>
    </Card>
  );
}
