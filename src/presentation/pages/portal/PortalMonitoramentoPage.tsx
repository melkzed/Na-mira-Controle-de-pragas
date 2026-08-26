/** Portal do Cliente — armadilhas instaladas e histórico de monitoramento. */
import { Radar } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { fmtDate } from '@/lib/date';
import { usePortalData } from './portalData';

const ACAO_LABEL: Record<string, string> = {
  nenhuma: 'Sem alteração', substituida: 'Substituída', retirada: 'Retirada',
  reinstalada: 'Reinstalada', extraviada: 'Extraviada',
};

export function PortalMonitoramentoPage() {
  const { traps, inspections } = usePortalData();

  const ultimaDe = (trapId: string) => inspections.find((i) => i.trapId === trapId);
  const comConsumo = inspections.filter((i) => i.consumed).length;

  return (
    <div>
      <PageHeader title="Monitoramento" description={`${traps.length} armadilha(s) instalada(s) no seu estabelecimento`} />

      {traps.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
            <Radar size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Você não tem armadilhas de monitoramento instaladas.</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Armadilhas" valor={String(traps.length)} />
            <Mini label="Monitoramentos" valor={String(inspections.length)} />
            <Mini label="Com ocorrência" valor={String(comConsumo)} destaque={comConsumo > 0} />
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Armadilhas</p>
          <div className="mb-6 space-y-2">
            {traps.map((t) => {
              const ultima = ultimaDe(t.id);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Radar size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{t.code}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.type}{t.location ? ` · ${t.location}` : ''}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ultima ? `Último monitoramento em ${fmtDate(ultima.date)}` : 'Ainda sem monitoramento registrado'}
                    </p>
                  </div>
                  <Badge tone={t.status === 'ativa' ? 'success' : 'neutral'} dot>{t.status === 'ativa' ? 'Ativa' : t.status}</Badge>
                  {ultima?.consumed && <Badge tone="warning">Ocorrência</Badge>}
                </div>
              );
            })}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Histórico de monitoramentos</p>
          <div className="space-y-2">
            {inspections.slice(0, 30).map((i) => {
              const trap = traps.find((t) => t.id === i.trapId);
              return (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{trap?.code ?? 'Armadilha'}{trap?.location ? ` · ${trap.location}` : ''}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(i.date)}{i.action ? ` · ${ACAO_LABEL[i.action] ?? i.action}` : ''}
                    </p>
                    {i.notes && <p className="mt-0.5 text-xs text-muted-foreground">{i.notes}</p>}
                  </div>
                  <Badge tone={i.consumed ? 'warning' : 'success'} dot>{i.consumed ? 'Com ocorrência' : 'Sem ocorrência'}</Badge>
                </div>
              );
            })}
            {inspections.length === 0 && <p className="text-sm text-muted-foreground">Nenhum monitoramento registrado ainda.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-soft ${destaque ? 'border-warning/40 bg-warning-soft/40' : 'border-border bg-surface'}`}>
      <p className="text-lg font-bold text-foreground">{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
