/** Cálculo de planos de recorrência multi-fase (Ordem de Serviço). */
import { RECURRENCE_FREQ_DAYS, RECURRENCE_FREQ_LABEL, type RecurrenceFreq } from '@/domain/enums';
import type { OsRecurrence, RecurrencePhase } from '@/domain/types';

export interface RecurrenceOccurrence {
  date: string;
  phaseId: string;
  frequency: RecurrenceFreq;
  phaseIndex: number;
  occurrenceIndexInPhase: number;
}

/** Gera todas as datas futuras de um plano de recorrência: cada ocorrência
 *  soma a periodicidade da fase à data anterior (nunca ao dia de hoje),
 *  encadeando as fases em sequência. Não é repetição infinita — o plano
 *  termina quando todas as fases tiverem suas ocorrências geradas. */
export function computeRecurrenceOccurrences(baseDateIso: string, phases: RecurrencePhase[]): RecurrenceOccurrence[] {
  const out: RecurrenceOccurrence[] = [];
  let cursor = new Date(baseDateIso);
  phases.forEach((phase, phaseIndex) => {
    const days = RECURRENCE_FREQ_DAYS[phase.frequency];
    for (let i = 0; i < phase.occurrences; i++) {
      cursor = new Date(cursor.getTime() + days * 86400000);
      out.push({ date: cursor.toISOString(), phaseId: phase.id, frequency: phase.frequency, phaseIndex, occurrenceIndexInPhase: i });
    }
  });
  return out;
}

/** Total de ocorrências programadas em todas as fases do plano. */
export function totalOccurrences(phases: RecurrencePhase[]): number {
  return phases.reduce((sum, p) => sum + Math.max(0, p.occurrences), 0);
}

/** Resumo textual da recorrência para exibição (detalhe da OS, PDF, listas). */
export function recurrenceSummaryLabel(rec?: OsRecurrence): string {
  if (!rec?.enabled) return 'Não';
  if (rec.phases?.length) {
    const total = totalOccurrences(rec.phases);
    return `${rec.phases.length} fase(s) · ${total} visita(s) programada(s)`;
  }
  return rec.frequency ? RECURRENCE_FREQ_LABEL[rec.frequency] : 'Sim';
}
