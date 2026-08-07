import {
  addDays,
  differenceInMinutes,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function fmtTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm');
}

/**
 * Converte o valor de um `<input type="date">` (string `YYYY-MM-DD`, sem
 * fuso) para um ISO string ancorado na meia-noite LOCAL.
 *
 * `new Date('YYYY-MM-DD')` é interpretado pelo padrão ECMA-262 como UTC —
 * em fusos negativos como o do Brasil (UTC-3) isso desloca a data em um dia
 * ao exibir depois (`02/08` vira `01/08`). Sempre use esta função para
 * converter um valor de campo de data antes de salvar — nunca
 * `new Date(valor).toISOString()` diretamente.
 */
export function dateInputToIso(value: string): string {
  return parseDateInput(value).toISOString();
}

/**
 * Constrói um `Date` LOCAL a partir do valor de um `<input type="date">`
 * (`YYYY-MM-DD`) — use para fazer aritmética de datas (somar dias, comparar).
 * Nunca use `new Date(value)` diretamente com uma string desse formato: o
 * padrão ECMA-262 interpreta como UTC e, num fuso negativo como o do Brasil,
 * `getDate()`/`getMonth()` no resultado já vêm um dia atrasados.
 */
export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Formata um `Date` como valor de `<input type="date">` (`YYYY-MM-DD`) usando
 * os componentes LOCAIS. Nunca use `date.toISOString().slice(0, 10)` para
 * isso — converte para UTC e pode mostrar o dia seguinte/anterior perto da
 * meia-noite local.
 */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(iso: string): string {
  return format(parseISO(iso), "dd 'de' MMM", { locale: ptBR });
}

export function fmtDateLong(iso: string): string {
  return format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });
}

export function fmtWeekday(iso: string): string {
  return format(parseISO(iso), 'EEE', { locale: ptBR });
}

export function weekDays(reference: Date): Date[] {
  const start = startOfWeek(reference, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekRangeLabel(reference: Date): string {
  const start = startOfWeek(reference, { weekStartsOn: 1 });
  const end = endOfWeek(reference, { weekStartsOn: 1 });
  return `${format(start, 'dd MMM', { locale: ptBR })} – ${format(end, 'dd MMM', { locale: ptBR })}`;
}

export function durationLabel(startIso: string, endIso: string): string {
  const mins = differenceInMinutes(parseISO(endIso), parseISO(startIso));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h${m}`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export { isSameDay, isToday, parseISO, addDays, format, ptBR };
