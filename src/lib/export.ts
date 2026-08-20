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
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Baixa um texto já pronto como arquivo (ex.: a planilha modelo de produtos).
 *  Diferente de `downloadCsv`, que monta o CSV a partir de linhas do sistema. */
export function downloadTextFile(filename: string, content: string): void {
  // BOM para o Excel abrir os acentos corretamente.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * Exporta uma planilha real (.xls) que o Excel abre nativamente, com o cabeçalho
 * e as linhas do relatório solicitado (não um CSV genérico).
 */
export function downloadXls<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  title?: string,
): void {
  const head = `<tr>${columns.map((c) => `<th style="background:#D32F2F;color:#fff;border:1px solid #cbd5e1;padding:6px 10px;text-align:left">${esc(c.header)}</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td style="border:1px solid #e2e8f0;padding:5px 10px">${esc(c.value(r))}</td>`).join('')}</tr>`)
    .join('');
  const caption = title ? `<tr><td colspan="${columns.length}" style="font-weight:700;font-size:14px;padding:8px 4px">${esc(title)}</td></tr>` : '';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table>${caption}${head}${body}</table></body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
