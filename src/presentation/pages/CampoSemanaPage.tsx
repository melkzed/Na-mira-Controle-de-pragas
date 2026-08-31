import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Clock, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardBody } from '../components/ui/Card';
import { AppointmentStatusBadge } from '../components/StatusBadge';
import { Drawer } from '../components/ui/Drawer';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { Segmented } from '../components/ui/Segmented';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { releasedAppointmentsForTechnicianRange, getCustomer, getServiceType, serviceOrderForAppointment } from '@/application/repository';
import type { Appointment } from '@/domain/types';
import {
  addMonths, addWeeks, fmtDateLong, fmtTime, monthDays, monthRangeLabel,
  weekDays, weekRangeLabel, isSameDay, isToday, parseISO,
} from '@/lib/date';
import { cn } from '@/lib/utils';

/**
 * Calendário do App do Técnico — as visitas dele por período.
 *
 * O técnico precisa enxergar não só o dia, mas a semana e o mês: é assim que
 * ele se organiza (folga, deslocamento, produto que precisa pedir antes).
 * Cada visita mostra a Ordem de Serviço vinculada, que é o que ele de fato
 * vai executar.
 */
export function CampoSemanaPage() {
  const { techId } = useFieldTech();
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('semana');
  /** Âncora do período exibido — muda ao navegar para trás/frente. */
  const [ref, setRef] = useState(new Date());

  const days = useMemo(() => (periodo === 'semana' ? weekDays(ref) : monthDays(ref)), [periodo, ref]);
  const appts = useMemo(() => {
    if (days.length === 0) return [];
    const inicio = new Date(days[0]);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(days[days.length - 1]);
    fim.setHours(23, 59, 59, 999);
    return releasedAppointmentsForTechnicianRange(techId, inicio.toISOString(), fim.toISOString());
  }, [techId, days]);
  const [detail, setDetail] = useState<Appointment | null>(null);

  const navegar = (n: number) => setRef((d) => (periodo === 'semana' ? addWeeks(d, n) : addMonths(d, n)));
  const rotulo = periodo === 'semana' ? weekRangeLabel(ref) : monthRangeLabel(ref);
  // No mês, dia sem visita vira ruído: 30 linhas de "Sem visitas" escondem as
  // poucas que importam. Na semana o vazio ajuda a ver o dia livre.
  const diasExibidos = periodo === 'semana'
    ? days
    : days.filter((d) => appts.some((a) => isSameDay(parseISO(a.scheduledStart), d)));

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-3 flex items-center gap-2">
        <CalendarRange size={20} className="text-brand" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Meus agendamentos</h1>
          <p className="truncate text-xs capitalize text-muted-foreground">{rotulo} · {appts.length} visita(s)</p>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <Segmented
          value={periodo}
          onChange={(v) => { setPeriodo(v as 'semana' | 'mes'); setRef(new Date()); }}
          options={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navegar(-1)} aria-label="Período anterior"><ChevronLeft size={15} /></Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setRef(new Date())}>Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => navegar(1)} aria-label="Próximo período"><ChevronRight size={15} /></Button>
        </div>
      </div>

      <div className="space-y-4">
        {diasExibidos.length === 0 && (
          <Card><CardBody className="py-10 text-center text-sm text-muted-foreground">Nenhuma visita neste período.</CardBody></Card>
        )}
        {diasExibidos.map((day) => {
          const dayAppts = appts.filter((a) => isSameDay(parseISO(a.scheduledStart), day));
          return (
            <div key={day.toISOString()}>
              <p className={cn('mb-2 px-1 text-sm font-semibold capitalize', isToday(day) ? 'text-brand' : 'text-foreground')}>
                {fmtDateLong(day.toISOString())}{isToday(day) ? ' · hoje' : ''}
              </p>
              {dayAppts.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sem visitas.</p>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map((a) => {
                    const cust = getCustomer(a.customerId);
                    const st = getServiceType(a.serviceTypeId);
                    const os = serviceOrderForAppointment(a.id);
                    return (
                      <motion.button
                        key={a.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setDetail(a)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{cust?.name}</p>
                          <p className="truncate text-xs text-muted-foreground"><Clock size={11} className="mr-1 inline" />{fmtTime(a.scheduledStart)} · {st?.name}</p>
                          {os && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ClipboardList size={11} /> OS #{os.number}
                            </p>
                          )}
                        </div>
                        <AppointmentStatusBadge status={a.status} />
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? getCustomer(detail.customerId)?.name : ''} subtitle={detail ? `${getServiceType(detail.serviceTypeId)?.name ?? ''} · ${fmtTime(detail.scheduledStart)}` : ''}>
        {detail && (
          <div className="space-y-4">
            <AppointmentStatusBadge status={detail.status} />
            <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
              <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
              <span className="text-foreground">{detail.address ?? '—'}</span>
            </div>
            {(() => {
              const os = serviceOrderForAppointment(detail.id);
              if (!os) return null;
              return (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    <ClipboardList size={13} /> Ordem de serviço
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">OS #{os.number}</span>
                    <Badge tone="neutral">{getServiceType(os.serviceTypeId)?.name ?? '—'}</Badge>
                  </div>
                  {os.areaTreated && <p className="mt-1 text-xs text-muted-foreground">Áreas: {os.areaTreated}</p>}
                  {os.procedures && <p className="mt-1 text-xs text-muted-foreground">{os.procedures}</p>}
                </div>
              );
            })()}
            {detail.notes && (
              <Card><CardBody><p className="text-sm text-foreground">{detail.notes}</p></CardBody></Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
