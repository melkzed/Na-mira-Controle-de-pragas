/** Cálculo de planos de recorrência multi-fase (Ordem de Serviço). */
import {
  RECURRENCE_FREQ_DAYS, RECURRENCE_FREQ_LABEL, RECURRENCE_FREQ_MONTHS, type RecurrenceFreq,
} from '@/domain/enums';
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
    for (let i = 0; i < phase.occurrences; i++) {
      cursor = proximaData(cursor, phase.frequency);
      out.push({ date: cursor.toISOString(), phaseId: phase.id, frequency: phase.frequency, phaseIndex, occurrenceIndexInPhase: i });
    }
  });
  return out;
}

/** Próxima data de uma periodicidade: mês de calendário quando a
 *  periodicidade é mensal ou maior, senão blocos de dias. */
export function proximaData(de: Date, freq: RecurrenceFreq): Date {
  const meses = RECURRENCE_FREQ_MONTHS[freq];
  const d = new Date(de);
  if (meses) {
    const dia = d.getDate();
    d.setMonth(d.getMonth() + meses);
    // 31/01 + 1 mês vira 03/03 se o mês seguinte não tem dia 31 — recua para
    // o último dia do mês pretendido, que é o que "todo dia 31" significa.
    if (d.getDate() !== dia) d.setDate(0);
    return d;
  }
  d.setDate(d.getDate() + RECURRENCE_FREQ_DAYS[freq]);
  return d;
}

/**
 * Quantas visitas cabem numa recorrência de `meses`, na periodicidade dada.
 *
 * É a conta que o usuário faz de cabeça ao contratar: "um ano, de mês em mês"
 * são doze visitas. Contar as datas de verdade (em vez de dividir dias) evita
 * que fevereiro ou um mês de 31 dias mude o total.
 */
export function occurrencesForDuration(
  meses: number,
  freq: RecurrenceFreq,
  /** Intervalo da primeira visita, quando difere das demais (ver
   *  `OsRecurrence.firstVisitFreq`). */
  primeira?: RecurrenceFreq,
): number {
  if (meses <= 0) return 0;
  const inicio = new Date();
  const limite = new Date(inicio);
  limite.setMonth(limite.getMonth() + meses);
  let cursor = inicio;
  let n = 0;
  // Teto de segurança: semanal em 24 meses dá ~104 — 400 nunca é atingido na
  // prática e impede laço infinito se alguma periodicidade vier zerada.
  while (n < 400) {
    cursor = proximaData(cursor, n === 0 && primeira ? primeira : freq);
    if (cursor > limite) break;
    n += 1;
  }
  return n;
}

/**
 * Fases de um plano "primeira visita em X, depois a cada Y".
 *
 * O modelo guardado já sabia encadear fases; o que faltava era a tela oferecer
 * isso. A primeira vira uma fase de uma ocorrência só, e o resto do prazo vira
 * a segunda — que é exatamente como o contrato é vendido.
 */
export function phasesFor(
  meses: number,
  freq: RecurrenceFreq,
  primeira: RecurrenceFreq | undefined,
  novoId: () => string,
): RecurrencePhase[] {
  const total = occurrencesForDuration(meses, freq, primeira);
  if (!primeira || primeira === freq || total === 0) {
    return [{ id: novoId(), frequency: freq, occurrences: total }];
  }
  const fases: RecurrencePhase[] = [{ id: novoId(), frequency: primeira, occurrences: 1 }];
  if (total > 1) fases.push({ id: novoId(), frequency: freq, occurrences: total - 1 });
  return fases;
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

/** Durações contratadas na prática. "Um ano" é de longe a mais comum, então é
 *  o padrão da tela. */
export const DURACOES_RECORRENCIA: { meses: number; label: string }[] = [
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '1 ano' },
  { meses: 18, label: '1 ano e meio' },
  { meses: 24, label: '2 anos' },
  { meses: 36, label: '3 anos' },
];

export function rotuloDuracao(meses: number): string {
  return DURACOES_RECORRENCIA.find((d) => d.meses === meses)?.label ?? `${meses} meses`;
}

/**
 * Id do grupo de uma recorrência — as visitas de um mesmo plano.
 *
 * UUID de verdade, e não o `uid('rec')` usado no resto do app, porque este id
 * vai para `appointments.recurrence_id`, que é uma coluna `uuid` no Postgres.
 * Um id prefixado ("rec-coqspft") faz o banco recusar a inserção inteira com
 * "invalid input syntax for type uuid" — e como uma recorrência insere uma
 * visita por ocorrência, o plano inteiro falha de uma vez.
 *
 * O valor é opaco: nada no sistema lê o prefixo, só compara igualdade.
 */
export function recurrenceGroupId(): string {
  return crypto.randomUUID();
}
