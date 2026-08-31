import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina classes Tailwind resolvendo conflitos. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrency(value: number): string {
  return currencyFmt.format(value ?? 0);
}

export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return (
      'R$ ' +
      new Intl.NumberFormat('pt-BR', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)
    );
  }
  return currencyFmt.format(value);
}

const numberFmt = new Intl.NumberFormat('pt-BR');

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value ?? 0);
}

export { numberFmt };

export function formatDocument(doc?: string): string {
  if (!doc) return '—';
  const digits = doc.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return doc;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

/** Retorna um tom estável (0-6) a partir de uma string para cores de avatar. */
export function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function daysUntil(dateISO?: string): number | null {
  if (!dateISO) return null;
  const target = new Date(dateISO).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Comparação alfabética em pt-BR.
 *
 * `localeCompare` com a locale certa é o que faz "Ávila" cair junto de "Avila"
 * e "ç" junto de "c" — a ordenação por código de caractere jogaria todos os
 * acentuados para o fim da lista, o que numa lista de clientes brasileiros é
 * praticamente uma lista errada. `sensitivity: 'base'` ignora caixa e acento
 * no desempate; `numeric` faz "Sala 2" vir antes de "Sala 10".
 */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function compareText(a?: string, b?: string): number {
  return collator.compare(a ?? '', b ?? '');
}

/** Ordena por nome sem alterar o array original (as stores são compartilhadas
 *  entre telas — ordenar no lugar mudaria a ordem para todo mundo). */
export function sortByName<T extends { name?: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareText(a.name, b.name));
}

/** Igual a `sortByName`, mas para listas cujo rótulo não é `name`. */
export function sortBy<T>(items: readonly T[], key: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => compareText(key(a), key(b)));
}
