/**
 * Leitura de planilhas para importação em massa — sem dependências externas.
 *
 * Formatos aceitos (cobrem o que os sistemas do setor exportam na prática):
 *  - **Tabela HTML** salva com extensão `.xls`/`.html` — é o que a maioria dos
 *    sistemas web exporta quando o botão diz "Excel"; o arquivo não é um
 *    binário do Excel, é um `<table>`. Foi o caso da planilha de produtos.
 *  - **CSV / TSV / texto separado por `;`** — separador detectado sozinho.
 *  - **XML** — tanto o "XML Planilha 2003" do Excel (SpreadsheetML: Workbook →
 *    Worksheet → Table → Row → Cell) quanto XML genérico de sistema, em que
 *    cada registro é um elemento repetido e cada campo, um filho dele.
 *
 * `.xlsx` de verdade (binário ZIP) NÃO é lido aqui: exigiria uma biblioteca
 * pesada só para isso. A tela de importação orienta a salvar como CSV ou XML.
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

/**
 * "XML Planilha 2003" do Excel (SpreadsheetML) — é o formato que o Excel
 * gera em "Salvar como → Planilha XML 2003" e que muitos sistemas exportam
 * como `.xml`. A estrutura é Worksheet → Table → Row → Cell → Data, e uma
 * célula pode declarar `ss:Index` para pular colunas vazias.
 */
function parseSpreadsheetMl(doc: Document): SheetTable | null {
  const rowEls = Array.from(doc.getElementsByTagName('*')).filter((el) => local(el) === 'row');
  if (!rowEls.length) return null;
  const all: string[][] = [];
  rowEls.forEach((tr) => {
    const cells: string[] = [];
    Array.from(tr.children)
      .filter((el) => local(el) === 'cell')
      .forEach((td) => {
        // ss:Index é 1-based e vale para a célula em que aparece.
        const idx = Number(attr(td, 'index'));
        if (Number.isFinite(idx) && idx > 0) while (cells.length < idx - 1) cells.push('');
        cells.push(cleanCell(td.textContent ?? ''));
      });
    if (cells.some((c) => c !== '')) all.push(cells);
  });
  if (!all.length) return null;
  const [headers, ...rows] = all;
  return { headers, rows };
}

/**
 * XML genérico de sistema: um elemento se repete (o registro) e cada filho
 * dele é um campo. Ex.: `<produtos><produto><nome>…</nome>…</produto>…`.
 * O cabeçalho vira a união dos nomes de campo encontrados, na ordem em que
 * aparecem — assim registros com campos faltando continuam alinhados.
 */
function parseRecordXml(doc: Document): SheetTable | null {
  const root = doc.documentElement;
  if (!root) return null;
  // Candidato a "registro": a tag que mais se repete como irmã e cujos
  // elementos têm filhos (os campos). Agrupa por nome da tag, somando as
  // ocorrências sob pais diferentes.
  const groups = new Map<string, Element[]>();
  const visit = (parent: Element) => {
    const byTag = new Map<string, Element[]>();
    Array.from(parent.children).forEach((el) => {
      const list = byTag.get(local(el)) ?? [];
      list.push(el);
      byTag.set(local(el), list);
    });
    byTag.forEach((list, tag) => {
      if (list.length > 1 && list.every((el) => el.children.length > 0)) {
        groups.set(tag, [...(groups.get(tag) ?? []), ...list]);
      }
      list.forEach(visit);
    });
  };
  visit(root);
  if (!groups.size) return null;
  const records = [...groups.values()].sort((a, b) => b.length - a.length)[0];

  const headers: string[] = [];
  records.forEach((rec) => {
    Array.from(rec.children).forEach((f) => {
      const tag = local(f);
      if (!headers.includes(tag)) headers.push(tag);
    });
  });
  const rows = records.map((rec) =>
    headers.map((h) => {
      const field = Array.from(rec.children).find((f) => local(f) === h);
      return cleanCell(field?.textContent ?? '');
    }),
  );
  return { headers, rows: rows.filter((r) => r.some((c) => c !== '')) };
}

/** Nome da tag sem o prefixo de namespace (`ss:Row` → `row`), minúsculo. */
function local(el: Element): string {
  return (el.localName || el.tagName).replace(/^.*:/, '').toLowerCase();
}

/** Atributo ignorando o prefixo de namespace (`ss:Index` → `index`). */
function attr(el: Element, name: string): string | null {
  const found = Array.from(el.attributes).find(
    (a) => a.name.replace(/^.*:/, '').toLowerCase() === name,
  );
  return found ? found.value : null;
}

function parseXml(text: string): SheetTable | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  return parseSpreadsheetMl(doc) ?? parseRecordXml(doc);
}

/** Lê o conteúdo de um arquivo de planilha, detectando o formato pelo conteúdo
 *  (não pela extensão — o `.xls` da planilha de produtos era HTML). */
export function parseSheet(text: string): SheetTable | null {
  const head = text.slice(0, 2000);
  if (text.startsWith('PK')) return null; // .xlsx/.ods de verdade (ZIP) — não suportado
  // XML vem antes do HTML porque o SpreadsheetML também tem <Table>, e o
  // parser de HTML transformaria as tags do Excel em algo irreconhecível.
  if (/^\s*<\?xml/i.test(head) || /<\s*(\w+:)?Workbook[\s>]/i.test(head)) {
    const xml = parseXml(text);
    if (xml && xml.rows.length) return xml;
  }
  if (/<\s*table[\s>]/i.test(text)) return parseHtmlTable(text);
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
 * normalizados). Retorna, para cada campo encontrado, os índices de TODAS as
 * colunas que servem — então a ordem das colunas não importa, colunas
 * desconhecidas são ignoradas, e um campo que aceita vários nomes aproveita
 * qualquer um deles. Isso importa quando a planilha traz as duas colunas
 * (CPF e CNPJ, telefone e celular): cada linha preenche uma e deixa a outra
 * vazia, e prender o campo à primeira coluna encontrada perderia metade dos
 * dados. Os índices vêm na ordem dos aliases (o mais provável primeiro).
 */
export function mapColumns<K extends string>(
  headers: string[],
  aliases: Record<K, string[]>,
): Partial<Record<K, number[]>> {
  const norm = headers.map(normalizeHeader);
  const out: Partial<Record<K, number[]>> = {};
  (Object.keys(aliases) as K[]).forEach((field) => {
    const found: number[] = [];
    aliases[field].map(normalizeHeader).forEach((wanted) => {
      norm.forEach((h, i) => { if (h === wanted && !found.includes(i)) found.push(i); });
    });
    if (found.length) out[field] = found;
  });
  return out;
}

/** Primeiro valor preenchido entre as colunas mapeadas para um campo
 *  (string vazia ou coluna ausente viram undefined). */
export function cellAt(row: string[], idxs?: number[]): string | undefined {
  if (!idxs) return undefined;
  for (const idx of idxs) {
    const v = row[idx];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}
