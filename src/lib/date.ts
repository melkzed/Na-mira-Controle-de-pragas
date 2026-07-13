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
