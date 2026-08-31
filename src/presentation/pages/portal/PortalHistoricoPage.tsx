/** Portal do Cliente — histórico dos atendimentos realizados. */
import { FileText, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ServiceOrderStatusBadge } from '../../components/StatusBadge';
import { getServiceType, getUser } from '@/application/repository';
import { printServiceOrder } from '@/lib/printOrder';
import { printCertificate, printLaudo } from '@/lib/printDocuments';
import { fmtDate, fmtTime } from '@/lib/date';
import { usePortalData } from './portalData';

export function PortalHistoricoPage() {
  const { orders } = usePortalData();

  return (
    <div>
      <PageHeader title="Histórico de serviços" description={`${orders.length} atendimento(s) registrados`} />

      <div className="space-y-3">
        {orders.map((so) => {
          const tecnico = getUser(so.technicianIds?.[0] ?? so.technicianId)?.name;
          const concluida = so.status === 'concluida';
          return (
            <Card key={so.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{getServiceType(so.serviceTypeId)?.name ?? 'Atendimento'}</p>
                    <p className="text-sm text-muted-foreground">
                      OS #{so.number} · {so.finishedAt ? fmtDate(so.finishedAt) : fmtDate(so.createdAt)}
                      {so.startedAt && so.finishedAt ? ` · ${fmtTime(so.startedAt)}–${fmtTime(so.finishedAt)}` : ''}
                    </p>
                  </div>
                  <ServiceOrderStatusBadge status={so.status} cancelledBy={so.cancelledBy} />
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {tecnico && <span>Técnico: <span className="font-medium text-foreground">{tecnico}</span></span>}
                  {so.validityDate && <span>Validade: <span className="font-medium text-foreground">{fmtDate(so.validityDate)}</span></span>}
                </div>

                {so.areaTreated && <p className="text-sm text-foreground"><span className="text-muted-foreground">Áreas tratadas: </span>{so.areaTreated}</p>}

                {concluida ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} onClick={() => printServiceOrder(so)}>Ordem de Serviço</Button>
                    <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} onClick={() => printCertificate(so)}>Certificado</Button>
                    <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} onClick={() => printLaudo(so)}>Laudo</Button>
                  </div>
                ) : (
                  <Badge tone="neutral">Documentos disponíveis quando o atendimento for concluído</Badge>
                )}
              </CardBody>
            </Card>
          );
        })}

        {orders.length === 0 && (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
              <History size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum atendimento registrado ainda.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
