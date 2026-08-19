import { useEffect, useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Segmented } from './ui/Segmented';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { logChange } from '@/store/auditStore';
import { useCustomersStore } from '@/store/customersStore';
import { useServiceTypesStore, useUsersStore } from '@/store/entityStores';
import { getProduct } from '@/application/repository';
import type { AppointmentPriority } from '@/domain/enums';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentForm({
  open,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const add = useAppointmentsStore((s) => s.add);
  const customers = useCustomersStore((s) => s.customers);
  const serviceTypes = useServiceTypesStore((s) => s.items);
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico' && u.isActive));

  const [customerId, setCustomerId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [priority, setPriority] = useState<AppointmentPriority>('normal');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(90);
  const [fixedTime, setFixedTime] = useState(false);
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<'none' | 'semanal' | 'quinzenal' | 'mensal'>('none');
  const [occurrences, setOccurrences] = useState(4);
  const [touched, setTouched] = useState(false);

  const selectedService = serviceTypes.find((s) => s.id === serviceTypeId);
  const defaultProducts = selectedService?.defaultProducts ?? [];

  useEffect(() => {
    if (!open) return;
    const base = defaultDate ? new Date(defaultDate) : new Date();
    if (!defaultDate) base.setHours(base.getHours() + 1, 0, 0, 0);
    else base.setHours(9, 0, 0, 0);
    setStart(toLocalInput(base));
    setCustomerId(customers[0]?.id ?? '');
    setServiceTypeId(serviceTypes[0]?.id ?? '');
    setTechnicianId(technicians[0]?.id ?? '');
    setPriority('normal');
    setDuration(serviceTypes[0]?.defaultDurationMin ?? 90);
    setFixedTime(false);
    setNotes('');
    setRecurrence('none');
    setOccurrences(4);
    setTouched(false);
  }, [open, defaultDate, customers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ajusta a duração padrão ao trocar o tipo de serviço.
  useEffect(() => {
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    if (st) setDuration(st.defaultDurationMin);
  }, [serviceTypeId, serviceTypes]);

  const error = useMemo(() => {
    if (!customerId) return 'Selecione um cliente.';
    if (!start) return 'Informe data e hora.';
    return null;
  }, [customerId, start]);

  const submit = () => {
    setTouched(true);
    if (error) return;
    const cust = customers.find((c) => c.id === customerId);
    const address = cust ? [cust.street && `${cust.street}, ${cust.number ?? 's/n'}`, cust.district].filter(Boolean).join(' — ') : undefined;
    const products = defaultProducts.map((dp) => ({ productId: dp.productId, plannedQty: dp.qty }));
    const recurrenceId = recurrence !== 'none' ? 'rec-' + Math.random().toString(36).slice(2, 9) : undefined;
    const total = recurrence === 'none' ? 1 : Math.max(1, Math.min(52, occurrences));

    for (let i = 0; i < total; i++) {
      const startDate = new Date(start);
      if (recurrence === 'semanal') startDate.setDate(startDate.getDate() + i * 7);
      else if (recurrence === 'quinzenal') startDate.setDate(startDate.getDate() + i * 14);
      else if (recurrence === 'mensal') startDate.setMonth(startDate.getMonth() + i);
      const endDate = new Date(startDate.getTime() + duration * 60000);
      // add() é assíncrona (aguarda confirmação remota em modo Supabase) —
      // aqui não há nada dependente a criar em seguida, então dispara sem
      // aguardar; a store já mostra o toast de erro sozinha.
      add({
        customerId,
        serviceTypeId,
        technicianId,
        priority,
        status: 'agendado', // "Aguardando confirmação"
        scheduledStart: startDate.toISOString(),
        scheduledEnd: endDate.toISOString(),
        estimatedMinutes: duration,
        address,
        latitude: cust?.latitude,
        longitude: cust?.longitude,
        fixedTime: fixedTime || undefined,
        notes: notes.trim() || undefined,
        routeOrder: 1,
        products,
        recurrenceId,
        recurrenceRule: recurrence !== 'none' ? recurrence : undefined,
      }).catch(() => {});
    }
    logChange('criação', 'agendamento', recurrence !== 'none' ? `${total} visitas recorrentes (${recurrence}) · ${cust?.name ?? ''}` : `Visita agendada · ${cust?.name ?? ''}`);
    onSaved();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Novo agendamento"
      subtitle="Agende um atendimento"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-danger">{touched && error ? error : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} leftIcon={<Check size={15} />} disabled={!!error}>Agendar</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente" required>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Selecione…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de serviço">
            <Select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>
              {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Técnico responsável">
            <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>

        {defaultProducts.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Produtos padrão do serviço</p>
            <div className="flex flex-wrap gap-1.5">
              {defaultProducts.map((dp) => (
                <span key={dp.productId} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground">
                  {getProduct(dp.productId)?.name ?? dp.productId} · {dp.qty} {getProduct(dp.productId)?.unit}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Serão pré-carregados na visita; o técnico confirma o que realmente usou.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Data e hora" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
          </Field>
          <Field label="Duração (min)">
            <Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
          </Field>
        </div>

        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${fixedTime ? 'border-brand/40 bg-brand-soft/40' : 'border-border bg-muted/30 hover:bg-muted/50'}`}>
          <input type="checkbox" checked={fixedTime} onChange={(e) => setFixedTime(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border text-brand" />
          <span className="leading-snug">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Lock size={13} className={fixedTime ? 'text-brand' : 'text-muted-foreground'} /> Hora marcada</span>
            <span className="text-xs text-muted-foreground">O cliente exige este horário. A otimização de rota mantém a visita dentro do horário; sem marcar, ela pode ser reordenada para encurtar o trajeto.</span>
          </span>
        </label>

        <Field label="Prioridade">
          <Segmented
            value={priority}
            onChange={setPriority}
            size="sm"
            options={[
              { value: 'baixa', label: 'Baixa' },
              { value: 'normal', label: 'Normal' },
              { value: 'alta', label: 'Alta' },
              { value: 'urgente', label: 'Urgente' },
            ]}
          />
        </Field>

        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes do atendimento…" />
        </Field>

        {/* Recorrência */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Recorrência</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repetir">
              <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
                <option value="none">Não repetir</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
              </Select>
            </Field>
            {recurrence !== 'none' && (
              <Field label="Nº de ocorrências">
                <Input type="number" min={1} max={52} value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value) || 1)} />
              </Field>
            )}
          </div>
          {recurrence !== 'none' && (
            <p className="mt-2 text-xs text-muted-foreground">Serão criadas {Math.max(1, Math.min(52, occurrences))} visitas independentes; cada uma pode ser confirmada, reagendada ou cancelada sem afetar as demais.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
