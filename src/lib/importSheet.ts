/**
 * Leitura de planilhas para importação em massa — sem dependências externas.
 *
 * Formatos aceitos (cobrem o que os sistemas do setor exportam na prática):
 *  - **Tabela HTML** salva com extensão `.xls`/`.html` — é o que a maioria dos
 *    sistemas web exporta quando o botão diz "Excel"; o arquivo não é um
 *    binário do Excel, é um `<table>`. Foi o caso da planilha de produtos.
 *  - **CSV / TSV / texto separado por `;`** — separador detectado sozinho.
 *
 * `.xlsx` de verdade (binário ZIP) NÃO é lido aqui: exigiria uma biblioteca
 * pesada só para isso. A tela de importação orienta a salvar como CSV.
 */

/** Uma planilha lida: primeira linha = cabeçalho, demais = dados. */
export interface SheetTable {
  headers: string[];
  rows: string[][];
}

/** Normaliza um texto para comparar cabeçalhos: sem acento, minúsculo, sem
 *  pontuação e com espaços colapsados ("PRINCÍPIO ATIVO" → "principio ativo"). */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanCell(s: string): string {
  // &nbsp; vira espaço normal; espaços repetidos colapsam ("Fosfato  Férrico").
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extrai a primeira tabela de um documento HTML. */
function parseHtmlTable(text: string): SheetTable | null {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const all = Array.from(table.querySelectorAll('tr'))
    .map((tr) => Array.from(tr.querySelectorAll('th, td')).map((c) => cleanCell(c.textContent ?? '')))
    .filter((cells) => cells.some((c) => c !== ''));
  if (!all.length) return null;
  const [headers, ...rows] = all;
  return { headers, rows };
}

/** Quebra uma linha de CSV respeitando aspas duplas ("a; b";c). */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(cleanCell);
}

function parseDelimited(text: string): SheetTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return null;
  // Separador = o que mais aparece na linha de cabeçalho.
  const sep = [';', ',', '\t'].reduce((best, s) =>
    (lines[0].split(s).length > lines[0].split(best).length ? s : best), ';');
  const all = lines.map((l) => splitCsvLine(l, sep)).filter((cells) => cells.some((c) => c !== ''));
  if (!all.length) return null;
  const [headers, ...rows] = all;
  return { headers, rows };
}

/** Lê o conteúdo de um arquivo de planilha, detectando o formato pelo conteúdo
 *  (não pela extensão — o `.xls` da planilha de produtos era HTML). */
export function parseSheet(text: string): SheetTable | null {
  if (/<\s*table[\s>]/i.test(text)) return parseHtmlTable(text);
  if (text.startsWith('PK')) return null; // .xlsx/.ods de verdade (ZIP) — não suportado
  return parseDelimited(text);
}

/** Lê o arquivo como texto. Tenta UTF-8 e, se o resultado tiver o "�" típico
 *  de acento quebrado, relê como ISO-8859-1 (Windows/Excel brasileiro). */
export async function readSheetFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('iso-8859-1').decode(buf);
}

/**
 * Casa os cabeçalhos da planilha com os campos do sistema.
 *
 * `aliases` mapeia cada campo aos nomes de coluna aceitos (comparados já
 * normalizados). Retorna, para cada campo encontrado, o índice da coluna —
 * então a ordem das colunas na planilha não importa, e colunas desconhecidas
 * são simplesmente ignoradas.
 */
export function mapColumns<K extends string>(
  headers: string[],
  aliases: Record<K, string[]>,
): Partial<Record<K, number>> {
  const norm = headers.map(normalizeHeader);
  const out: Partial<Record<K, number>> = {};
  (Object.keys(aliases) as K[]).forEach((field) => {
    const wanted = aliases[field].map(normalizeHeader);
    const idx = norm.findIndex((h) => wanted.includes(h));
    if (idx >= 0) out[field] = idx;
  });
  return out;
}

/** Valor de uma coluna mapeada nesta linha (string vazia vira undefined). */
export function cellAt(row: string[], idx?: number): string | undefined {
  if (idx == null) return undefined;
  const v = row[idx];
  return v && v.trim() ? v.trim() : undefined;
}
