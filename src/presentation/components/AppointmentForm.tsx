import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Segmented } from './ui/Segmented';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useCustomersStore } from '@/store/customersStore';
import { useServiceTypesStore } from '@/store/entityStores';
import { getProduct } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
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

  const [customerId, setCustomerId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(seed.serviceTypes[0]?.id ?? '');
  const [technicianId, setTechnicianId] = useState(seed.technicians[0]?.id ?? '');
  const [priority, setPriority] = useState<AppointmentPriority>('normal');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(90);
  const [notes, setNotes] = useState('');
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
    setServiceTypeId(seed.serviceTypes[0]?.id ?? '');
    setTechnicianId(seed.technicians[0]?.id ?? '');
    setPriority('normal');
    setDuration(seed.serviceTypes[0]?.defaultDurationMin ?? 90);
    setNotes('');
    setTouched(false);
  }, [open, defaultDate, customers]);

  // Ajusta a duração padrão ao trocar o tipo de serviço.
  useEffect(() => {
    const st = seed.serviceTypes.find((s) => s.id === serviceTypeId);
    if (st) setDuration(st.defaultDurationMin);
  }, [serviceTypeId]);

  const error = useMemo(() => {
    if (!customerId) return 'Selecione um cliente.';
    if (!start) return 'Informe data e hora.';
    return null;
  }, [customerId, start]);

  const submit = () => {
    setTouched(true);
    if (error) return;
    const cust = customers.find((c) => c.id === customerId);
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    add({
      customerId,
      serviceTypeId,
      technicianId,
      priority,
      status: 'agendado',
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      estimatedMinutes: duration,
      address: cust ? [cust.street && `${cust.street}, ${cust.number ?? 's/n'}`, cust.district].filter(Boolean).join(' — ') : undefined,
      latitude: cust?.latitude,
      longitude: cust?.longitude,
      notes: notes.trim() || undefined,
      routeOrder: 1,
      // Pré-preenche com os produtos padrão do serviço.
      products: defaultProducts.map((dp) => ({ productId: dp.productId, plannedQty: dp.qty })),
    });
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
              {seed.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Duração (min)">
            <Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
          </Field>
        </div>

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
      </div>
    </Drawer>
  );
}
