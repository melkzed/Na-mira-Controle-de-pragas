import { useMemo, useState } from 'react';
import { CalendarRange, Clock, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardBody } from '../components/ui/Card';
import { AppointmentStatusBadge } from '../components/StatusBadge';
import { Drawer } from '../components/ui/Drawer';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { releasedAppointmentsForTechnicianRange, getCustomer, getServiceType } from '@/application/repository';
import type { Appointment } from '@/domain/types';
import { fmtDateLong, fmtTime, weekDays, weekRangeLabel, isSameDay, isToday, parseISO } from '@/lib/date';
import { cn } from '@/lib/utils';

/** "Agendamentos da Semana" — visão consolidada das visitas de segunda a domingo. */
export function CampoSemanaPage() {
  const { techId } = useFieldTech();
  const today = new Date();
  const days = weekDays(today);
  const appts = useMemo(
    () => releasedAppointmentsForTechnicianRange(techId, days[0].toISOString(), days[6].toISOString()),
    [techId, days],
  );
  const [detail, setDetail] = useState<Appointment | null>(null);

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-4 flex items-center gap-2">
        <CalendarRange size={20} className="text-brand" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Agendamentos da Semana</h1>
          <p className="text-xs text-muted-foreground">{weekRangeLabel(today)}</p>
        </div>
      </div>

      <div className="space-y-4">
        {days.map((day) => {
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
            {detail.notes && (
              <Card><CardBody><p className="text-sm text-foreground">{detail.notes}</p></CardBody></Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
