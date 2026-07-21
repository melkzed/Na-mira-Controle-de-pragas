/**
 * Utilitário de exportação de dados (client-side, sem dependências).
 * Gera CSV com BOM (compatível com Excel pt-BR) e dispara o download.
 */

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[";\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const sep = ';'; // Excel pt-BR usa ; como separador
  const head = columns.map((c) => escapeCsv(c.header)).join(sep);
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(c.value(r))).join(sep))
    .join('\n');
  const csv = '﻿' + head + '\n' + body; // BOM para acentuação no Excel

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
