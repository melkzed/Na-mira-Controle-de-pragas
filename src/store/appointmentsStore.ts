import { create } from 'zustand';
import type { Appointment, AppointmentProduct, ServiceOrderPhoto, VerificationItem } from '@/domain/types';
import type { AppointmentStatus } from '@/domain/enums';
import { appointments as seedAppointments } from '@/infrastructure/seed/data';
import { isDueForConfirmation } from '@/lib/confirmation';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { useAppStore } from './appStore';
import { useCustomersStore } from './customersStore';

/**
 * Store reativa de Agendamentos.
 *
 * Modo standalone (sem Supabase): inicializada a partir do seed, persistida
 * em localStorage só dentro do dia — os horários do seed são relativos a
 * "hoje", então a cada dia novo ela recarrega do zero (senão a agenda
 * "envelheceria"). Comportamento inalterado desde antes da Fase 2.
 *
 * Modo Supabase: dado real e compartilhado — sem carimbo de dia (não faz
 * sentido "reiniciar" a agenda de verdade todo dia). Escrita otimista +
 * Realtime, mesmo padrão de customersStore.ts (ver docs/ARCHITECTURE.md §3.1).
 */
const STORAGE_KEY = 'namira-appointments';
const STAMP_KEY = 'namira-appointments-day';
const TABLE = 'appointments';

export type AppointmentInput = Omit<Appointment, 'id' | 'orgId' | 'products'> &
  Partial<Pick<Appointment, 'products'>>;

interface AppointmentsState {
  appointments: Appointment[];
  /** Assíncrona de propósito (mesma razão de serviceOrdersStore.add — ver
   *  docs/ARCHITECTURE.md §3.1): quem cria um agendamento e em seguida
   *  grava algo que referencia esse id por FK (ex.: service_orders.
   *  appointment_id) precisa aguardar a confirmação remota antes. No modo
   *  standalone resolve na mesma tick, sem mudança de comportamento. */
  add: (input: AppointmentInput) => Promise<Appointment>;
  update: (id: string, patch: Partial<Appointment>) => void;
  setStatus: (id: string, status: AppointmentStatus) => void;
  remove: (id: string) => void;
  /** Programada → Aguardando confirmação: promove ocorrências recorrentes
   *  que entraram no período de confirmação (3 dias antes p/ semanais, 7
   *  dias antes para as demais) e notifica. Chamado ao carregar o app;
   *  idempotente — não faz nada se nenhuma visita estiver vencendo. */
  sweepConfirmations: () => void;
}

function today(): string {
  // Data local (não UTC) — .toISOString().slice(0,10) mostraria o dia
  // seguinte entre ~21h e meia-noite no fuso do Brasil (UTC-3).
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function load(): Appointment[] {
  if (supabaseEnabled) return [];
  try {
    if (localStorage.getItem(STAMP_KEY) === today()) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Appointment[];
    }
  } catch {
    /* ignora */
  }
  return seedAppointments;
}

function persist(list: Appointment[]) {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(STAMP_KEY, today());
  } catch {
    /* ignora */
  }
}

function uid(): string {
  return 'a-' + Math.random().toString(36).slice(2, 9);
}

/** Formato das colunas em public.appointments (snake_case) — ver
 *  db/schema.sql e db/migrate_appointments_realtime.sql. */
interface AppointmentRow {
  id: string;
  org_id: string;
  customer_id: string;
  service_type_id: string | null;
  technician_id: string | null;
  team_id: string | null;
  vehicle_id: string | null;
  status: string;
  priority: string;
  scheduled_start: string;
  scheduled_end: string;
  estimated_minutes: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  fixed_time: boolean;
  notes: string | null;
  technician_notes: string | null;
  photos: ServiceOrderPhoto[] | null;
  technician_signature: string | null;
  customer_signature: string | null;
  verification: VerificationItem[] | null;
  route_order: number | null;
  products: AppointmentProduct[] | null;
  recurrence_id: string | null;
  recurrence_rule: string | null;
  confirmed_at: string | null;
  reschedule_request: Appointment['rescheduleRequest'] | null;
  signer_name: string | null;
  signer_doc_type: string | null;
  signer_document: string | null;
}

function fromRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    orgId: row.org_id,
    customerId: row.customer_id,
    serviceTypeId: row.service_type_id ?? undefined,
    technicianId: row.technician_id ?? undefined,
    teamId: row.team_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    status: row.status as AppointmentStatus,
    priority: row.priority as Appointment['priority'],
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    address: row.address ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    fixedTime: row.fixed_time,
    notes: row.notes ?? undefined,
    technicianNotes: row.technician_notes ?? undefined,
    photos: row.photos ?? undefined,
    technicianSignature: row.technician_signature ?? undefined,
    customerSignature: row.customer_signature ?? undefined,
    verification: row.verification ?? undefined,
    routeOrder: row.route_order ?? undefined,
    products: row.products ?? [],
    recurrenceId: row.recurrence_id ?? undefined,
    recurrenceRule: row.recurrence_rule ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    rescheduleRequest: row.reschedule_request ?? undefined,
    signerName: row.signer_name ?? undefined,
    signerDocType: (row.signer_doc_type as Appointment['signerDocType']) ?? undefined,
    signerDocument: row.signer_document ?? undefined,
  };
}

function toRow(a: Appointment): AppointmentRow {
  return {
    id: a.id,
    org_id: a.orgId,
    customer_id: a.customerId,
    service_type_id: a.serviceTypeId ?? null,
    technician_id: a.technicianId ?? null,
    team_id: a.teamId ?? null,
    vehicle_id: a.vehicleId ?? null,
    status: a.status,
    priority: a.priority,
    scheduled_start: a.scheduledStart,
    scheduled_end: a.scheduledEnd,
    estimated_minutes: a.estimatedMinutes ?? null,
    address: a.address ?? null,
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
    fixed_time: a.fixedTime ?? false,
    notes: a.notes ?? null,
    technician_notes: a.technicianNotes ?? null,
    photos: a.photos ?? null,
    technician_signature: a.technicianSignature ?? null,
    customer_signature: a.customerSignature ?? null,
    verification: a.verification ?? null,
    route_order: a.routeOrder ?? null,
    products: a.products ?? [],
    recurrence_id: a.recurrenceId ?? null,
    recurrence_rule: a.recurrenceRule ?? null,
    confirmed_at: a.confirmedAt ?? null,
    reschedule_request: a.rescheduleRequest ?? null,
    signer_name: a.signerName ?? null,
    signer_doc_type: a.signerDocType ?? null,
    signer_document: a.signerDocument ?? null,
  };
}

/** Grava no Supabase em segundo plano; desfaz o estado otimista + avisa em
 *  caso de falha. Usado por update/setStatus/sweepConfirmations. */
function syncUpdate(id: string, rollbackTo: Appointment[]) {
  if (!supabaseEnabled || !supabase) return;
  const updated = useAppointmentsStore.getState().appointments.find((a) => a.id === id);
  if (!updated) return;
  supabase.from(TABLE).update(toRow(updated)).eq('id', id).then(({ error }: any) => {
    if (error) {
      useAppointmentsStore.setState({ appointments: rollbackTo });
      console.error('[appointmentsStore] Erro ao atualizar agendamento:', (error as any).code, (error as any).message);
      toast('Não foi possível salvar o agendamento — tente novamente.', { tone: 'danger' });
    }
  }).catch((err: unknown) => {
    useAppointmentsStore.setState({ appointments: rollbackTo });
    console.error('[appointmentsStore] Exceção ao sincronizar agendamento:', err);
    toast('Erro ao sincronizar agendamento — tente novamente.', { tone: 'danger' });
  });
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: load(),
  add: async (input) => {
    const appt: Appointment = {
      id: uid(),
      orgId: useAppStore.getState().currentUser?.orgId ?? 'org-namira',
      products: input.products ?? [],
      ...input,
    };
    const next = [...get().appointments, appt];
    set({ appointments: next });
    if (supabaseEnabled && supabase) {
      try {
        const { error } = await supabase.from(TABLE).insert(toRow(appt));
        if (error) {
          set({ appointments: get().appointments.filter((a) => a.id !== appt.id) });
          console.error('[appointmentsStore] Erro ao criar agendamento:', (error as any).code, (error as any).message);
          toast(`Erro ao criar agendamento: ${(error as any).message}`, { tone: 'danger' });
          throw error;
        }
      } catch (err: unknown) {
        set({ appointments: get().appointments.filter((a) => a.id !== appt.id) });
        console.error('[appointmentsStore] Exceção ao criar agendamento:', err);
        if (!(err instanceof Error && err.message.includes('code'))) {
          toast('Erro ao criar agendamento — tente novamente.', { tone: 'danger' });
        }
        throw err;
      }
    } else {
      persist(next);
    }
    return appt;
  },
  update: (id, patch) => {
    const prev = get().appointments;
    const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
    set({ appointments: next });
    if (supabaseEnabled) syncUpdate(id, prev); else persist(next);
  },
  setStatus: (id, status) => {
    const prev = get().appointments;
    const next = prev.map((a) => (a.id === id ? { ...a, status } : a));
    set({ appointments: next });
    if (supabaseEnabled) syncUpdate(id, prev); else persist(next);
  },
  remove: (id) => {
    const prev = get().appointments;
    const next = prev.filter((a) => a.id !== id);
    set({ appointments: next });
    if (supabaseEnabled && supabase) {
      supabase.from(TABLE).delete().eq('id', id).then(({ error }: any) => {
        if (error) {
          set({ appointments: prev });
          console.error('[appointmentsStore] Erro ao excluir agendamento:', (error as any).code, (error as any).message);
          toast('Não foi possível excluir o agendamento — tente novamente.', { tone: 'danger' });
        }
      }).catch((err: unknown) => {
        set({ appointments: prev });
        console.error('[appointmentsStore] Exceção ao excluir agendamento:', err);
        toast('Erro ao excluir agendamento — tente novamente.', { tone: 'danger' });
      });
    } else {
      persist(next);
    }
  },
  sweepConfirmations: () => {
    const prev = get().appointments;
    const due = prev.filter((a) => a.status === 'programada' && isDueForConfirmation(a.scheduledStart, a.recurrenceRule));
    if (!due.length) return;
    const dueIds = new Set(due.map((a) => a.id));
    const next = prev.map((a) => (dueIds.has(a.id) ? { ...a, status: 'agendado' as AppointmentStatus } : a));
    set({ appointments: next });
    if (supabaseEnabled) due.forEach((a) => syncUpdate(a.id, prev)); else persist(next);
    due.forEach((a) => {
      const custName = useCustomersStore.getState().customers.find((c) => c.id === a.customerId)?.name ?? 'cliente';
      useAppStore.getState().addNotification({
        title: 'Confirmação de visita necessária',
        body: `${custName} — visita em ${new Date(a.scheduledStart).toLocaleDateString('pt-BR')} aguarda confirmação.`,
        tone: 'warning',
        entityType: 'appointment',
        entityId: a.id,
      });
    });
  },
}));

// Roda uma vez ao carregar o módulo — mantém as ocorrências recorrentes em
// dia sem depender de um job em segundo plano (app 100% client-side).
// No modo Supabase, roda só depois da carga inicial (senão varre a lista
// vazia antes do fetch chegar).
if (!supabaseEnabled) {
  useAppointmentsStore.getState().sweepConfirmations();
}

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('scheduled_start', { ascending: true })
    .then(({ data, error }: any) => {
      if (error) {
        console.error('[appointmentsStore] Erro ao carregar agendamentos:', (error as any).code, (error as any).message);
        return;
      }
      if (data) {
        useAppointmentsStore.setState({ appointments: (data as AppointmentRow[]).map(fromRow) });
        useAppointmentsStore.getState().sweepConfirmations();
      }
    })
    .catch((err: unknown) => {
      console.error('[appointmentsStore] Exceção ao carregar agendamentos:', err);
    });

  supabase
    .channel('appointments-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload: any) => {
      const state = useAppointmentsStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useAppointmentsStore.setState({ appointments: state.appointments.filter((a) => a.id !== oldId) });
        return;
      }
      const appt = fromRow(payload.new as AppointmentRow);
      const exists = state.appointments.some((a) => a.id === appt.id);
      useAppointmentsStore.setState({
        appointments: exists
          ? state.appointments.map((a) => (a.id === appt.id ? appt : a))
          : [...state.appointments, appt],
      });
    })
    .subscribe();
}
