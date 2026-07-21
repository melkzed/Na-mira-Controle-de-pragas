import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, Loader2, Search } from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Segmented } from './ui/Segmented';
import { Badge } from './ui/Badge';
import { useCustomersStore, type CustomerInput } from '@/store/customersStore';
import type { Customer } from '@/domain/types';
import type { CustomerType } from '@/domain/enums';
import { isEmail, isValidDocument, maskCep, maskDocument, maskPhone } from '@/lib/validation';
import { lookupCnpj } from '@/lib/cnpj';

const DRAFT_KEY = 'namira-cliente-draft';

type FormState = {
  type: CustomerType;
  name: string;
  companyName: string;
  document: string;
  phone: string;
  whatsapp: string;
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
  tags: string;
  notes: string;
  permanentNotes: string;
  monitoring: boolean;
  registrationStatus: string;
  economicActivity: string;
};

const empty: FormState = {
  type: 'pf', name: '', companyName: '', document: '', phone: '', whatsapp: '',
  email: '', cep: '', street: '', number: '', complement: '', district: '',
  city: '', state: '', propertyType: '', areaM2: '', tags: '', notes: '',
  permanentNotes: '', monitoring: false, registrationStatus: '', economicActivity: '',
};

function fromCustomer(c: Customer): FormState {
  return {
    type: c.type, name: c.name, companyName: c.companyName ?? '', document: c.document ?? '',
    phone: c.phone ?? '', whatsapp: c.whatsapp ?? '', email: c.email ?? '', cep: c.cep ?? '',
    street: c.street ?? '', number: c.number ?? '', complement: c.complement ?? '',
    district: c.district ?? '', city: c.city ?? '', state: c.state ?? '',
    propertyType: c.propertyType ?? '', areaM2: c.areaM2 ? String(c.areaM2) : '',
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
    whatsapp: f.whatsapp.trim() || undefined,
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
  const isEdit = !!initial;
  const [form, setForm] = useState<FormState>(empty);
  const [touched, setTouched] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Inicializa o formulário quando abre.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(fromCustomer(initial));
    } else {
      // restaura rascunho (auto-save) de um cadastro não finalizado
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        setForm(raw ? { ...empty, ...JSON.parse(raw) } : empty);
        setDraftSavedAt(raw ? new Date() : null);
      } catch {
        setForm(empty);
      }
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
    if (form.document.trim() && !isValidDocument(form.document)) e.document = 'Documento inválido.';
    if (form.email.trim() && !isEmail(form.email)) e.email = 'E-mail inválido.';
    return e;
  }, [form]);

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

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const input = toInput(form);
    if (initial) {
      update(initial.id, input);
      onSaved({ ...initial, ...input } as Customer, false);
    } else {
      const created = add(input);
      localStorage.removeItem(DRAFT_KEY);
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
      width="max-w-xl"
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
      <div className="space-y-4">
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
          {form.type === 'pj' && (
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
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@email.com" />
            {touched && errors.email && <Err msg={errors.email} />}
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Endereço</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="CEP" className="col-span-1"><Input value={form.cep} onChange={(e) => set('cep', maskCep(e.target.value))} placeholder="00000-000" inputMode="numeric" /></Field>
            <Field label="Logradouro" className="col-span-2 sm:col-span-2"><Input value={form.street} onChange={(e) => set('street', e.target.value)} /></Field>
            <Field label="Número"><Input value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
            <Field label="Complemento" className="col-span-2"><Input value={form.complement} onChange={(e) => set('complement', e.target.value)} /></Field>
            <Field label="Bairro" className="col-span-2"><Input value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label="Cidade" className="col-span-2 sm:col-span-3"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="UF"><Input value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></Field>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Imóvel e observações</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipo de imóvel">
              <Select value={form.propertyType} onChange={(e) => set('propertyType', e.target.value)}>
                <option value="">—</option>
                {['Residencial', 'Comercial', 'Industrial', 'Condomínio', 'Rural', 'Institucional'].map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Área aproximada (m²)"><Input value={form.areaM2} onChange={(e) => set('areaM2', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></Field>
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
      </div>
    </Drawer>
  );
}

function Err({ msg }: { msg: string }) {
  return <span className="mt-1 block text-xs text-danger">{msg}</span>;
}
