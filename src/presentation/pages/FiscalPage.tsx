import { useEffect, useState } from 'react';
import { Check, FileText, Plus, ShieldCheck, Trash2 } from 'lucide-react';
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
import { uid } from '@/store/createEntityStore';
import { toast } from '@/store/toastStore';
import { downloadNfseXml, printNfse } from '@/lib/printInvoice';
import { Download, FileCode } from 'lucide-react';
import type { Invoice, License } from '@/domain/types';
import { daysUntil, formatCurrency } from '@/lib/utils';
import { fmtDate } from '@/lib/date';

export function FiscalPage() {
  const { items: licenses, add, remove } = useLicensesStore();
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
            <Row label="Razão social" value={seed.orgProfile.legalName} />
            <Row label="CNPJ" value={seed.orgProfile.cnpj} />
            <Row label="Regime tributário" value={seed.orgProfile.taxRegime} />
            <Row label="Município" value={`${seed.orgProfile.city}/${seed.orgProfile.state}`} />
            <Row label="Código de serviço (NFS-e)" value="14.02 – Dedetização" />
            <Row label="Alíquota ISS" value="3,0%" />
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
    const status = expiresAt && new Date(expiresAt).getTime() < Date.now() ? 'vencida' : 'ativa';
    onSave({
      id: uid('lic'), orgId: 'org-namira', name: name.trim(), issuer: issuer.trim() || undefined, number: number.trim() || undefined,
      responsibleId: responsibleId || undefined, issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined, status,
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

function NotasFiscais() {
  const invoices = useInvoicesStore((s) => s.invoices);
  const columns: Column<Invoice>[] = [
    { key: 'num', header: 'Nota', render: (i) => <span className="font-semibold">#{i.number} <span className="text-xs text-muted-foreground">{i.series}</span></span> },
    { key: 'cust', header: 'Tomador', render: (i) => getCustomer(i.customerId ?? '')?.name ?? i.description },
    { key: 'date', header: 'Emissão', render: (i) => fmtDate(i.issuedAt) },
    { key: 'iss', header: 'ISS', align: 'right', render: (i) => formatCurrency(i.taxAmount) },
    { key: 'amount', header: 'Valor', align: 'right', render: (i) => <span className="font-semibold">{formatCurrency(i.amount)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (i) => <Badge tone={i.status === 'emitida' ? 'success' : 'danger'} dot>{i.status === 'emitida' ? 'Emitida' : 'Cancelada'}</Badge> },
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
