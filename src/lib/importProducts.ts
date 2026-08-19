/**
 * Importação de produtos a partir de planilha (ver `importSheet.ts` para a
 * leitura do arquivo em si).
 *
 * O mapeamento abaixo foi montado a partir da planilha real da empresa
 * (`PRODUTO | GRUPO QUIMICO | PRINCIPIO ATIVO | DILUENTE | REGISTRO MS |
 * ANTIDOTO | TRATAMENTO`), mas aceita variações comuns de nome de coluna e
 * ignora a ordem — o que importa é o cabeçalho, não a posição. Colunas que o
 * sistema não conhece são simplesmente descartadas.
 */
import type { Product } from '@/domain/types';
import { cellAt, mapColumns, normalizeHeader, type SheetTable } from './importSheet';

/** Campos de produto que a importação sabe preencher. */
export type ProductField =
  | 'name' | 'chemicalGroup' | 'activeIngredient' | 'diluent'
  | 'registrationCode' | 'antidote' | 'treatment'
  | 'manufacturer' | 'applicationType' | 'dosage' | 'unit' | 'price';

/** Nomes de coluna aceitos para cada campo (comparação sem acento/caixa). */
export const PRODUCT_COLUMN_ALIASES: Record<ProductField, string[]> = {
  name: ['produto', 'nome', 'nome do produto', 'descricao', 'descrição'],
  chemicalGroup: ['grupo quimico', 'grupo químico', 'grupo'],
  activeIngredient: ['principio ativo', 'princípio ativo', 'ingrediente ativo', 'p ativo'],
  diluent: ['diluente', 'diluicao', 'diluição', 'veiculo', 'veículo'],
  registrationCode: ['registro ms', 'registro', 'registro ms anvisa', 'anvisa', 'n registro', 'numero de registro'],
  antidote: ['antidoto', 'antídoto'],
  treatment: ['tratamento', 'conduta', 'primeiros socorros'],
  manufacturer: ['fabricante', 'marca'],
  applicationType: ['tipo de aplicacao', 'tipo de aplicação', 'aplicacao', 'aplicação', 'forma de uso'],
  dosage: ['dosagem', 'dose', 'concentracao de uso', 'concentração de uso'],
  unit: ['unidade', 'un', 'medida'],
  price: ['preco', 'preço', 'valor', 'preco unitario', 'preço unitário'],
};

/** Rótulo amigável de cada campo — usado na pré-visualização da importação. */
export const PRODUCT_FIELD_LABEL: Record<ProductField, string> = {
  name: 'Produto', chemicalGroup: 'Grupo químico', activeIngredient: 'Princípio ativo',
  diluent: 'Diluente', registrationCode: 'Registro MS', antidote: 'Antídoto',
  treatment: 'Tratamento', manufacturer: 'Fabricante', applicationType: 'Tipo de aplicação',
  dosage: 'Dosagem', unit: 'Unidade', price: 'Preço',
};

/** Uma linha da planilha já convertida — `existing` marca o produto que será
 *  atualizado no lugar de criar um novo (casado pelo nome). */
export interface ParsedProductRow {
  values: Partial<Record<ProductField, string>>;
  existingId?: string;
}

export interface ProductImportPreview {
  /** Campos reconhecidos no cabeçalho, na ordem em que aparecem na planilha. */
  mappedFields: ProductField[];
  /** Cabeçalhos que o sistema não reconheceu (serão ignorados). */
  ignoredHeaders: string[];
  rows: ParsedProductRow[];
  /** Linhas descartadas por não terem o nome do produto. */
  skipped: number;
}

function parsePrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  // "R$ 1.234,56" → 1234.56 (formato brasileiro).
  const n = Number(raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Converte a planilha lida em linhas prontas para importar, já indicando
 * quais casam com produtos existentes (comparação por nome, sem acento/caixa).
 */
export function previewProductImport(sheet: SheetTable, existing: Product[]): ProductImportPreview {
  const cols = mapColumns(sheet.headers, PRODUCT_COLUMN_ALIASES);
  const mappedIdx = new Set(Object.values(cols) as number[]);
  const mappedFields = (Object.keys(cols) as ProductField[])
    .sort((a, b) => (cols[a] ?? 0) - (cols[b] ?? 0));
  const ignoredHeaders = sheet.headers.filter((h, i) => h !== '' && !mappedIdx.has(i));

  const byName = new Map(existing.map((p) => [normalizeHeader(p.name), p.id]));
  const rows: ParsedProductRow[] = [];
  let skipped = 0;

  sheet.rows.forEach((row) => {
    const name = cellAt(row, cols.name);
    if (!name) { skipped += 1; return; }
    const values: Partial<Record<ProductField, string>> = {};
    mappedFields.forEach((f) => {
      const v = cellAt(row, cols[f]);
      if (v) values[f] = v;
    });
    rows.push({ values, existingId: byName.get(normalizeHeader(name)) });
  });

  return { mappedFields, ignoredHeaders, rows, skipped };
}

/** Converte uma linha da pré-visualização nos campos de `Product`. */
export function toProductPatch(v: Partial<Record<ProductField, string>>): Partial<Product> {
  return {
    name: v.name,
    chemicalGroup: v.chemicalGroup,
    activeIngredient: v.activeIngredient,
    diluent: v.diluent,
    registrationCode: v.registrationCode,
    antidote: v.antidote,
    treatment: v.treatment,
    manufacturer: v.manufacturer,
    applicationType: v.applicationType,
    dosage: v.dosage,
    ...(v.unit ? { unit: v.unit } : {}),
    ...(parsePrice(v.price) != null ? { price: parsePrice(v.price) } : {}),
  };
}
