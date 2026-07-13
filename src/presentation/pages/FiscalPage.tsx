import { FileText, Plus, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getUser } from '@/application/repository';
import type { License } from '@/domain/types';
import { daysUntil } from '@/lib/utils';
import { fmtDate } from '@/lib/date';

export function FiscalPage() {
  const columns: Column<License>[] = [
    { key: 'name', header: 'Documento', render: (l) => (
      <div><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.issuer} · nº {l.number}</p></div>
    ) },
    { key: 'resp', header: 'Responsável', render: (l) => getUser(l.responsibleId)?.name ?? '—' },
    { key: 'issued', header: 'Emissão', render: (l) => l.issuedAt ? fmtDate(l.issuedAt) : '—' },
    { key: 'exp', header: 'Vencimento', render: (l) => l.expiresAt ? fmtDate(l.expiresAt) : '—' },
    { key: 'status', header: 'Situação', align: 'right', render: (l) => {
      const d = daysUntil(l.expiresAt) ?? 999;
      if (d < 0) return <Badge tone="danger" dot>Vencida</Badge>;
      if (d <= 30) return <Badge tone="warning" dot>Vence em {d}d</Badge>;
      return <Badge tone="success" dot>Ativa</Badge>;
    } },
  ];

  return (
    <div>
      <PageHeader
        title="Fiscal & Conformidade"
        description="Licenças, alvarás, tributação e documentos regulatórios"
        actions={<Button leftIcon={<Plus size={16} />}>Nova licença</Button>}
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
        <h2 className="mb-3 text-sm font-semibold text-foreground">Licenças, alvarás e responsáveis técnicos</h2>
        <Table columns={columns} rows={seed.licenses} keyField={(l) => l.id} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{value}</span></div>;
}
function MiniBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-3 text-center"><p className="text-lg font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
