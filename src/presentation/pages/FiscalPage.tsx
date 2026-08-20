import { useEffect, useState } from 'react';
import { Check, FileText, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getUser } from '@/application/repository';
import { useInvoicesStore } from '@/store/invoicesStore';
import { useLicensesStore } from '@/store/entityStores';
import { useSettingsStore } from '@/store/settingsStore';
import { useOrgProfileStore } from '@/store/orgProfileStore';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { downloadNfseXml, printNfse } from '@/lib/printInvoice';
import { Download, FileCode } from 'lucide-react';
import type { Invoice, License } from '@/domain/types';
import { daysUntil, formatCurrency } from '@/lib/utils';
import { dateInputToIso, fmtDate } from '@/lib/date';

export function FiscalPage() {
  const { items: licenses, add, remove } = useLicensesStore();
  const org = useOrgProfileStore((s) => s.profile);
  const fiscal = useSettingsStore((s) => s.fiscal);
  const [formOpen, setFormOpen] = useState(false);

  const columns: Column<License>[] = [
    { key: 'name', header: 'Documento', render: (l) => (
      <div><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.issuer} · nº {l.number}</p></div>
    ) },
    { key: 'resp', header: 'Responsável', render: (l) => getUser(l.responsibleId)?.name ?? '—' },
    { key: 'issued', header: 'Emissão', render: (l) => l.issuedAt ? fmtDate(l.issuedAt) : '—' },
    { key: 'exp', header: 'Vencimento', render: (l) => l.expiresAt ? fmtDate(l.expiresAt) : '—' },
    { key: 'status', header: 'Situação', render: (l) => {
      const d = daysUntil(l.expiresAt) ?? 999;
      if (d < 0) return <Badge tone="danger" dot>Vencida</Badge>;
      if (d <= 30) return <Badge tone="warning" dot>Vence em {d}d</Badge>;
      return <Badge tone="success" dot>Ativa</Badge>;
    } },
    { key: 'act', header: '', align: 'right', render: (l) => (
      <button onClick={(ev) => { ev.stopPropagation(); remove(l.id); toast('Licença removida.', { tone: 'danger', action: { label: 'Desfazer', onClick: () => add(l) } }); }} aria-label={`Excluir ${l.name}`} className="text-muted-foreground hover:text-danger"><Trash2 size={15} /></button>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="Fiscal & Conformidade"
        description="Licenças, alvarás, tributação e documentos regulatórios"
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova licença</Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Dados fiscais" subtitle="Cadastro da empresa" action={<ShieldCheck size={18} className="text-brand" />} />
          <CardBody className="space-y-2.5 text-sm">
            <Row label="Razão social" value={org.legalName} />
            <Row label="CNPJ" value={org.cnpj} />
            <Row label="Regime tributário" value={org.taxRegime} />
            <Row label="Município" value={`${org.city}/${org.state}`} />
            <Row label="Item lista de serviços (LC 116)" value={fiscal.itemListaServico} />
            {fiscal.codigoTributarioMunicipal && <Row label="Código tributário municipal" value={fiscal.codigoTributarioMunicipal} />}
            <Row label="Alíquota ISS" value={`${(fiscal.issRate * 100).toFixed(1)}%`} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Nota Fiscal de Serviço" subtitle="Estrutura preparada para integração com a prefeitura" action={<FileText size={18} className="text-muted-foreground" />} />
          <CardBody>
            <div className="rounded-xl border border-dashed border-border p-5 text-center">
              <p className="text-sm text-foreground">Emissão de NFS-e integrada por Ordem de Serviço</p>
              <p className="mt-1 text-xs text-muted-foreground">O sistema calcula tributos, gera a base de cálculo e mantém histórico. Conecte o provedor municipal para emissão automática.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" size="sm">Configurar integração</Button>
                <Button size="sm">Simular emissão</Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniBox label="Notas no mês" value="18" />
              <MiniBox label="Valor faturado" value="R$ 41,1k" />
              <MiniBox label="ISS recolhido" value="R$ 1,23k" />
            </div>
          </CardBody>
        </Card>
      </div>

      <FiscalConfigPanel />

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Notas Fiscais de Serviço (NFS-e)</h2>
        <NotasFiscais />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Licenças, alvarás e responsáveis técnicos</h2>
        <p className="mb-2 text-xs text-muted-foreground">As licenças ativas aparecem automaticamente na OS, no certificado e no laudo.</p>
        <Table columns={columns} rows={licenses} keyField={(l) => l.id} />
      </div>

      <LicenseForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(l) => { add(l); setFormOpen(false); toast('Licença cadastrada.', { tone: 'success' }); }} />
    </div>
  );
}

function LicenseForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (l: License) => void }) {
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [number, setNumber] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setIssuer(''); setNumber(''); setResponsibleId(''); setIssuedAt(''); setExpiresAt(''); setTouched(false); }
  }, [open]);

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    const status = expiresAt && dateInputToIso(expiresAt) < new Date().toISOString() ? 'vencida' : 'ativa';
    onSave({
      id: uid('lic'), orgId: currentOrgId(), name: name.trim(), issuer: issuer.trim() || undefined, number: number.trim() || undefined,
      responsibleId: responsibleId || undefined, issuedAt: issuedAt ? dateInputToIso(issuedAt) : undefined,
      expiresAt: expiresAt ? dateInputToIso(expiresAt) : undefined, status,
    });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova licença" subtitle="Licença, alvará ou registro regulatório"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!name.trim()}>Cadastrar</Button></div>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento" required className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Alvará Sanitário" />{touched && !name.trim() && <span className="mt-1 block text-xs text-danger">Informe o documento.</span>}</Field>
        <Field label="Órgão emissor"><Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Vigilância Sanitária" /></Field>
        <Field label="Número"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="VS-2025-0001" /></Field>
        <Field label="Responsável técnico" className="col-span-2"><Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}><option value="">—</option>{seed.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Emissão"><Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        <Field label="Validade"><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
      </div>
    </Drawer>
  );
}

/** Configuração da emissão de NFS-e (provedor governo + tributação). */
const PROVIDER_INFO = {
  'governo-nacional': {
    title: 'Integração NFS-e (Governo · Nacional)',
    subtitle: 'Emissão pela API oficial da Receita Federal via backend + certificado e-CNPJ',
    active: 'Governo ativo',
    simMode: 'Governo · simulação',
    functionPath: 'supabase/functions/emitir-nfse/',
    notice: (
      <>A emissão oficial exige um <strong>certificado digital e-CNPJ (A1/A3)</strong> e um <strong>backend</strong> que assina e transmite ao governo — o navegador não pode fazer isso sozinho.</>
    ),
  },
  focusnfe: {
    title: 'Integração NFS-e (Focus NFe)',
    subtitle: 'Emissão via API da Focus NFe através de backend + token — sem certificado próprio',
    active: 'Focus NFe ativo',
    simMode: 'Focus NFe · simulação',
    functionPath: 'supabase/functions/emitir-nfse-focus/',
    notice: (
      <>A Focus NFe cuida da assinatura e da transmissão à prefeitura por você — só é preciso um <strong>backend</strong> que guarde o <strong>token da conta Focus NFe</strong> (nunca no navegador, ele dá acesso total à emissão).</>
    ),
  },
  simulado: {
    title: 'Integração NFS-e',
    subtitle: 'Sem provedor configurado — nenhuma nota é transmitida',
    active: 'Simulação',
    simMode: 'Simulação',
    functionPath: null,
    notice: <>Nenhum provedor selecionado — o sistema calcula os tributos e mostra o que seria enviado, mas não transmite nada.</>,
  },
} as const;

function FiscalConfigPanel() {
  const { fiscal, setFiscal } = useSettingsStore();
  const info = PROVIDER_INFO[fiscal.provider];
  const needsBackend = fiscal.provider !== 'simulado';
  return (
    <Card className="mt-6">
      <CardHeader
        title={info.title}
        subtitle={info.subtitle}
        action={<Badge tone={needsBackend && fiscal.backendUrl ? 'success' : 'warning'} dot>{needsBackend ? (fiscal.backendUrl ? info.active : info.simMode) : info.simMode}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-xs text-foreground">
          {info.notice}{' '}
          {needsBackend && <>Informe a URL da função de emissão abaixo; sem ela, o sistema opera em <strong>simulação</strong> mostrando exatamente o que seria enviado.</>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Provedor">
            <Select value={fiscal.provider} onChange={(e) => setFiscal({ provider: e.target.value as 'governo-nacional' | 'focusnfe' | 'simulado' })}>
              <option value="governo-nacional">Governo · NFS-e Nacional</option>
              <option value="focusnfe">Focus NFe</option>
              <option value="simulado">Simulação (sem transmissão)</option>
            </Select>
          </Field>
          {needsBackend && (
            <Field label="URL do backend de emissão"><Input value={fiscal.backendUrl} onChange={(e) => setFiscal({ backendUrl: e.target.value })} placeholder={`https://…/functions/v1/${info.functionPath?.split('/')[2] ?? 'emitir-nfse'}`} /></Field>
          )}
          {needsBackend && (
            <Field label="Ambiente">
              <Select value={fiscal.environment} onChange={(e) => setFiscal({ environment: e.target.value as 'homologacao' | 'producao' })}>
                <option value="homologacao">Homologação (teste, sem validade fiscal)</option>
                <option value="producao">Produção</option>
              </Select>
            </Field>
          )}
          <Field label="Município (código IBGE)"><Input value={fiscal.municipioIbge} onChange={(e) => setFiscal({ municipioIbge: e.target.value.replace(/\D/g, '') })} placeholder="3550308" /></Field>
          <Field label="Item lista de serviços (LC 116)" hint="Padrão nacional — ex.: 7.13 ou 14.02, conforme a atividade"><Input value={fiscal.itemListaServico} onChange={(e) => setFiscal({ itemListaServico: e.target.value })} placeholder="14.02" /></Field>
          {fiscal.provider === 'focusnfe' && (
            <Field label="Código tributário do município (opcional)" hint="Só se o município exigir código próprio além do LC 116 — não presuma que são o mesmo número"><Input value={fiscal.codigoTributarioMunicipal} onChange={(e) => setFiscal({ codigoTributarioMunicipal: e.target.value })} placeholder="Ex.: 1491 (deixe em branco se não souber)" /></Field>
          )}
          <Field label="Regime tributário"><Select value={fiscal.regime} onChange={(e) => setFiscal({ regime: e.target.value as any })}><option value="simples">Simples Nacional</option><option value="presumido">Lucro Presumido</option><option value="real">Lucro Real</option></Select></Field>
          <Field label="Alíquota de ISS (%)"><Input type="number" step="0.1" value={(fiscal.issRate * 100).toString()} onChange={(e) => setFiscal({ issRate: (Number(e.target.value) || 0) / 100 })} /></Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={fiscal.issRetido} onChange={(e) => setFiscal({ issRetido: e.target.checked })} className="h-4 w-4 rounded border-border" /> ISS retido pelo tomador</label>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={fiscal.retencoes} onChange={(e) => setFiscal({ retencoes: e.target.checked })} className="h-4 w-4 rounded border-border" /> Reter tributos federais (tomador PJ)</label>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={fiscal.inssRetido} onChange={(e) => setFiscal({ inssRetido: e.target.checked })} className="h-4 w-4 rounded border-border" /> Reter INSS (11%)</label>
        </div>
        {info.functionPath && <p className="text-xs text-muted-foreground">Template do backend incluído no repositório em <code>{info.functionPath}</code>. As alíquotas variam por município e CNAE — confirme com sua contabilidade.</p>}

        <div className="border-t border-border pt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Tipos de tributo</p>
          <p className="mb-3 text-xs text-muted-foreground">Alimentam o campo "Tributo" ao lançar uma despesa no Financeiro.</p>
          <TaxKindsEditor />
        </div>
      </CardBody>
    </Card>
  );
}

/** Cadastro dos tipos de tributo usados nas despesas (Financeiro). */
function TaxKindsEditor() {
  const taxKinds = useSettingsStore((s) => s.fiscal.taxKinds);
  const setFiscal = useSettingsStore((s) => s.setFiscal);
  const [novo, setNovo] = useState('');

  const add = () => {
    const v = novo.trim();
    if (!v || taxKinds.some((k) => k.toLowerCase() === v.toLowerCase())) { setNovo(''); return; }
    setFiscal({ taxKinds: [...taxKinds, v] });
    setNovo('');
  };
  const remove = (k: string) => setFiscal({ taxKinds: taxKinds.filter((x) => x !== k) });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {taxKinds.length === 0 && <span className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</span>}
        {taxKinds.map((k) => (
          <span key={k} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
            {k}
            <button type="button" onClick={() => remove(k)} aria-label={`Remover ${k}`} className="text-muted-foreground hover:text-danger">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Ex.: ISS, IPVA, Taxa de licença…"
          className="max-w-xs"
        />
        <Button type="button" size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={add} disabled={!novo.trim()}>Adicionar</Button>
      </div>
    </div>
  );
}

function NotasFiscais() {
  const invoices = useInvoicesStore((s) => s.invoices);
  const columns: Column<Invoice>[] = [
    { key: 'num', header: 'Nota', render: (i) => <span className="font-semibold">#{i.number} <span className="text-xs text-muted-foreground">{i.series}</span></span> },
    { key: 'cust', header: 'Tomador', render: (i) => getCustomer(i.customerId ?? '')?.name ?? i.description },
    { key: 'date', header: 'Emissão', render: (i) => fmtDate(i.issuedAt) },
    { key: 'iss', header: 'ISS', align: 'right', render: (i) => formatCurrency(i.taxAmount) },
    { key: 'amount', header: 'Valor', align: 'right', render: (i) => <span className="font-semibold">{formatCurrency(i.amount)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (i) => {
      const map = {
        emitida: { tone: 'success', label: 'Emitida' },
        processando: { tone: 'warning', label: 'Processando' },
        rejeitada: { tone: 'danger', label: 'Rejeitada' },
        cancelada: { tone: 'neutral', label: 'Cancelada' },
      } as const;
      const s = map[i.status];
      return <Badge tone={s.tone} dot>{s.label}</Badge>;
    } },
    { key: 'act', header: '', align: 'right', render: (i) => {
      const c = getCustomer(i.customerId ?? '');
      return (
        <div className="flex justify-end gap-1">
          <button onClick={() => printNfse(i, c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="PDF"><Download size={15} /></button>
          <button onClick={() => downloadNfseXml(i, c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="XML"><FileCode size={15} /></button>
        </div>
      );
    } },
  ];
  return <Table columns={columns} rows={invoices} keyField={(i) => i.id} empty="Nenhuma nota emitida. Emita a partir de uma Ordem de Serviço concluída." />;
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{value}</span></div>;
}
function MiniBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-3 text-center"><p className="text-lg font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
