/**
 * Portal do Cliente — documentos dos próprios serviços.
 *
 * A visualização abre o documento montado pelo sistema (o mesmo HTML da
 * impressão), sem obrigar o cliente a baixar arquivo para consultar. Só
 * aparecem documentos de OS do próprio cadastro.
 */
import { useMemo, useState } from 'react';
import { Award, FileCheck2, FileText, Receipt } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Field';
import { getServiceType } from '@/application/repository';
import { printServiceOrder } from '@/lib/printOrder';
import type { DocumentOutput } from '@/lib/printDocuments';
import { DocumentActions } from '@/presentation/components/DocumentActions';
import { printCertificate, printLaudo } from '@/lib/printDocuments';
import { fmtDate } from '@/lib/date';
import { formatCurrency } from '@/lib/utils';
import type { ServiceOrder } from '@/domain/types';
import { usePortalData } from './portalData';

type DocKind = 'os' | 'certificado' | 'laudo' | 'recibo';

const DOC_META: Record<DocKind, { label: string; icon: React.ReactNode }> = {
  os: { label: 'Ordem de Serviço', icon: <FileText size={15} /> },
  certificado: { label: 'Certificado', icon: <Award size={15} /> },
  laudo: { label: 'Laudo Técnico', icon: <FileCheck2 size={15} /> },
  recibo: { label: 'Recibo', icon: <Receipt size={15} /> },
};

export function PortalDocumentosPage() {
  const { orders } = usePortalData();
  const [busca, setBusca] = useState('');

  const concluidas = useMemo(
    () => orders.filter((so) => so.status === 'concluida'),
    [orders],
  );

  const filtradas = concluidas.filter((so) => {
    const alvo = `${so.number} ${getServiceType(so.serviceTypeId)?.name ?? ''}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  const abrir = (so: ServiceOrder, kind: DocKind, output: DocumentOutput) => {
    if (kind === 'os' || kind === 'recibo') printServiceOrder(so, output);
    else if (kind === 'certificado') printCertificate(so, output);
    else printLaudo(so, output);
  };

  return (
    <div>
      <PageHeader title="Documentos" description="Ordem de Serviço, Certificado e Laudo dos seus atendimentos" />

      <div className="mb-4 sm:max-w-xs">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número da OS ou serviço…" />
      </div>

      <div className="space-y-3">
        {filtradas.map((so) => (
          <Card key={so.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">OS #{so.number} · {getServiceType(so.serviceTypeId)?.name ?? 'Atendimento'}</p>
                  <p className="text-xs text-muted-foreground">
                    {so.finishedAt ? fmtDate(so.finishedAt) : fmtDate(so.createdAt)}
                    {so.serviceValue != null ? ` · ${formatCurrency(so.serviceValue)}` : ''}
                  </p>
                </div>
                {so.validityDate && <Badge tone={so.validityDate < new Date().toISOString() ? 'danger' : 'success'} dot>Validade {fmtDate(so.validityDate)}</Badge>}
              </div>

              <div className="flex flex-wrap gap-2">
                {(['os', 'certificado', 'laudo'] as DocKind[]).map((kind) => (
                  <DocumentActions key={kind} label={DOC_META[kind].label} icon={DOC_META[kind].icon} onGenerate={(o) => abrir(so, kind, o)} />
                ))}
              </div>
            </CardBody>
          </Card>
        ))}

        {filtradas.length === 0 && (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
              <FileText size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {concluidas.length === 0
                  ? 'Os documentos aparecem aqui assim que um atendimento for concluído.'
                  : 'Nenhum documento encontrado para essa busca.'}
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
