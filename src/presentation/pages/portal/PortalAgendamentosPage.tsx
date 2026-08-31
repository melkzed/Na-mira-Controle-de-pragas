/** Portal do Cliente — agendamentos: consulta, confirmação e pedido de remarcação. */
import { useState } from 'react';
import { CalendarCheck, CalendarClock, Check, MapPin, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field, Textarea } from '../../components/ui/Field';
import { AppointmentStatusBadge } from '../../components/StatusBadge';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { serviceOrderForAppointment } from '@/application/repository';
import { useAppStore } from '@/store/appStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { getServiceType, getUser } from '@/application/repository';
import { fmtDateLong, fmtTime } from '@/lib/date';
import type { Appointment } from '@/domain/types';
import { past, upcoming, usePortalData } from './portalData';

export function PortalAgendamentosPage() {
  const { customer, appointments } = usePortalData();
  const setStatus = useAppointmentsStore((s) => s.setStatus);
  const updateAppt = useAppointmentsStore((s) => s.update);
  const addNotification = useAppStore((s) => s.addNotification);
  const updateOs = useServiceOrdersStore((s) => s.update);
  const [remarcar, setRemarcar] = useState<Appointment | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [cancelar, setCancelar] = useState<Appointment | null>(null);
  const [motivo, setMotivo] = useState('');

  const proximos = upcoming(appointments);
  const anteriores = past(appointments).slice(0, 10);

  const confirmar = (a: Appointment) => {
    setStatus(a.id, 'confirmado');
    updateAppt(a.id, { confirmedAt: new Date().toISOString() });
    // O escritório precisa saber: a confirmação libera a visita para a rota.
    addNotification({
      title: 'Agendamento confirmado pelo cliente',
      body: `${customer?.name ?? 'Cliente'} confirmou a visita de ${fmtDateLong(a.scheduledStart)}`,
      tone: 'success',
      entityType: 'appointment',
      entityId: a.id,
    });
    logChange('alteração', 'agendamento', `Cliente ${customer?.name ?? ''} confirmou a visita de ${fmtDateLong(a.scheduledStart)}`, a.id);
    toast('Agendamento confirmado. Obrigado!', { tone: 'success' });
  };

  const pedirRemarcacao = () => {
    if (!remarcar) return;
    const createdAt = new Date().toISOString();
    updateAppt(remarcar.id, { rescheduleRequest: { message: mensagem.trim() || undefined, createdAt } });
    addNotification({
      title: 'Reagendamento solicitado',
      body: `${customer?.name ?? 'Cliente'} pediu para remarcar a visita de ${fmtDateLong(remarcar.scheduledStart)}`,
      tone: 'warning',
      entityType: 'appointment',
      entityId: remarcar.id,
    });
    logChange('alteração', 'agendamento', `Cliente ${customer?.name ?? ''} solicitou reagendamento${mensagem.trim() ? `: ${mensagem.trim()}` : ''}`, remarcar.id);
    toast('Pedido enviado. A empresa entrará em contato para remarcar.', { tone: 'success' });
    setRemarcar(null);
    setMensagem('');
  };

  /** Cancelamento pelo cliente. A visita e a OS vinculada ficam canceladas,
   *  mas registrando que a decisão partiu do cliente — para a empresa isso é
   *  diferente de um cancelamento interno. */
  const cancelarVisita = () => {
    if (!cancelar) return;
    const agora = new Date().toISOString();
    setStatus(cancelar.id, 'cancelado');
    updateAppt(cancelar.id, { notes: motivo.trim() ? `Cancelado pelo cliente: ${motivo.trim()}` : cancelar.notes });
    const os = serviceOrderForAppointment(cancelar.id);
    if (os) {
      updateOs(os.id, {
        status: 'cancelada',
        cancelledBy: 'cliente',
        cancelledAt: agora,
        cancelReason: motivo.trim() || undefined,
      });
    }
    addNotification({
      title: 'Visita cancelada pelo cliente',
      body: `${customer?.name ?? 'Cliente'} cancelou a visita de ${fmtDateLong(cancelar.scheduledStart)}${motivo.trim() ? ` — ${motivo.trim()}` : ''}`,
      tone: 'danger',
      entityType: 'appointment',
      entityId: cancelar.id,
    });
    logChange('cancelamento', 'agendamento', `Cliente ${customer?.name ?? ''} cancelou a visita de ${fmtDateLong(cancelar.scheduledStart)}${motivo.trim() ? `: ${motivo.trim()}` : ''}`, cancelar.id);
    toast('Visita cancelada. A empresa foi avisada.', { tone: 'success' });
    setCancelar(null);
    setMotivo('');
  };

  return (
    <div>
      <PageHeader title="Agendamentos" description="Confirme a visita, peça outra data ou cancele" />

      <div className="space-y-3">
        {proximos.map((a) => (
          <Card key={a.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">{getServiceType(a.serviceTypeId)?.name ?? 'Atendimento'}</p>
                  <p className="text-sm text-muted-foreground">{fmtDateLong(a.scheduledStart)} · {fmtTime(a.scheduledStart)}–{fmtTime(a.scheduledEnd)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AppointmentStatusBadge status={a.status} />
                  {a.confirmedAt && <Badge tone="success" dot>Confirmado</Badge>}
                  {a.rescheduleRequest && <Badge tone="warning" dot>Remarcação solicitada</Badge>}
                </div>
              </div>

              {a.address && (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin size={14} className="mt-0.5 shrink-0" />{a.address}</p>
              )}
              {a.technicianId && (
                <p className="text-sm text-muted-foreground">Técnico responsável: <span className="font-medium text-foreground">{getUser(a.technicianId)?.name ?? '—'}</span></p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  leftIcon={<Check size={15} />}
                  disabled={!!a.confirmedAt}
                  onClick={() => confirmar(a)}
                >
                  {a.confirmedAt ? 'Confirmado' : 'Confirmar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<CalendarClock size={15} />}
                  disabled={!!a.rescheduleRequest}
                  onClick={() => { setRemarcar(a); setMensagem(''); }}
                >
                  {a.rescheduleRequest ? 'Pedido enviado' : 'Pedir outra data'}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-danger"
                leftIcon={<XCircle size={15} />}
                onClick={() => { setCancelar(a); setMotivo(''); }}
              >
                Cancelar visita
              </Button>
            </CardBody>
          </Card>
        ))}

        {proximos.length === 0 && (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarCheck size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma visita agendada no momento.</p>
            </CardBody>
          </Card>
        )}
      </div>

      {anteriores.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Visitas anteriores</p>
          <div className="space-y-2">
            {anteriores.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{getServiceType(a.serviceTypeId)?.name ?? 'Atendimento'}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateLong(a.scheduledStart)}</p>
                </div>
                <AppointmentStatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={!!cancelar}
        onClose={() => setCancelar(null)}
        title="Cancelar visita"
        subtitle={cancelar ? fmtDateLong(cancelar.scheduledStart) : undefined}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCancelar(null)}>Voltar</Button>
            <Button variant="danger" leftIcon={<XCircle size={15} />} onClick={cancelarVisita}>Confirmar cancelamento</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-sm text-foreground">
            A visita será cancelada e a empresa avisada na hora. Para remarcar em vez de cancelar,
            volte e use <span className="font-medium">Pedir outra data</span>.
          </p>
          <Field label="Motivo (opcional)">
            <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: o estabelecimento estará fechado nesse dia." />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={!!remarcar}
        onClose={() => setRemarcar(null)}
        title="Pedir outra data"
        subtitle={remarcar ? fmtDateLong(remarcar.scheduledStart) : undefined}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRemarcar(null)}>Cancelar</Button>
            <Button leftIcon={<Check size={15} />} onClick={pedirRemarcacao}>Enviar pedido</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A empresa recebe o seu pedido e entra em contato para combinar a nova data.
            O agendamento atual continua valendo até isso acontecer.
          </p>
          <Field label="Quando ficaria melhor para você?">
            <Textarea rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: prefiro na parte da manhã, a partir do dia 12." />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
