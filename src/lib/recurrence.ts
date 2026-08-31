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

/** Datas efetivas do plano: as do usuário quando existem, senão as calculadas.
 *  Mantém o tamanho do plano — sobra de `dates` (fase encurtada) é descartada,
 *  falta (fase ampliada) é completada pelo cálculo. */
export function planDates(occurrences: RecurrenceOccurrence[], overrides?: string[]): string[] {
  return occurrences.map((occ, i) => overrides?.[i] || occ.date);
}

/** Dia da semana por extenso — é o que responde "cai no fim de semana?", que
 *  é a pergunta real de quem programa visita em estabelecimento comercial. */
export function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long' });
}

/** Sábado ou domingo. Não é impedimento — muita dedetização é feita justamente
 *  com a loja fechada —, mas precisa estar visível na hora de programar. */
export function isWeekend(iso: string): boolean {
  const d = new Date(iso).getDay();
  return d === 0 || d === 6;
}

/** Quantas visitas do plano caem nos próximos 12 meses — o horizonte que a
 *  agenda mostra. */
export function withinNextYear(dates: string[]): string[] {
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() + 1);
  return dates.filter((d) => new Date(d) <= limite);
}
