import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, KeyRound, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Segmented } from './ui/Segmented';
import { Badge } from './ui/Badge';
import { useCustomersStore, type CustomerInput } from '@/store/customersStore';
import { useUsersStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
import type { ContractStatus, Customer, CustomerContact, Reservoir, ServiceContract } from '@/domain/types';
import type { CustomerType } from '@/domain/enums';
import { isEmail, isValidDocument, maskCep, maskDocument, maskPhone } from '@/lib/validation';
import { lookupCnpj } from '@/lib/cnpj';
import { lookupCep } from '@/lib/cep';
import { dateInputToIso, fmtDate, fmtDateLong } from '@/lib/date';
import { documentDigits, hashPassword, suggestPassword } from '@/lib/password';
import { toast } from '@/store/toastStore';

const DRAFT_KEY = 'namira-cliente-draft';

const LOCAL_STRUCTURE_PRESETS = ['Cozinha', 'Produção', 'Escritório', 'Câmara Fria', 'Estoque', 'Refeitório', 'Área Externa'];
const COMPLEMENTARY_SERVICE_PRESETS = ["Limpeza de Coifa", "Higienização de Caixa d'Água", 'Limpeza de Reservatórios', 'Sanitização', 'Outros'];
const RESERVOIR_TYPES = ["Caixa d'água", 'Cisterna', 'Reservatório elevado'];
const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  ativo: 'Ativo', vencido: 'Vencido', renovacao_pendente: 'Renovação pendente', cancelado: 'Cancelado',
};

/** Chips com toggle, quantidade (+/−) e adição de item personalizado — usado
 *  na Estrutura do Local, onde importa "2 banheiros, 3 quartos" e não só quais
 *  ambientes existem. O valor é um mapa nome → quantidade; ausente = não
 *  selecionado. Mesmo padrão das "Áreas tratadas" da Ordem de Serviço. */
function QtyTagChips({ presets, value, onChange }: { presets: string[]; value: Record<string, number>; onChange: (next: Record<string, number>) => void }) {
  const [custom, setCustom] = useState('');
  const all = [...new Set([...presets, ...Object.keys(value)])];

  const toggle = (name: string) => {
    if (value[name] != null) { const n = { ...value }; delete n[name]; onChange(n); }
    else onChange({ ...value, [name]: 1 });
  };
  const setQty = (name: string, qty: number) => onChange({ ...value, [name]: Math.max(1, qty) });
  const addCustom = () => {
    const n = custom.trim();
    if (n && !all.includes(n)) { onChange({ ...value, [n]: 1 }); setCustom(''); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {all.map((name) => {
          const qty = value[name];
          const active = qty != null;
          return (
            <div key={name} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              <button type="button" onClick={() => toggle(name)}>{name}</button>
              {active && (
                <span className="flex items-center gap-1 border-l border-brand/30 pl-1">
                  <button type="button" aria-label={`Diminuir quantidade de ${name}`} onClick={() => setQty(name, qty - 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">−</button>
                  <span className="w-3.5 text-center font-semibold">{qty}</span>
                  <button type="button" aria-label={`Aumentar quantidade de ${name}`} onClick={() => setQty(name, qty + 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">+</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Adicionar personalizado…" className="h-8 flex-1 rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()}>Adicionar</Button>
      </div>
    </div>
  );
}

/** Chips com toggle + adição de item personalizado — usado em Outros Serviços. */
function TagChips({ presets, value, onChange }: { presets: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const all = [...new Set([...presets, ...value])];
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  const addCustom = () => { const n = custom.trim(); if (n && !all.includes(n)) { onChange([...value, n]); setCustom(''); } };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {all.map((name) => (
          <button key={name} type="button" onClick={() => toggle(name)} className={`rounded-full border px-2.5 py-1 text-xs transition ${value.includes(name) ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted'}`}>{name}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Adicionar personalizado…" className="h-8 flex-1 rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()}>Adicionar</Button>
      </div>
    </div>
  );
}

type FormState = {
  type: CustomerType;
  name: string;
  companyName: string;
  document: string;
  phone: string;
  email: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  propertyType: string;
  areaM2: string;
  roomCount: string;
  tags: string;
  notes: string;
  permanentNotes: string;
  monitoring: boolean;
  registrationStatus: string;
  economicActivity: string;
};

const empty: FormState = {
  type: 'pf', name: '', companyName: '', document: '', phone: '',
  email: '', cep: '', street: '', number: '', complement: '', district: '',
  city: '', state: '', propertyType: '', areaM2: '', roomCount: '', tags: '', notes: '',
  permanentNotes: '', monitoring: false, registrationStatus: '', economicActivity: '',
};

function fromCustomer(c: Customer): FormState {
  return {
    type: c.type, name: c.name, companyName: c.companyName ?? '', document: c.document ?? '',
    phone: c.phone ?? '', email: c.email ?? '', cep: c.cep ?? '',
    street: c.street ?? '', number: c.number ?? '', complement: c.complement ?? '',
    district: c.district ?? '', city: c.city ?? '', state: c.state ?? '',
    propertyType: c.propertyType ?? '', areaM2: c.areaM2 ? String(c.areaM2) : '',
    roomCount: c.roomCount ? String(c.roomCount) : '',
    tags: c.tags.join(', '), notes: c.notes ?? '',
    permanentNotes: c.permanentNotes ?? '', monitoring: !!c.monitoringContracted,
    registrationStatus: c.registrationStatus ?? '', economicActivity: c.economicActivity ?? '',
  };
}

function toInput(f: FormState): CustomerInput {
  return {
    type: f.type,
    name: f.name.trim(),
    companyName: f.companyName.trim() || undefined,
    document: f.document.trim() || undefined,
    phone: f.phone.trim() || undefined,
    email: f.email.trim() || undefined,
    cep: f.cep.trim() || undefined,
    street: f.street.trim() || undefined,
    number: f.number.trim() || undefined,
    complement: f.complement.trim() || undefined,
    district: f.district.trim() || undefined,
    city: f.city.trim() || undefined,
    state: f.state.trim().toUpperCase() || undefined,
    propertyType: f.propertyType.trim() || undefined,
    areaM2: f.areaM2 ? Number(f.areaM2) : undefined,
    roomCount: f.roomCount ? Number(f.roomCount) : undefined,
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    notes: f.notes.trim() || undefined,
    permanentNotes: f.permanentNotes.trim() || undefined,
    monitoringContracted: f.monitoring,
    registrationStatus: f.registrationStatus.trim() || undefined,
    economicActivity: f.economicActivity.trim() || undefined,
  };
}

export function CustomerForm({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Customer | null;
  onClose: () => void;
  onSaved: (c: Customer, isNew: boolean) => void;
}) {
  const { add, update } = useCustomersStore();
  const staff = useUsersStore((s) => s.items);
  const isEdit = !!initial;
  const [form, setForm] = useState<FormState>(empty);
  const [touched, setTouched] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const [tier, setTier] = useState<'basico' | 'completo'>('completo');
  const [localStructure, setLocalStructure] = useState<Record<string, number>>({});
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [contactNextAt, setContactNextAt] = useState('');
  const [contactResponsibleId, setContactResponsibleId] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [complementary, setComplementary] = useState<string[]>([]);
  // Acesso do cliente ao Portal. A senha nunca é guardada nem relida em texto:
  // o que fica no cadastro é só o hash (lib/password.ts). Aqui ela existe só
  // enquanto o formulário está aberto, para o administrador copiar e entregar.
  const [portalAccess, setPortalAccess] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalHash, setPortalHash] = useState<string | undefined>();
  const [portalSetAt, setPortalSetAt] = useState<string | undefined>();

  // Inicializa o formulário quando abre.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(fromCustomer(initial));
      setTier(initial.registrationTier ?? 'completo');
      setLocalStructure(
        initial.localStructureQty && Object.keys(initial.localStructureQty).length
          ? initial.localStructureQty
          : Object.fromEntries((initial.localStructure ?? []).map((n) => [n, 1])),
      );
      setContacts(initial.contacts?.length ? initial.contacts : (initial.whatsapp ? [{ id: uid('ct'), name: 'Contato', phone: initial.whatsapp, isPrincipal: true }] : []));
      setReservoirs(initial.reservoirs ?? []);
      setContactNextAt(initial.contactSchedule?.nextContactAt?.slice(0, 10) ?? '');
      setContactResponsibleId(initial.contactSchedule?.responsibleId ?? '');
      setContactNotes(initial.contactSchedule?.notes ?? '');
      setContracts(initial.contracts ?? []);
      setComplementary(initial.complementaryServices ?? []);
      setPortalAccess(initial.portalAccess ?? false);
      setPortalHash(initial.portalPasswordHash);
      setPortalSetAt(initial.portalPasswordSetAt);
      setPortalPassword('');
    } else {
      setPortalAccess(false); setPortalHash(undefined); setPortalSetAt(undefined); setPortalPassword('');
      // restaura rascunho (auto-save) de um cadastro não finalizado
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        setForm(raw ? { ...empty, ...JSON.parse(raw) } : empty);
        setDraftSavedAt(raw ? new Date() : null);
      } catch {
        setForm(empty);
      }
      setTier('basico');
      setLocalStructure({}); setContacts([]); setReservoirs([]); setContactNextAt(''); setContactResponsibleId(''); setContactNotes(''); setContracts([]); setComplementary([]);
    }
    setTouched(false);
  }, [open, initial]);

  // Auto-save do rascunho (somente para novo cadastro).
  useEffect(() => {
    if (!open || isEdit || !touched) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setDraftSavedAt(new Date());
      } catch {
        /* ignora */
      }
    }, 600);
    return () => clearTimeout(debounce.current);
  }, [form, open, isEdit, touched]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = 'Informe o nome.';
    // Não bloqueia a edição de cadastros já existentes com documento
    // desatualizado/inválido (ex.: dados de exemplo) — só valida quando o
    // usuário de fato altera o campo.
    if (form.document.trim() && form.document !== (initial?.document ?? '') && !isValidDocument(form.document)) e.document = 'Documento inválido.';
    if (form.email.trim() && !isEmail(form.email)) e.email = 'E-mail inválido.';
    return e;
  }, [form, initial]);

  const set = (k: keyof FormState, v: string | boolean) => {
    setTouched(true);
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Consulta CNPJ na Receita (BrasilAPI) e preenche automaticamente.
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMsg, setCnpjMsg] = useState<string | null>(null);
  const doLookupCnpj = async () => {
    setCnpjMsg(null);
    setCnpjLoading(true);
    try {
      const d = await lookupCnpj(form.document);
      setTouched(true);
      setForm((f) => ({
        ...f,
        name: f.name || d.tradeName || d.companyName || '',
        companyName: d.companyName ?? f.companyName,
        street: d.street ?? f.street,
        number: d.number ?? f.number,
        complement: d.complement ?? f.complement,
        district: d.district ?? f.district,
        city: d.city ?? f.city,
        state: d.state ?? f.state,
        cep: d.cep ?? f.cep,
        phone: f.phone || d.phone || '',
        email: f.email || d.email || '',
        registrationStatus: d.registrationStatus ?? f.registrationStatus,
        economicActivity: d.economicActivity ?? f.economicActivity,
      }));
      setCnpjMsg('ok');
    } catch (err) {
      setCnpjMsg(err instanceof Error ? err.message : 'Falha na consulta.');
    } finally {
      setCnpjLoading(false);
    }
  };

  // Consulta o CEP (BrasilAPI) e preenche logradouro/bairro/cidade/UF. Dispara
  // sozinha assim que o CEP fica completo (8 dígitos) — vale para PF e PJ, nos
  // dois níveis de cadastro, já que o bloco de endereço é o mesmo.
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const lastCepLookup = useRef('');
  const doLookupCep = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastCepLookup.current) return;
    lastCepLookup.current = digits;
    setCepMsg(null);
    setCepLoading(true);
    try {
      const d = await lookupCep(digits);
      setTouched(true);
      // Não sobrescreve o que o usuário já digitou à mão.
      setForm((f) => ({
        ...f,
        street: f.street || d.street || '',
        district: f.district || d.district || '',
        city: f.city || d.city || '',
        state: f.state || d.state || '',
      }));
      setCepMsg('ok');
    } catch (err) {
      setCepMsg(err instanceof Error ? err.message : 'Falha na consulta.');
    } finally {
      setCepLoading(false);
    }
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const input: CustomerInput = {
      ...toInput(form),
      registrationTier: tier,
      localStructure: tier === 'completo' && Object.keys(localStructure).length ? Object.keys(localStructure) : undefined,
      localStructureQty: tier === 'completo' && Object.keys(localStructure).length ? localStructure : undefined,
      contacts: tier === 'completo' && contacts.length ? contacts : undefined,
      reservoirs: tier === 'completo' && reservoirs.length ? reservoirs : undefined,
      contactSchedule: tier === 'completo' && (contactNextAt || contactResponsibleId || contactNotes.trim())
        ? { nextContactAt: contactNextAt ? dateInputToIso(contactNextAt) : undefined, responsibleId: contactResponsibleId || undefined, notes: contactNotes.trim() || undefined }
        : undefined,
      contracts: tier === 'completo' && contracts.length ? contracts : undefined,
      complementaryServices: tier === 'completo' && complementary.length ? complementary : undefined,
      portalAccess,
      portalPasswordHash: portalHash,
      portalPasswordSetAt: portalSetAt,
    };
    if (initial) {
      update(initial.id, input);
      toast('Cliente atualizado.', { tone: 'success' });
      onSaved({ ...initial, ...input } as Customer, false);
    } else {
      const created = add(input);
      localStorage.removeItem(DRAFT_KEY);
      toast('Cliente cadastrado.', { tone: 'success' });
      onSaved(created, true);
    }
  };

  const cancel = () => {
    if (!isEdit) localStorage.removeItem(DRAFT_KEY);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={cancel}
      title={isEdit ? 'Editar cliente' : 'Novo cliente'}
      subtitle={isEdit ? initial?.name : 'Cadastro de cliente'}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!isEdit && draftSavedAt && (<><Cloud size={13} /> Rascunho salvo automaticamente</>)}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancel}>Cancelar</Button>
            <Button onClick={submit} leftIcon={<Check size={15} />} disabled={Object.keys(errors).length > 0}>
              {isEdit ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <Segmented
            value={tier}
            onChange={(v) => setTier(v)}
            options={[{ value: 'basico', label: 'Cadastro Básico' }, { value: 'completo', label: 'Cadastro Completo' }]}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {tier === 'basico' ? 'Rápido — apenas nome, endereço e telefone. Ideal para clientes ocasionais.' : 'Com estrutura do local, reservatórios, contratos e outros dados de clientes recorrentes.'}
          </p>
        </div>

        <Segmented
          value={form.type}
          onChange={(v) => set('type', v)}
          options={[{ value: 'pf', label: 'Pessoa Física' }, { value: 'pj', label: 'Pessoa Jurídica' }]}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={form.type === 'pj' ? 'Nome do contato' : 'Nome completo'} required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome" />
            {touched && errors.name && <Err msg={errors.name} />}
          </Field>
          {tier === 'completo' && form.type === 'pj' && (
            <Field label="Razão social / Empresa">
              <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
          )}
          <Field label={form.type === 'pf' ? 'CPF' : 'CNPJ'}>
            <div className="flex gap-2">
              <Input value={form.document} onChange={(e) => set('document', maskDocument(e.target.value, form.type))} placeholder={form.type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'} inputMode="numeric" />
              {form.type === 'pj' && (
                <Button type="button" variant="outline" size="icon" onClick={doLookupCnpj} disabled={cnpjLoading} title="Consultar na Receita" aria-label="Consultar CNPJ na Receita">
                  {cnpjLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </Button>
              )}
            </div>
            {touched && errors.document && <Err msg={errors.document} />}
            {cnpjMsg === 'ok' && <span className="mt-1 block text-xs text-success">Dados preenchidos pela Receita.</span>}
            {cnpjMsg && cnpjMsg !== 'ok' && <span className="mt-1 block text-xs text-danger">{cnpjMsg}</span>}
            {form.type === 'pj' && form.registrationStatus && (
              <span className="mt-1 inline-flex"><Badge tone={/ativa/i.test(form.registrationStatus) ? 'success' : 'warning'}>{form.registrationStatus}</Badge></span>
            )}
          </Field>
          {tier === 'completo' && (
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@email.com" />
              {touched && errors.email && <Err msg={errors.email} />}
            </Field>
          )}
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" />
          </Field>
        </div>

        {tier === 'completo' && (
          <div className="border-t border-border pt-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Telefone de contato</p>
            <p className="mb-3 text-xs text-muted-foreground">Pessoa responsável pelo atendimento/agendamento — pode ser diferente do telefone principal. Marque um contato como principal.</p>
            <ContactsPanel value={contacts} onChange={setContacts} />
          </div>
        )}

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Endereço</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="CEP" className="col-span-1">
              <div className="relative">
                <Input
                  value={form.cep}
                  onChange={(e) => { const v = maskCep(e.target.value); set('cep', v); doLookupCep(v); }}
                  onBlur={(e) => doLookupCep(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
                {cepLoading && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {cepMsg === 'ok' && <span className="mt-1 block text-xs text-success">Endereço preenchido.</span>}
              {cepMsg && cepMsg !== 'ok' && <span className="mt-1 block text-xs text-danger">{cepMsg}</span>}
            </Field>
            <Field label="Logradouro" className="col-span-2 sm:col-span-2"><Input value={form.street} onChange={(e) => set('street', e.target.value)} /></Field>
            <Field label="Número"><Input value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
            <Field label="Complemento" className="col-span-2"><Input value={form.complement} onChange={(e) => set('complement', e.target.value)} /></Field>
            <Field label="Bairro" className="col-span-2"><Input value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label="Cidade" className="col-span-2 sm:col-span-3"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="UF"><Input value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></Field>
            {/* Tipo de imóvel fica no cadastro básico também — antes só existia
                no completo, e a informação aparecia apenas na Agenda. */}
            <Field label="Tipo de imóvel" className="col-span-2">
              <Select value={form.propertyType} onChange={(e) => set('propertyType', e.target.value)}>
                <option value="">—</option>
                {['Residencial', 'Comercial', 'Industrial', 'Condomínio', 'Rural', 'Institucional'].map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            {tier === 'completo' && form.type === 'pf' && (
              <Field label="Quantidade de cômodos" className="col-span-2">
                <Input type="number" min={0} value={form.roomCount} onChange={(e) => set('roomCount', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ex.: 5" />
              </Field>
            )}
          </div>
        </div>

        {tier === 'completo' && (
          <>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Imóvel e observações</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Área aproximada (m²)" className="col-span-2"><Input value={form.areaM2} onChange={(e) => set('areaM2', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></Field>
                <Field label="Etiquetas (separadas por vírgula)" className="col-span-2"><Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Contrato mensal, Alimentício" /></Field>
                <Field label="Observações" className="col-span-2"><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
              </div>
            </div>

            {/* Complementos do contrato */}
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Contrato e monitoramento</p>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <input type="checkbox" checked={form.monitoring} onChange={(e) => set('monitoring', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Monitoramento contratado</span>
                  <span className="block text-xs text-muted-foreground">Habilita armadilhas, MIP e relatórios específicos para este cliente.</span>
                </span>
              </label>
              <Field label="Observações permanentes do contrato" hint="Aparecem automaticamente na Ordem de Serviço, na agenda e no app do técnico." className="mt-4">
                <Textarea value={form.permanentNotes} onChange={(e) => set('permanentNotes', e.target.value)} placeholder="Ex.: acessar pela portaria lateral; ligar antes de chegar; usar EPI específico; horário permitido…" />
              </Field>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Estrutura do local</p>
              <QtyTagChips presets={LOCAL_STRUCTURE_PRESETS} value={localStructure} onChange={setLocalStructure} />
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Reservatórios</p>
              <ReservoirsPanel value={reservoirs} onChange={setReservoirs} />
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Agenda de contato</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Próximo contato"><Input type="date" value={contactNextAt} onChange={(e) => setContactNextAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
                <Field label="Responsável">
                  <Select value={contactResponsibleId} onChange={(e) => setContactResponsibleId(e.target.value)}><option value="">—</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
                </Field>
                <Field label="Observações" className="col-span-2"><Textarea value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} placeholder="Ex.: ligar para renovar contrato, enviar proposta…" /></Field>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Contratos</p>
              <ContractsPanel value={contracts} onChange={setContracts} />
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Outros serviços</p>
              <TagChips presets={COMPLEMENTARY_SERVICE_PRESETS} value={complementary} onChange={setComplementary} />
            </div>
          </>
        )}

        <div className="border-t border-border pt-4">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            <KeyRound size={13} /> Acesso do cliente
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Com o acesso ativo, o cliente entra no Portal com o CPF/CNPJ deste cadastro e a senha que você definir.
            Ele vê só os próprios atendimentos, documentos e pagamentos.
          </p>
          <PortalAccessPanel
            document={form.document}
            enabled={portalAccess}
            onEnabledChange={setPortalAccess}
            password={portalPassword}
            onPasswordChange={setPortalPassword}
            hasPassword={!!portalHash}
            setAt={portalSetAt}
            onDefine={async (senha: string) => {
              setPortalHash(await hashPassword(senha));
              setPortalSetAt(new Date().toISOString());
              toast('Senha definida. Ela vale depois de salvar o cadastro.', { tone: 'success' });
            }}
          />
        </div>
      </div>
    </Drawer>
  );
}

/** Lista de reservatórios (caixa d'água, cisterna…) com adição/remoção inline. */
/** Telefone(s) de contato do cliente — quem de fato atende/agenda, com um
 *  marcado como contato principal (usado por padrão no WhatsApp/ligações). */
function ContactsPanel({ value, onChange }: { value: CustomerContact[]; onChange: (next: CustomerContact[]) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');

  const add = () => {
    if (!phone.trim()) return;
    onChange([...value, { id: uid('ct'), name: name.trim() || 'Contato', phone: phone.trim(), role: role.trim() || undefined, isPrincipal: value.length === 0 }]);
    setName(''); setPhone(''); setRole('');
  };
  const remove = (id: string) => {
    const removed = value.find((c) => c.id === id);
    const next = value.filter((c) => c.id !== id);
    if (removed?.isPrincipal && next.length) next[0] = { ...next[0], isPrincipal: true };
    onChange(next);
  };
  const setPrincipal = (id: string) => onChange(value.map((c) => ({ ...c, isPrincipal: c.id === id })));

  return (
    <div className="space-y-2">
      {value.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-foreground">{c.name}{c.role ? ` · ${c.role}` : ''} — {c.phone}</span>
          <button type="button" onClick={() => setPrincipal(c.id)} className="shrink-0" aria-label={c.isPrincipal ? `${c.name} é o contato principal` : `Definir ${c.name} como contato principal`}>
            <Badge tone={c.isPrincipal ? 'brand' : 'neutral'}>{c.isPrincipal ? 'Principal' : 'Definir principal'}</Badge>
          </button>
          <button type="button" onClick={() => remove(c.id)} className="shrink-0 text-muted-foreground hover:text-danger" aria-label={`Remover ${c.name}`}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-9 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" className="h-9 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Cargo (opcional)" className="h-9 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
      </div>
      <Button type="button" size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={add} disabled={!phone.trim()}>Adicionar contato</Button>
    </div>
  );
}

function ReservoirsPanel({ value, onChange }: { value: Reservoir[]; onChange: (next: Reservoir[]) => void }) {
  const [type, setType] = useState(RESERVOIR_TYPES[0]);
  const [location, setLocation] = useState('');
  const add = () => { onChange([...value, { id: uid('res'), type, location: location.trim() || undefined }]); setLocation(''); };
  const remove = (id: string) => onChange(value.filter((r) => r.id !== id));
  return (
    <div className="space-y-2">
      {value.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
          <span className="text-foreground">{r.type}{r.location ? ` · ${r.location}` : ''}</span>
          <button type="button" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-danger" aria-label={`Remover ${r.type}`}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-[200px]">{RESERVOIR_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Localização (opcional)" className="h-9 flex-1 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <Button type="button" size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={add}>Adicionar</Button>
      </div>
    </div>
  );
}

/** Lista de contratos vinculados ao cliente com adição/remoção inline. */
function ContractsPanel({ value, onChange }: { value: ServiceContract[]; onChange: (next: ServiceContract[]) => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [renewal, setRenewal] = useState('Automática');
  const [status, setStatus] = useState<ContractStatus>('ativo');
  const add = () => {
    onChange([...value, {
      id: uid('contract'),
      startDate: startDate ? dateInputToIso(startDate) : undefined,
      endDate: endDate ? dateInputToIso(endDate) : undefined,
      renewal,
      status,
    }]);
    setStartDate(''); setEndDate('');
  };
  const remove = (id: string) => onChange(value.filter((c) => c.id !== id));
  return (
    <div className="space-y-2">
      {value.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
          <span className="text-foreground">
            {c.startDate ? fmtDate(c.startDate) : '—'} → {c.endDate ? fmtDate(c.endDate) : '—'} · {c.renewal} · <Badge tone={c.status === 'ativo' ? 'success' : c.status === 'vencido' ? 'danger' : c.status === 'renovacao_pendente' ? 'warning' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
          </span>
          <button type="button" onClick={() => remove(c.id)} className="text-muted-foreground hover:text-danger" aria-label="Remover contrato"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Início"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        <Field label="Vencimento"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        <Field label="Renovação"><Select value={renewal} onChange={(e) => setRenewal(e.target.value)}>{['Automática', 'Manual', 'Não renova'].map((o) => <option key={o}>{o}</option>)}</Select></Field>
        <Field label="Situação"><Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>{(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</option>)}</Select></Field>
      </div>
      <Button type="button" size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={add}>Adicionar contrato</Button>
    </div>
  );
}

/**
 * Acesso do cliente ao Portal.
 *
 * O administrador liga o acesso e define a senha; a senha em si nunca volta a
 * aparecer — o cadastro guarda só o hash (ver `lib/password.ts`), então a
 * única operação possível depois é redefinir. O login é o CPF/CNPJ do
 * próprio cadastro, por isso o painel avisa quando o documento está em
 * branco: sem ele o cliente não tem como entrar.
 */
function PortalAccessPanel({
  document: doc, enabled, onEnabledChange, password, onPasswordChange,
  hasPassword, setAt, onDefine,
}: {
  document: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  hasPassword: boolean;
  setAt?: string;
  onDefine: (senha: string) => Promise<void>;
}) {
  const [erro, setErro] = useState('');
  const semDocumento = documentDigits(doc).length !== 11 && documentDigits(doc).length !== 14;

  const definir = async () => {
    if (password.trim().length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
    setErro('');
    await onDefine(password.trim());
  };

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Permitir acesso ao Portal do Cliente</span>
          <span className="block text-xs text-muted-foreground">
            {hasPassword
              ? `Senha definida${setAt ? ` em ${fmtDateLong(setAt)}` : ''}.`
              : 'Ainda sem senha — defina uma abaixo para o acesso funcionar.'}
          </span>
        </span>
      </label>

      {enabled && semDocumento && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-xs text-foreground">
          O login do Portal é o CPF/CNPJ. Preencha o documento no cadastro, senão o cliente não consegue entrar.
        </p>
      )}

      {enabled && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Field label={hasPassword ? 'Nova senha' : 'Senha de acesso'}>
            <Input
              type="text"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
              autoComplete="off"
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => onPasswordChange(suggestPassword())}>Gerar</Button>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={definir} disabled={!password.trim()} leftIcon={<Check size={15} />}>
              {hasPassword ? 'Redefinir' : 'Definir senha'}
            </Button>
          </div>
        </div>
      )}
      {erro && <span className="block text-xs text-danger">{erro}</span>}
      {enabled && (
        <p className="text-xs text-muted-foreground">
          Anote e entregue a senha ao cliente agora: depois de salva, ela não pode mais ser lida — só redefinida.
        </p>
      )}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return <span className="mt-1 block text-xs text-danger">{msg}</span>;
}
