import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Lock, MapPin, Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { AppointmentStatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Field';
import { AppointmentForm } from '../components/AppointmentForm';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getServiceType, getUser } from '@/application/repository';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { logChange } from '@/store/auditStore';
import { useMessagesStore } from '@/store/messagesStore';
import { buildWhatsMessage, WHATS_TYPE_LABEL } from '@/lib/whatsapp';
import { MessageCircle } from 'lucide-react';
import { APPOINTMENT_STATUS_META, type AppointmentStatus } from '@/domain/enums';
import type { Appointment, Customer } from '@/domain/types';
import { addDays, fmtTime, isSameDay, isToday, parseISO, weekDays, weekRangeLabel } from '@/lib/date';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type View = 'dia' | 'semana' | 'mes' | 'agenda' | 'mapa';
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 07h–18h
/** Altura de cada faixa de 1 hora (px). A grade da célula e a posição dos cards
 *  usam o mesmo valor — assim o card nunca vaza para outro dia/horário. */
const ROW_H = 76;
const GRID_H = HOURS.length * ROW_H;

export function AgendaPage() {
  const [view, setView] = useState<View>('semana');
  const [ref, setRef] = useState(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [techFilter, setTechFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [formOpen, setFormOpen] = useState(false);

  const allAppointments = useAppointmentsStore((s) => s.appointments);
  const appts = useMemo(
    () => allAppointments.filter(
      (a) => (techFilter === 'todos' || a.technicianId === techFilter) &&
             (statusFilter === 'todos' || a.status === statusFilter),
    ),
    [allAppointments, techFilter, statusFilter],
  );
  const awaitingCount = allAppointments.filter((a) => a.status === 'agendado').length;
  const selected = allAppointments.find((a) => a.id === selectedId) ?? null;
  const setSelected = (a: Appointment | null) => setSelectedId(a?.id ?? null);

  const move = (dir: number) => {
    const days = view === 'mes' ? 30 : view === 'dia' || view === 'agenda' ? 1 : 7;
    setRef((r) => addDays(r, dir * days));
  };

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Módulo central de agendamento e gestão de equipes em campo"
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo agendamento</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Período anterior"><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setRef(new Date())}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="Próximo período"><ChevronRight size={16} /></Button>
          <span className="ml-2 text-sm font-semibold capitalize text-foreground">
            {view === 'semana' ? weekRangeLabel(ref) : format(ref, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
          >
            <option value="todos">Todos os status</option>
            <option value="agendado">Aguardando confirmação</option>
            <option value="confirmado">Confirmadas</option>
            <option value="reagendado">Reagendadas</option>
            <option value="cancelado">Canceladas</option>
          </select>
          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
          >
            <option value="todos">Todos os técnicos</option>
            {seed.technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Segmented
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: 'dia', label: 'Dia' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
              { value: 'agenda', label: 'Agenda' },
              { value: 'mapa', label: 'Mapa' },
            ]}
          />
        </div>
      </div>

      {awaitingCount > 0 && statusFilter !== 'agendado' && (
        <button
          onClick={() => setStatusFilter('agendado')}
          className="mb-4 flex w-full items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/60 px-4 py-2.5 text-left text-sm text-foreground transition hover:brightness-105"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning text-white text-xs font-bold">{awaitingCount}</span>
          <span className="flex-1"><b>{awaitingCount} visita(s)</b> aguardando confirmação do cliente.</span>
          <span className="text-xs font-medium text-warning">Ver →</span>
        </button>
      )}

      {view === 'semana' && <WeekView refDate={ref} appts={appts} onSelect={setSelected} />}
      {view === 'dia' && <DayView refDate={ref} appts={appts} onSelect={setSelected} />}
      {view === 'mes' && <MonthView refDate={ref} appts={appts} onSelect={setSelected} />}
      {view === 'agenda' && <AgendaListView appts={appts} onSelect={setSelected} />}
      {view === 'mapa' && <MapView appts={appts} onSelect={setSelected} />}

      <AppointmentDrawer appt={selected} onClose={() => setSelected(null)} />
      <AppointmentForm
        open={formOpen}
        defaultDate={view === 'dia' ? ref : undefined}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
    </div>
  );
}

/**
 * Empacota os atendimentos de um dia em colunas: eventos que se sobrepõem no
 * tempo ficam lado a lado (não empilham nem vazam para fora da célula).
 */
function packDay(dayAppts: Appointment[]): { a: Appointment; col: number; cols: number }[] {
  const items = dayAppts
    .map((a) => {
      const s = parseISO(a.scheduledStart);
      const start = s.getHours() * 60 + s.getMinutes();
      return { a, start, end: start + (a.estimatedMinutes ?? 60) };
    })
    .sort((x, y) => x.start - y.start || x.end - y.end);

  const result: { a: Appointment; col: number; cols: number }[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    const placed = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.start);
      if (col === -1) { col = colEnds.length; colEnds.push(it.end); }
      else colEnds[col] = it.end;
      return { a: it.a, col };
    });
    const cols = colEnds.length;
    placed.forEach(({ a, col }) => result.push({ a, col, cols }));
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = cluster.length === 1 ? it.end : Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return result;
}

// ── Semana (grade de horários) ───────────────────────────────────────────────
function WeekView({ refDate, appts, onSelect }: { refDate: Date; appts: Appointment[]; onSelect: (a: Appointment) => void }) {
  const days = weekDays(refDate);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className={cn('border-l border-border px-2 py-3 text-center', isToday(d) && 'bg-brand-soft/40')}>
                <p className="text-[11px] uppercase text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</p>
                <p className={cn('mt-0.5 text-lg font-semibold', isToday(d) ? 'text-brand' : 'text-foreground')}>{format(d, 'd')}</p>
              </div>
            ))}
          </div>
          {/* Grade */}
          <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
            <div>
              {HOURS.map((h) => (
                <div key={h} style={{ height: ROW_H }} className="border-b border-border/60 pr-2 pt-1 text-right text-[10px] text-muted-foreground">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const laid = packDay(appts.filter((a) => isSameDay(parseISO(a.scheduledStart), d)));
              return (
                <div key={d.toISOString()} className="relative overflow-hidden border-l border-border" style={{ height: GRID_H }}>
                  {HOURS.map((h) => <div key={h} style={{ height: ROW_H }} className="border-b border-border/60" />)}
                  {laid.map(({ a, col, cols }) => {
                    const start = parseISO(a.scheduledStart);
                    const rawTop = (start.getHours() - 7 + start.getMinutes() / 60) * ROW_H;
                    const top = Math.max(0, rawTop);
                    const rawHeight = ((a.estimatedMinutes ?? 60) / 60) * ROW_H;
                    // Nunca ultrapassa o fim da grade (fica contido na célula cinza).
                    const height = Math.max(24, Math.min(rawHeight, GRID_H - top) - 3);
                    const st = getServiceType(a.serviceTypeId);
                    const widthPct = 100 / cols;
                    return (
                      <motion.button
                        key={a.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => onSelect(a)}
                        className="absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left shadow-soft transition hover:z-10 hover:shadow-card hover:brightness-[1.03]"
                        style={{
                          top,
                          height,
                          left: `calc(${col * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          background: `${st?.color}1a`,
                          borderColor: st?.color,
                        }}
                      >
                        <p className="truncate text-[11px] font-semibold leading-tight text-foreground">{fmtTime(a.scheduledStart)} {getCustomer(a.customerId)?.name}</p>
                        <p className="truncate text-[10px] leading-tight text-muted-foreground">{st?.name}</p>
                      </motion.button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Dia ───────────────────────────────────────────────────────────────────────
function DayView({ refDate, appts, onSelect }: { refDate: Date; appts: Appointment[]; onSelect: (a: Appointment) => void }) {
  const dayAppts = appts.filter((a) => isSameDay(parseISO(a.scheduledStart), refDate)).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  return (
    <Card>
      <CardBody className="space-y-2">
        <p className="mb-2 text-sm font-semibold capitalize text-foreground">{format(refDate, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        {dayAppts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento neste dia.</p>}
        {dayAppts.map((a) => <ApptRow key={a.id} a={a} onSelect={onSelect} />)}
      </CardBody>
    </Card>
  );
}

// ── Mês ───────────────────────────────────────────────────────────────────────
function MonthView({ refDate, appts, onSelect }: { refDate: Date; appts: Appointment[]; onSelect: (a: Appointment) => void }) {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="border-l border-border py-2 text-center text-[11px] font-medium uppercase text-muted-foreground first:border-l-0">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === refDate.getMonth();
          const dayAppts = appts.filter((a) => isSameDay(parseISO(a.scheduledStart), d));
          return (
            <div key={i} className={cn('min-h-[96px] border-b border-l border-border p-1.5', !inMonth && 'bg-muted/30', i % 7 === 0 && 'border-l-0')}>
              <p className={cn('mb-1 text-xs font-medium', isToday(d) ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/50')}>{format(d, 'd')}</p>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map((a) => {
                  const st = getServiceType(a.serviceTypeId);
                  return (
                    <button key={a.id} onClick={() => onSelect(a)} className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted" style={{ color: st?.color }}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st?.color }} />
                      <span className="truncate text-foreground">{fmtTime(a.scheduledStart)} {getCustomer(a.customerId)?.name}</span>
                    </button>
                  );
                })}
                {dayAppts.length > 3 && <p className="px-1 text-[10px] text-muted-foreground">+{dayAppts.length - 3} mais</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Agenda (lista agrupada) ───────────────────────────────────────────────────
function AgendaListView({ appts, onSelect }: { appts: Appointment[]; onSelect: (a: Appointment) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    [...appts].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)).forEach((a) => {
      const key = a.scheduledStart.slice(0, 10);
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    });
    return [...map.entries()];
  }, [appts]);

  return (
    <div className="space-y-4">
      {grouped.map(([day, dayAppts]) => (
        <Card key={day}>
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-semibold capitalize text-foreground">{format(parseISO(day + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          </div>
          <CardBody className="space-y-2">
            {dayAppts.map((a) => <ApptRow key={a.id} a={a} onSelect={onSelect} />)}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ── Mapa (representação esquemática) ──────────────────────────────────────────
function MapView({ appts, onSelect }: { appts: Appointment[]; onSelect: (a: Appointment) => void }) {
  const today = appts.filter((a) => isToday(parseISO(a.scheduledStart)));
  // Normaliza coordenadas para o container.
  const lats = today.map((a) => a.latitude ?? 0);
  const lngs = today.map((a) => a.longitude ?? 0);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pos = (a: Appointment) => ({
    top: `${8 + ((maxLat - (a.latitude ?? 0)) / (maxLat - minLat || 1)) * 82}%`,
    left: `${8 + (((a.longitude ?? 0) - minLng) / (maxLng - minLng || 1)) * 82}%`,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="relative overflow-hidden lg:col-span-2">
        <div className="dot-grid relative h-[460px] w-full bg-muted/30">
          {today.map((a) => {
            const st = getServiceType(a.serviceTypeId);
            return (
              <button key={a.id} onClick={() => onSelect(a)} className="absolute -translate-x-1/2 -translate-y-1/2" style={pos(a)}>
                <motion.span whileHover={{ scale: 1.25 }} className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-elevated ring-2 ring-surface" style={{ background: st?.color }}>
                  <MapPin size={16} />
                </motion.span>
                <span className="absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium shadow-soft">{a.routeOrder}. {getCustomer(a.customerId)?.name}</span>
              </button>
            );
          })}
          <div className="absolute bottom-3 left-3 rounded-lg glass px-3 py-2 text-xs text-muted-foreground">Mapa esquemático · integração Google Maps preparada</div>
        </div>
      </Card>
      <Card>
        <div className="border-b border-border px-5 py-3"><p className="text-sm font-semibold text-foreground">Atendimentos de hoje</p></div>
        <CardBody className="space-y-2">
          {today.map((a) => <ApptRow key={a.id} a={a} onSelect={onSelect} compact />)}
        </CardBody>
      </Card>
    </div>
  );
}

function ApptRow({ a, onSelect, compact }: { a: Appointment; onSelect: (a: Appointment) => void; compact?: boolean }) {
  const cust = getCustomer(a.customerId);
  const st = getServiceType(a.serviceTypeId);
  const tech = getUser(a.technicianId);
  return (
    <motion.button whileHover={{ x: 3 }} onClick={() => onSelect(a)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition hover:bg-muted/40">
      <div className="w-12 shrink-0 text-center">
        <p className="text-sm font-semibold text-foreground">{fmtTime(a.scheduledStart)}</p>
        <p className="text-[10px] text-muted-foreground">{a.estimatedMinutes}min</p>
      </div>
      <span className="h-9 w-1 rounded-full" style={{ background: st?.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{cust?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{st?.name}{!compact && ` · ${a.address}`}</p>
      </div>
      {!compact && tech && <Avatar name={tech.name} size="xs" />}
      <AppointmentStatusBadge status={a.status} />
    </motion.button>
  );
}

function AppointmentDrawer({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const setStatus = useAppointmentsStore((s) => s.setStatus);
  const update = useAppointmentsStore((s) => s.update);
  const removeAppt = useAppointmentsStore((s) => s.remove);
  const [rescheduling, setRescheduling] = useState(false);

  const cust = appt ? getCustomer(appt.customerId) : undefined;
  const st = getServiceType(appt?.serviceTypeId);
  const tech = getUser(appt?.technicianId);
  if (!appt) return null;

  const confirmVisit = () => {
    update(appt.id, { status: 'confirmado', confirmedAt: new Date().toISOString() });
    logChange('confirmação', 'agendamento', `Visita confirmada · ${cust?.name ?? ''}`, appt.id);
  };

  return (
    <Drawer open={!!appt} onClose={() => { setRescheduling(false); onClose(); }} title={cust?.name ?? 'Atendimento'} subtitle={st?.name}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <AppointmentStatusBadge status={appt.status} />
          <PriorityBadge priority={appt.priority} />
          <Badge tone="neutral">{fmtTime(appt.scheduledStart)}–{fmtTime(appt.scheduledEnd)}</Badge>
          {appt.fixedTime && <Badge tone="brand"><Lock size={10} className="mr-1" />Hora marcada</Badge>}
          {appt.recurrenceRule && <Badge tone="info">Recorrente · {appt.recurrenceRule}</Badge>}
        </div>

        <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition ${appt.fixedTime ? 'border-brand/40 bg-brand-soft/40' : 'border-border bg-muted/30 hover:bg-muted/50'}`}>
          <input type="checkbox" checked={!!appt.fixedTime} onChange={(e) => update(appt.id, { fixedTime: e.target.checked || undefined })} className="h-4 w-4 rounded border-border text-brand" />
          <span className="flex items-center gap-1.5 text-sm text-foreground"><Lock size={13} className={appt.fixedTime ? 'text-brand' : 'text-muted-foreground'} /> Hora marcada <span className="text-xs text-muted-foreground">— mantém o horário na otimização de rota</span></span>
        </label>

        {/* Confirmação da visita */}
        {appt.status === 'agendado' && (
          <div className="rounded-xl border border-warning/40 bg-warning-soft/50 p-3">
            <p className="text-sm text-foreground">Esta visita <b>aguarda confirmação</b> do cliente.</p>
            <Button size="sm" className="mt-2" leftIcon={<Check size={14} />} onClick={confirmVisit}>Confirmar visita</Button>
          </div>
        )}
        {appt.confirmedAt && appt.status === 'confirmado' && (
          <p className="text-xs text-success">✓ Confirmada em {new Date(appt.confirmedAt).toLocaleString('pt-BR')}</p>
        )}

        {cust && <WhatsAppPanel appt={appt} cust={cust} serviceName={st?.name} onClientConfirm={confirmVisit} />}

        <Section title="Status do atendimento">
          <Select value={appt.status} onChange={(e) => setStatus(appt.id, e.target.value as AppointmentStatus)}>
            {(Object.keys(APPOINTMENT_STATUS_META) as AppointmentStatus[]).map((s) => (
              <option key={s} value={s}>{APPOINTMENT_STATUS_META[s].label}</option>
            ))}
          </Select>
        </Section>

        <Section title="Endereço"><p className="text-sm text-foreground">{appt.address}</p></Section>
        {appt.technicianNotes && (
          <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Observação do técnico (campo)</p>
            <p className="mt-0.5 text-sm text-foreground">{appt.technicianNotes}</p>
          </div>
        )}
        {cust?.permanentNotes && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Observações do contrato</p>
            <p className="mt-0.5 text-sm text-foreground">{cust.permanentNotes}</p>
          </div>
        )}
        {tech && <Section title="Técnico responsável"><div className="flex items-center gap-2"><Avatar name={tech.name} size="sm" /><span className="text-sm text-foreground">{tech.name}</span></div></Section>}
        <Section title="Contato">
          <p className="text-sm text-foreground">{cust?.phone}</p>
          {cust?.whatsapp && <p className="text-sm text-success">WhatsApp: {cust.whatsapp}</p>}
        </Section>
        <div className="grid grid-cols-2 gap-3">
          <Info label="Tempo estimado" value={`${appt.estimatedMinutes} min`} />
          <Info label="Tipo de imóvel" value={cust?.propertyType ?? '—'} />
          <Info label="Área" value={cust?.areaM2 ? `${cust.areaM2} m²` : '—'} />
          <Info label="Ordem na rota" value={`${appt.routeOrder ?? '—'}`} />
        </div>

        {/* Reagendar / alterar técnico (permitido a qualquer momento) */}
        {rescheduling ? (
          <RescheduleForm appt={appt} onDone={() => setRescheduling(false)} />
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            <Button leftIcon={<MapPin size={15} />} variant="outline">Abrir no mapa / navegação</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setRescheduling(true)}>Reagendar / técnico</Button>
              <Button variant="outline" onClick={() => { setStatus(appt.id, 'cancelado'); logChange('cancelamento', 'agendamento', `Visita cancelada · ${cust?.name ?? ''}`, appt.id); }}>Cancelar visita</Button>
            </div>
            <Button variant="danger" onClick={() => { removeAppt(appt.id); logChange('exclusão', 'agendamento', `Visita excluída · ${cust?.name ?? ''}`, appt.id); onClose(); }}>Excluir</Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** Reagendamento: altera data/hora/técnico e marca a visita como reagendada. */
function RescheduleForm({ appt, onDone }: { appt: Appointment; onDone: () => void }) {
  const update = useAppointmentsStore((s) => s.update);
  const toLocal = (iso: string) => {
    const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [start, setStart] = useState(toLocal(appt.scheduledStart));
  const [technicianId, setTechnicianId] = useState(appt.technicianId ?? '');

  const save = () => {
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (appt.estimatedMinutes ?? 60) * 60000);
    update(appt.id, {
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      technicianId: technicianId || undefined,
      status: 'reagendado',
    });
    const techChanged = technicianId !== appt.technicianId;
    logChange('reagendamento', 'agendamento', `Visita reagendada${techChanged ? ' (técnico alterado)' : ''} · ${getCustomer(appt.customerId)?.name ?? ''}`, appt.id);
    onDone();
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Reagendar visita</p>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-muted-foreground">Nova data e hora
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm text-foreground" />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">Técnico responsável
          <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="mt-1">
            {seed.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDone}>Cancelar</Button>
          <Button size="sm" leftIcon={<Check size={14} />} onClick={save}>Salvar reagendamento</Button>
        </div>
      </div>
    </div>
  );
}

/** Painel de WhatsApp (simulação) — envio de confirmação/lembrete/conclusão,
 *  confirmação de entrega e simulação da resposta do cliente. */
function WhatsAppPanel({ appt, cust, serviceName, onClientConfirm }: { appt: Appointment; cust: Customer; serviceName?: string; onClientConfirm: () => void }) {
  const { messages, send, setStatus } = useMessagesStore();
  const apptMessages = messages.filter((m) => m.appointmentId === appt.id);
  const pendingConfirmation = apptMessages.find((m) => m.type === 'confirmacao' && m.status !== 'confirmada');

  const dispatch = (type: 'confirmacao' | 'lembrete' | 'conclusao') => {
    const body = buildWhatsMessage(type, cust, appt, serviceName);
    send({ appointmentId: appt.id, customerId: cust.id, phone: cust.whatsapp ?? cust.phone, type, body });
    logChange('mensagem', 'whatsapp', `${WHATS_TYPE_LABEL[type]} enviada · ${cust.name}`, appt.id);
  };

  const simulateClientConfirm = () => {
    if (pendingConfirmation) setStatus(pendingConfirmation.id, 'confirmada');
    onClientConfirm();
  };

  const statusTone = (s: string) => (s === 'confirmada' ? 'success' : s === 'entregue' || s === 'lida' ? 'info' : 'neutral');

  return (
    <div className="rounded-xl border border-success/30 bg-success-soft/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle size={15} className="text-success" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-success">WhatsApp</p>
        <Badge tone="neutral" className="text-[10px]">simulação</Badge>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{cust.whatsapp ?? cust.phone ?? 'Sem número cadastrado'}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="outline" onClick={() => dispatch('confirmacao')}>Confirmação</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch('lembrete')}>Lembrete</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch('conclusao')}>Conclusão</Button>
      </div>

      {apptMessages.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {apptMessages.slice(0, 3).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
              <span className="text-xs text-foreground">{WHATS_TYPE_LABEL[m.type]} · {new Date(m.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <Badge tone={statusTone(m.status)} dot className="text-[10px] capitalize">{m.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {pendingConfirmation && appt.status === 'agendado' && (
        <Button size="sm" variant="secondary" className="mt-2 w-full" leftIcon={<Check size={14} />} onClick={simulateClientConfirm}>
          Simular resposta do cliente: confirmar
        </Button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      {children}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
