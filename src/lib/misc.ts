import type { AppointmentStatus, ServiceOrderStatus } from '@/domain/enums';

export function daysFromNowIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/** Mapeia o status da O.S. pro status equivalente do agendamento vinculado a
 *  ela — usado ao criar/atualizar esse agendamento a partir da OS
 *  (OrdensPage e AppointmentForm, ao confirmar uma OS existente na Agenda). */
export function osStatusToAppointmentStatus(status: ServiceOrderStatus): AppointmentStatus {
  if (status === 'concluida') return 'finalizado';
  if (status === 'em_andamento') return 'em_atendimento';
  if (status === 'cancelada') return 'cancelado';
  return 'confirmado';
}
