import type { AppointmentStatus } from '@/domain/enums';

/** Janela de antecedência para pedir confirmação de visitas recorrentes:
 *  Programada → Aguardando confirmação → Confirmada → Liberada ao técnico.
 *  3 dias de antecedência para serviços semanais, 7 dias para os demais. */
export function confirmationWindowDays(recurrenceRule?: string): number {
  return recurrenceRule === 'Semanal' ? 3 : 7;
}

/** Uma ocorrência entra no período de confirmação quando restam
 *  `confirmationWindowDays` dias ou menos até a data agendada. */
export function isDueForConfirmation(scheduledStart: string, recurrenceRule?: string, now: Date = new Date()): boolean {
  const days = confirmationWindowDays(recurrenceRule);
  const threshold = new Date(new Date(scheduledStart).getTime() - days * 86400000);
  return now >= threshold;
}

/** Status liberados ao técnico — visitas "programada"/"agendado" (ainda não
 *  confirmadas pelo cliente) não aparecem na agenda operacional de campo. */
export const RELEASED_TO_TECH_STATUSES: AppointmentStatus[] = ['confirmado', 'em_deslocamento', 'em_atendimento', 'finalizado'];
