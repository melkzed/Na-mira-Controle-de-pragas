/** Portal do Cliente — visão geral do que importa para o cliente hoje. */
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, FileCheck, TriangleAlert, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { getServiceType, getUser } from '@/application/repository';
import { formatCurrency } from '@/lib/utils';
import { fmtDate, fmtDateLong, fmtTime } from '@/lib/date';
import { paymentTone, past, upcoming, usePortalData } from './portalData';

export function PortalDashboardPage() {
  const { customer, appointments, orders, finance } = usePortalData();
  const proximos = upcoming(appointments);
  const realizados = past(appointments);
  const ultimaOs = orders.find((o) => o.status === 'concluida');
  const pendentes = finance.filter((e) => e.status !== 'pago');
  const totalPendente = pendentes.reduce((s, e) => s + e.amount, 0);
  const vencidos = pendentes.filter((e) => paymentTone(e).tone === 'danger');
  const contrato = customer?.contracts?.[0];
  const validade = ultimaOs?.validityDate;

  const alertas: { texto: string; tone: 'danger' | 'warning' }[] = [];
  if (vencidos.length) alertas.push({ texto: `${vencidos.length} pagamento(s) em atraso`, tone: 'danger' });
  if (contrato?.status === 'vencido') alertas.push({ texto: 'Contrato vencido — fale com a empresa para renovar', tone: 'danger' });
  if (contrato?.status === 'renovacao_pendente') alertas.push({ texto: 'Renovação de contrato pendente', tone: 'warning' });
  if (validade && validade < new Date().toISOString()) alertas.push({ texto: 'Certificado do último serviço vencido', tone: 'warning' });

  return (
    <div>
      <PageHeader title={`Olá, ${(customer?.name ?? '').split(' ')[0] || 'cliente'}`} description="Acompanhe seus atendimentos, documentos e pagamentos" />

      {alertas.length > 0 && (
        <div className="mb-4 space-y-2">
          {alertas.map((a) => (
            <div
              key={a.texto}
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${a.tone === 'danger' ? 'border-danger/30 bg-danger-soft/40 text-danger' : 'border-warning/30 bg-warning-soft/50 text-foreground'}`}
            >
              <TriangleAlert size={16} className="shrink-0" />{a.texto}
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo label="Atendimentos realizados" valor={String(realizados.length)} icon={<CheckCircle2 size={18} />} />
        <Resumo label="Próximo atendimento" valor={proximos[0] ? fmtDate(proximos[0].scheduledStart) : '—'} icon={<CalendarDays size={18} />} />
        <Resumo label="Validade do certificado" valor={validade ? fmtDate(validade) : '—'} icon={<FileCheck size={18} />} />
        <Resumo label="Pagamentos pendentes" valor={pendentes.length ? formatCurrency(totalPendente) : 'Em dia'} icon={<Wallet size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Próximos atendimentos" subtitle={proximos.length ? `${proximos.length} agendado(s)` : 'Nada agendado no momento'} />
          <CardBody className="space-y-2">
            {proximos.slice(0, 4).map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">{getServiceType(a.serviceTypeId)?.name ?? 'Atendimento'}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateLong(a.scheduledStart)} · {fmtTime(a.scheduledStart)}
                  {a.technicianId ? ` · ${getUser(a.technicianId)?.name ?? ''}` : ''}
                </p>
              </div>
            ))}
            {proximos.length === 0 && <p className="text-sm text-muted-foreground">Quando a empresa agendar uma visita, ela aparece aqui.</p>}
            <Link to="/portal/agendamentos" className="inline-block text-xs font-medium text-brand hover:underline">Ver todos os agendamentos</Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Último serviço realizado" subtitle={ultimaOs ? `OS #${ultimaOs.number}` : 'Ainda sem atendimentos concluídos'} />
          <CardBody className="space-y-2">
            {ultimaOs ? (
              <>
                <Linha rotulo="Data" valor={ultimaOs.finishedAt ? fmtDateLong(ultimaOs.finishedAt) : '—'} />
                <Linha rotulo="Serviço" valor={getServiceType(ultimaOs.serviceTypeId)?.name ?? '—'} />
                <Linha rotulo="Técnico" valor={getUser(ultimaOs.technicianIds?.[0] ?? ultimaOs.technicianId)?.name ?? '—'} />
                <Linha rotulo="Validade" valor={ultimaOs.validityDate ? fmtDate(ultimaOs.validityDate) : '—'} />
                <Link to="/portal/documentos" className="inline-block pt-1 text-xs font-medium text-brand hover:underline">Ver documentos deste serviço</Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Assim que o primeiro atendimento for concluído, o resumo aparece aqui.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contrato" subtitle="Situação do seu contrato de serviço" />
          <CardBody className="space-y-2">
            {contrato ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={contrato.status === 'ativo' ? 'success' : contrato.status === 'vencido' ? 'danger' : 'warning'} dot>
                    {contrato.status === 'ativo' ? 'Ativo' : contrato.status === 'vencido' ? 'Vencido' : contrato.status === 'renovacao_pendente' ? 'Renovação pendente' : 'Cancelado'}
                  </Badge>
                </div>
                <Linha rotulo="Início" valor={contrato.startDate ? fmtDate(contrato.startDate) : '—'} />
                <Linha rotulo="Vencimento" valor={contrato.endDate ? fmtDate(contrato.endDate) : '—'} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contrato registrado. Os atendimentos são avulsos.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pagamentos" subtitle={pendentes.length ? `${pendentes.length} em aberto` : 'Nenhuma pendência'} />
          <CardBody className="space-y-2">
            {pendentes.slice(0, 4).map((e) => {
              const st = paymentTone(e);
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{e.description}</p>
                    <p className="text-xs text-muted-foreground">Vence {e.dueDate ? fmtDate(e.dueDate) : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(e.amount)}</p>
                    <Badge tone={st.tone} className="text-[10px]">{st.label}</Badge>
                  </div>
                </div>
              );
            })}
            {pendentes.length === 0 && <p className="text-sm text-muted-foreground">Você está em dia. Obrigado!</p>}
            <Link to="/portal/financeiro" className="inline-block text-xs font-medium text-brand hover:underline">Ver todos os pagamentos</Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Resumo({ label, valor, icon }: { label: string; valor: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</div>
      <p className="text-lg font-bold tracking-tight text-foreground">{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium text-foreground">{valor}</span>
    </div>
  );
}
