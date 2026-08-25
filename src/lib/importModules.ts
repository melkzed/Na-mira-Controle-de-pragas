/**
 * Importação por planilha — o que cada módulo sabe ler.
 *
 * `importSheet.ts` cuida de abrir o arquivo (HTML exportado como `.xls`, CSV,
 * TSV ou XML). Aqui fica a parte que muda de módulo para módulo: quais nomes
 * de coluna valem para cada campo, o que é obrigatório, como uma linha vira
 * um registro do domínio e como a planilha modelo é montada.
 *
 * A tela é sempre a mesma (`ImportDrawer`) — para dar importação a um módulo
 * novo, basta declarar a especificação aqui e passar a store para o drawer.
 *
 * Convenções dos aliases: escritos sem acento e em minúsculas (a comparação
 * usa `normalizeHeader`, que já tira acento, caixa e pontuação), do nome mais
 * provável para o menos provável — o primeiro que casar com um cabeçalho da
 * planilha vence.
 */
import type {
  BankAccount, CrmLead, Customer, Equipment, FinanceEntry, Pest,
  Product, ServiceType, TrapType, TreatedArea, User, Vehicle,
} from '@/domain/types';
import { cellAt, mapColumns, normalizeHeader, type SheetTable } from './importSheet';
import { toDateInputValue } from './date';

/** Uma linha da planilha, já casada com os campos do sistema. */
export type ImportValues = Record<string, string>;

export interface ImportFieldSpec {
  key: string;
  label: string;
  aliases: string[];
  /** Preenche a planilha modelo: cabeçalho e duas linhas de exemplo. Campos
   *  sem exemplo não entram no modelo (mas continuam sendo lidos). */
  sample?: [string, string];
}

export interface ImportSpec<T extends { id: string }> {
  /** Identificador do módulo — vira o nome do arquivo modelo. */
  key: string;
  title: string;
  /** Nome da entidade no singular e no plural, para as mensagens da tela. */
  entity: string;
  entityPlural: string;
  fields: ImportFieldSpec[];
  /** Campos sem os quais a linha não pode ser importada. */
  requiredFields: string[];
  /** Campo comparado para descobrir se o registro já existe. */
  matchField: string;
  /** Mesmo valor, lido de um registro já cadastrado. */
  keyOf: (item: T) => string;
  create: (v: ImportValues, ctx: { id: string; orgId: string }) => T;
  patch: (v: ImportValues) => Partial<T>;
  /** Aviso extra exibido na tela de importação deste módulo. */
  note?: string;
}

export interface ImportRow {
  values: ImportValues;
  /** Registro já cadastrado que esta linha atualiza (casado por `matchField`). */
  existingId?: string;
}

export interface ImportPreview {
  /** Campos reconhecidos no cabeçalho, na ordem em que aparecem na planilha. */
  mappedFields: ImportFieldSpec[];
  /** Cabeçalhos que o sistema não reconheceu (serão ignorados). */
  ignoredHeaders: string[];
  rows: ImportRow[];
  /** Linhas descartadas por não terem algum campo obrigatório. */
  skipped: number;
}

// ── Conversões ────────────────────────────────────────────────────────────

/** "R$ 1.234,56" → 1234.56 (formato brasileiro). */
export function parseNumber(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function parseInteger(raw?: string): number | undefined {
  const n = parseNumber(raw);
  return n == null ? undefined : Math.round(n);
}

/** "sim"/"s"/"1"/"ativo"/"true" → true; "não"/"n"/"0"/"inativo" → false. */
function parseBool(raw?: string): boolean | undefined {
  if (!raw) return undefined;
  const v = normalizeHeader(raw);
  if (['sim', 's', '1', 'true', 'ativo', 'ativa', 'x'].includes(v)) return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'inativa'].includes(v)) return false;
  return undefined;
}

/** Data em qualquer formato usual da planilha → ISO. Aceita 31/12/2026,
 *  2026-12-31 e 31-12-2026; ano com 2 dígitos vira 20xx. */
function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().split(' ')[0];
  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

/** Só os dígitos (CPF/CNPJ/CEP/telefone vêm formatados de qualquer jeito). */
function digits(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, '');
  return d || undefined;
}

/** Remove as chaves cujo valor ficou `undefined`, para o patch de atualização
 *  não apagar o que já estava preenchido no cadastro. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ── Leitura ───────────────────────────────────────────────────────────────

/**
 * Converte a planilha lida em linhas prontas para importar, já indicando
 * quais casam com registros existentes.
 */
export function previewImport<T extends { id: string }>(
  sheet: SheetTable,
  spec: ImportSpec<T>,
  existing: T[],
): ImportPreview {
  const aliases = Object.fromEntries(spec.fields.map((f) => [f.key, f.aliases])) as Record<string, string[]>;
  const cols = mapColumns(sheet.headers, aliases);
  const mappedIdx = new Set((Object.values(cols) as number[][]).flat());
  // Ordena os campos pela primeira coluna que cada um ocupa, para a
  // pré-visualização sair na mesma ordem da planilha.
  const firstIdx = (key: string) => cols[key]?.[0] ?? 0;
  const mappedFields = spec.fields
    .filter((f) => cols[f.key] != null)
    .sort((a, b) => firstIdx(a.key) - firstIdx(b.key));
  const ignoredHeaders = sheet.headers.filter((h, i) => h !== '' && !mappedIdx.has(i));

  const byKey = new Map(existing.map((item) => [normalizeHeader(spec.keyOf(item)), item.id]));
  const rows: ImportRow[] = [];
  let skipped = 0;

  sheet.rows.forEach((row) => {
    if (spec.requiredFields.some((f) => !cellAt(row, cols[f]))) { skipped += 1; return; }
    const values: ImportValues = {};
    mappedFields.forEach((f) => {
      const v = cellAt(row, cols[f.key]);
      if (v) values[f.key] = v;
    });
    rows.push({ values, existingId: matchOf(values, spec, byKey) });
  });

  return { mappedFields, ignoredHeaders, rows, skipped };
}

/** Id do registro já cadastrado que esta linha atualiza, se houver. */
export function matchOf<T extends { id: string }>(
  values: ImportValues,
  spec: ImportSpec<T>,
  byKey: Map<string, string>,
): string | undefined {
  const key = values[spec.matchField];
  return key ? byKey.get(normalizeHeader(key)) : undefined;
}

/** Índice "valor de comparação → id" dos registros já cadastrados. */
export function existingIndex<T extends { id: string }>(spec: ImportSpec<T>, existing: T[]): Map<string, string> {
  return new Map(existing.map((item) => [normalizeHeader(spec.keyOf(item)), item.id]));
}

/**
 * Conteúdo da planilha modelo (CSV com `;`, que o Excel brasileiro abre em
 * colunas direto). Só entram os campos com exemplo declarado.
 */
export function importTemplateCsv<T extends { id: string }>(spec: ImportSpec<T>): string {
  const cols = spec.fields.filter((f) => f.sample);
  const rows = [
    cols.map((c) => c.label.toUpperCase()),
    cols.map((c) => c.sample![0]),
    cols.map((c) => c.sample![1]),
  ];
  return rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
}

// ── Especificações por módulo ─────────────────────────────────────────────

export const customersImport: ImportSpec<Customer> = {
  key: 'clientes',
  title: 'Importar clientes de planilha',
  entity: 'cliente',
  entityPlural: 'clientes',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (c) => c.name,
  fields: [
    { key: 'name', label: 'Cliente', aliases: ['cliente', 'nome', 'nome do cliente', 'razao social', 'nome fantasia'], sample: ['Padaria Pão Quente', 'Maria Souza'] },
    { key: 'document', label: 'CPF/CNPJ', aliases: ['cnpj', 'cpf', 'cpf cnpj', 'cnpj cpf', 'documento'], sample: ['12.345.678/0001-90', '123.456.789-00'] },
    { key: 'phone', label: 'Telefone', aliases: ['telefone', 'fone', 'celular', 'whatsapp', 'contato', 'telefone 1'], sample: ['(11) 4002-8922', '(11) 99999-0000'] },
    { key: 'email', label: 'E-mail', aliases: ['email', 'e mail'], sample: ['contato@paoquente.com.br', 'maria@email.com'] },
    { key: 'cep', label: 'CEP', aliases: ['cep', 'codigo postal'], sample: ['01310-100', '04567-000'] },
    { key: 'street', label: 'Endereço', aliases: ['endereco', 'logradouro', 'rua'], sample: ['Av. Paulista', 'Rua das Flores'] },
    { key: 'number', label: 'Número', aliases: ['numero', 'n', 'nº', 'num'], sample: ['1000', '25'] },
    { key: 'complement', label: 'Complemento', aliases: ['complemento', 'compl'], sample: ['Loja 3', 'Apto 42'] },
    { key: 'district', label: 'Bairro', aliases: ['bairro'], sample: ['Bela Vista', 'Jardins'] },
    { key: 'city', label: 'Cidade', aliases: ['cidade', 'municipio'], sample: ['São Paulo', 'São Paulo'] },
    { key: 'state', label: 'UF', aliases: ['uf', 'estado'], sample: ['SP', 'SP'] },
    { key: 'propertyType', label: 'Tipo de imóvel', aliases: ['tipo de imovel', 'tipo do imovel', 'imovel', 'segmento'], sample: ['Comercial', 'Residencial'] },
    { key: 'areaM2', label: 'Área (m²)', aliases: ['area', 'area m2', 'metragem', 'm2'], sample: ['180', '90'] },
    { key: 'roomCount', label: 'Cômodos', aliases: ['comodos', 'quantidade de comodos', 'n de comodos'] },
    { key: 'type', label: 'Tipo', aliases: ['tipo', 'pessoa', 'pf pj'] },
    { key: 'notes', label: 'Observações', aliases: ['observacao', 'observacoes', 'obs', 'anotacoes'], sample: ['Atender antes das 8h', ''] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    // Sem coluna "Tipo", o CNPJ (14 dígitos) decide se é empresa ou pessoa física.
    type: customerType(v),
    name: v.name ?? '',
    tags: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    registrationTier: 'basico',
    ...customersImport.patch(v),
  }),
  patch: (v) => defined({
    name: v.name,
    document: digits(v.document),
    phone: v.phone,
    email: v.email,
    cep: digits(v.cep),
    street: v.street,
    number: v.number,
    complement: v.complement,
    district: v.district,
    city: v.city,
    state: v.state ? v.state.toUpperCase().slice(0, 2) : undefined,
    propertyType: v.propertyType,
    areaM2: parseNumber(v.areaM2),
    roomCount: parseInteger(v.roomCount),
    notes: v.notes,
  }),
};

function customerType(v: ImportValues): Customer['type'] {
  const declared = normalizeHeader(v.type ?? '');
  if (declared.startsWith('pj') || declared.includes('juridica') || declared.includes('empresa')) return 'pj';
  if (declared.startsWith('pf') || declared.includes('fisica')) return 'pf';
  return (digits(v.document) ?? '').length > 11 ? 'pj' : 'pf';
}

export const productsImport: ImportSpec<Product> = {
  key: 'produtos',
  title: 'Importar produtos de planilha',
  entity: 'produto',
  entityPlural: 'produtos',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (p) => p.name,
  fields: [
    { key: 'name', label: 'Produto', aliases: ['produto', 'nome', 'nome do produto', 'descricao'], sample: ['K-Othrine SC 25', 'Bloco Parafinado'] },
    { key: 'chemicalGroup', label: 'Grupo químico', aliases: ['grupo quimico', 'grupo'], sample: ['Piretróide', 'Cumarínico'] },
    { key: 'activeIngredient', label: 'Princípio ativo', aliases: ['principio ativo', 'ingrediente ativo', 'p ativo'], sample: ['Deltametrina 2,5%', 'Brodifacoum 0,005%'] },
    { key: 'diluent', label: 'Diluente', aliases: ['diluente', 'diluicao', 'veiculo'], sample: ['Água', 'Pronto para Uso'] },
    { key: 'registrationCode', label: 'Registro MS', aliases: ['registro ms', 'registro', 'registro ms anvisa', 'anvisa', 'n registro', 'numero de registro'], sample: ['3.0404.0031.001-0', '3.2398.0006.001-0'] },
    { key: 'antidote', label: 'Antídoto', aliases: ['antidoto'], sample: ['', 'Vitamina K1'] },
    { key: 'treatment', label: 'Tratamento', aliases: ['tratamento', 'conduta', 'primeiros socorros'], sample: ['Sintomático', 'Tratamento sintomático'] },
    { key: 'manufacturer', label: 'Fabricante', aliases: ['fabricante', 'marca'] },
    { key: 'applicationType', label: 'Tipo de aplicação', aliases: ['tipo de aplicacao', 'aplicacao', 'forma de uso'] },
    { key: 'dosage', label: 'Dosagem', aliases: ['dosagem', 'dose', 'concentracao de uso'] },
    { key: 'unit', label: 'Unidade', aliases: ['unidade', 'un', 'medida'] },
    { key: 'price', label: 'Preço', aliases: ['preco', 'valor', 'preco unitario'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    unit: v.unit ?? 'un',
    minQuantity: 0,
    price: parseNumber(v.price) ?? 0,
    isRegulated: false,
    isActive: true,
    reportLabel: 'principio_ativo',
    ...productsImport.patch(v),
  }),
  patch: (v) => defined({
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
    unit: v.unit,
    price: parseNumber(v.price),
  }),
};

export const serviceTypesImport: ImportSpec<ServiceType> = {
  key: 'servicos',
  title: 'Importar serviços de planilha',
  entity: 'serviço',
  entityPlural: 'serviços',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (s) => s.name,
  fields: [
    { key: 'name', label: 'Serviço', aliases: ['servico', 'nome', 'nome do servico', 'descricao'], sample: ['Dedetização', 'Desratização'] },
    { key: 'defaultPrice', label: 'Preço', aliases: ['preco', 'valor', 'preco padrao'], sample: ['250,00', '320,00'] },
    { key: 'defaultDurationMin', label: 'Duração (min)', aliases: ['duracao', 'duracao min', 'duracao minutos', 'tempo'], sample: ['60', '90'] },
    { key: 'defaultValidityDays', label: 'Validade (dias)', aliases: ['validade', 'validade dias', 'garantia'], sample: ['180', '180'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    defaultDurationMin: parseInteger(v.defaultDurationMin) ?? 60,
    defaultPrice: parseNumber(v.defaultPrice) ?? 0,
    color: '#2563eb',
    isActive: true,
    ...serviceTypesImport.patch(v),
  }),
  patch: (v) => defined({
    name: v.name,
    defaultPrice: parseNumber(v.defaultPrice),
    defaultDurationMin: parseInteger(v.defaultDurationMin),
    defaultValidityDays: parseInteger(v.defaultValidityDays),
  }),
};

export const equipmentImport: ImportSpec<Equipment> = {
  key: 'equipamentos',
  title: 'Importar equipamentos de planilha',
  entity: 'equipamento',
  entityPlural: 'equipamentos',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (e) => e.name,
  fields: [
    { key: 'name', label: 'Equipamento', aliases: ['equipamento', 'nome', 'descricao'], sample: ['Pulverizador Costal 20L', 'Termonebulizador'] },
    { key: 'code', label: 'Código', aliases: ['codigo', 'cod'], sample: ['PUL-001', 'TER-002'] },
    { key: 'assetNumber', label: 'Patrimônio', aliases: ['patrimonio', 'n patrimonio', 'numero de patrimonio'], sample: ['00123', '00124'] },
    { key: 'kind', label: 'Tipo', aliases: ['tipo', 'categoria'], sample: ['Pulverizador', 'Nebulizador'] },
    { key: 'notes', label: 'Observações', aliases: ['observacao', 'observacoes', 'obs'], sample: ['', ''] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    status: 'disponivel',
    ...equipmentImport.patch(v),
  }),
  patch: (v) => defined({ name: v.name, code: v.code, assetNumber: v.assetNumber, kind: v.kind, notes: v.notes }),
};

export const vehiclesImport: ImportSpec<Vehicle> = {
  key: 'veiculos',
  title: 'Importar veículos de planilha',
  entity: 'veículo',
  entityPlural: 'veículos',
  requiredFields: ['plate'],
  matchField: 'plate',
  keyOf: (v) => v.plate,
  fields: [
    { key: 'plate', label: 'Placa', aliases: ['placa'], sample: ['ABC1D23', 'XYZ4E56'] },
    { key: 'model', label: 'Modelo', aliases: ['modelo', 'veiculo', 'carro'], sample: ['Fiat Fiorino', 'Renault Kangoo'] },
    { key: 'odometerKm', label: 'Odômetro (km)', aliases: ['km', 'odometro', 'quilometragem', 'hodometro'], sample: ['48000', '61250'] },
    { key: 'isActive', label: 'Ativo', aliases: ['ativo', 'situacao', 'status'], sample: ['Sim', 'Sim'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    plate: (v.plate ?? '').toUpperCase(),
    odometerKm: parseNumber(v.odometerKm) ?? 0,
    isActive: parseBool(v.isActive) ?? true,
    ...vehiclesImport.patch(v),
  }),
  patch: (v) => defined({
    plate: v.plate ? v.plate.toUpperCase() : undefined,
    model: v.model,
    odometerKm: parseNumber(v.odometerKm),
    isActive: parseBool(v.isActive),
  }),
};

export const techniciansImport: ImportSpec<User> = {
  key: 'tecnicos',
  title: 'Importar técnicos de planilha',
  entity: 'técnico',
  entityPlural: 'técnicos',
  requiredFields: ['name', 'email'],
  matchField: 'email',
  keyOf: (u) => u.email,
  note: 'Com o sistema conectado ao banco, cada técnico importado recebe um e-mail para criar a própria senha — por isso o e-mail é obrigatório.',
  fields: [
    { key: 'name', label: 'Nome', aliases: ['nome', 'tecnico', 'funcionario', 'nome completo'], sample: ['Diego Martins', 'Ana Ribeiro'] },
    { key: 'email', label: 'E-mail', aliases: ['email', 'e mail'], sample: ['diego@namira.com', 'ana@namira.com'] },
    { key: 'phone', label: 'Telefone', aliases: ['telefone', 'fone', 'celular', 'whatsapp'], sample: ['(11) 98888-0001', '(11) 98888-0002'] },
    { key: 'isActive', label: 'Ativo', aliases: ['ativo', 'situacao', 'status'], sample: ['Sim', 'Sim'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    email: (v.email ?? '').toLowerCase(),
    phone: v.phone,
    role: 'tecnico',
    isActive: parseBool(v.isActive) ?? true,
    fieldAppAccess: true,
  }),
  patch: (v) => defined({ name: v.name, phone: v.phone, isActive: parseBool(v.isActive) }),
};

export const pestsImport: ImportSpec<Pest> = {
  key: 'pragas',
  title: 'Importar pragas de planilha',
  entity: 'praga',
  entityPlural: 'pragas',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (p) => p.name,
  fields: [
    { key: 'name', label: 'Praga', aliases: ['praga', 'nome', 'descricao'], sample: ['Barata Alemã', 'Rato de telhado'] },
    { key: 'category', label: 'Categoria', aliases: ['categoria', 'tipo', 'grupo'], sample: ['Rasteira', 'Roedor'] },
    { key: 'defaultWarrantyDays', label: 'Garantia (dias)', aliases: ['garantia', 'garantia dias'], sample: ['90', '90'] },
    { key: 'defaultValidityDays', label: 'Validade (dias)', aliases: ['validade', 'validade dias', 'validade do combate'], sample: ['180', '180'] },
    { key: 'notes', label: 'Observações', aliases: ['observacao', 'observacoes', 'obs', 'descricao tecnica'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    isActive: true,
    ...pestsImport.patch(v),
  }),
  patch: (v) => defined({
    name: v.name,
    category: v.category,
    defaultWarrantyDays: parseInteger(v.defaultWarrantyDays),
    defaultValidityDays: parseInteger(v.defaultValidityDays),
    notes: v.notes,
  }),
};

export const areasImport: ImportSpec<TreatedArea> = {
  key: 'areas',
  title: 'Importar áreas tratadas de planilha',
  entity: 'área',
  entityPlural: 'áreas',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (a) => a.name,
  fields: [
    { key: 'name', label: 'Área', aliases: ['area', 'nome', 'local', 'ambiente', 'descricao'], sample: ['Cozinha', 'Depósito'] },
    { key: 'notes', label: 'Observações', aliases: ['observacao', 'observacoes', 'obs'], sample: ['', ''] },
  ],
  create: (v, ctx) => ({ id: ctx.id, orgId: ctx.orgId, name: v.name ?? '', isActive: true, ...areasImport.patch(v) }),
  patch: (v) => defined({ name: v.name, notes: v.notes }),
};

export const trapTypesImport: ImportSpec<TrapType> = {
  key: 'tipos-de-armadilha',
  title: 'Importar tipos de armadilha de planilha',
  entity: 'tipo de armadilha',
  entityPlural: 'tipos de armadilha',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (t) => t.name,
  fields: [
    { key: 'name', label: 'Tipo de armadilha', aliases: ['tipo de armadilha', 'armadilha', 'tipo', 'nome', 'descricao'], sample: ['PCO — Porta-isca', 'Luminosa'] },
  ],
  create: (v, ctx) => ({ id: ctx.id, orgId: ctx.orgId, name: v.name ?? '', isActive: true }),
  patch: (v) => defined({ name: v.name }),
};

export const financeImport: ImportSpec<FinanceEntry> = {
  key: 'financeiro',
  title: 'Importar lançamentos de planilha',
  entity: 'lançamento',
  entityPlural: 'lançamentos',
  requiredFields: ['description'],
  matchField: 'description',
  keyOf: (e) => `${e.description} ${e.dueDate ?? ''}`,
  note: 'Lançamentos são sempre criados como novos — a importação não sobrescreve o que já está no financeiro.',
  fields: [
    { key: 'description', label: 'Descrição', aliases: ['descricao', 'historico', 'lancamento', 'referente'], sample: ['Dedetização — Padaria Pão Quente', 'Aluguel do galpão'] },
    { key: 'amount', label: 'Valor', aliases: ['valor', 'preco', 'total'], sample: ['250,00', '3.500,00'] },
    { key: 'type', label: 'Tipo', aliases: ['tipo', 'natureza', 'receita despesa', 'entrada saida'], sample: ['Receita', 'Despesa'] },
    { key: 'dueDate', label: 'Vencimento', aliases: ['vencimento', 'data', 'data de vencimento', 'venc'], sample: ['10/09/2026', '05/09/2026'] },
    { key: 'paidAt', label: 'Pagamento', aliases: ['pagamento', 'data de pagamento', 'pago em', 'baixa'], sample: ['', ''] },
    { key: 'status', label: 'Situação', aliases: ['situacao', 'status', 'pago'], sample: ['Pendente', 'Pendente'] },
  ],
  create: (v, ctx) => {
    const paidAt = parseDate(v.paidAt);
    return {
      id: ctx.id,
      orgId: ctx.orgId,
      type: financeType(v),
      status: paidAt ? 'pago' : financeStatus(v),
      description: v.description ?? '',
      amount: parseNumber(v.amount) ?? 0,
      dueDate: parseDate(v.dueDate) ?? toDateInputValue(new Date()),
      paidAt,
      createdAt: new Date().toISOString(),
    };
  },
  patch: (v) => defined({
    description: v.description,
    amount: parseNumber(v.amount),
    dueDate: parseDate(v.dueDate),
    paidAt: parseDate(v.paidAt),
  }),
};

function financeType(v: ImportValues): FinanceEntry['type'] {
  const t = normalizeHeader(v.type ?? '');
  if (t.includes('desp') || t.includes('saida') || t.includes('pagar') || t.includes('custo')) return 'despesa';
  if (t.includes('rec') || t.includes('entrada') || t.includes('receber') || t.includes('venda')) return 'receita';
  // Sem coluna de tipo, valor negativo é despesa.
  return (parseNumber(v.amount) ?? 0) < 0 ? 'despesa' : 'receita';
}

function financeStatus(v: ImportValues): FinanceEntry['status'] {
  const s = normalizeHeader(v.status ?? '');
  if (s.includes('pago') || s.includes('quitado') || s === 'sim') return 'pago';
  if (s.includes('cancel')) return 'cancelado';
  if (s.includes('atras') || s.includes('vencid')) return 'atrasado';
  return 'pendente';
}

export const leadsImport: ImportSpec<CrmLead> = {
  key: 'oportunidades',
  title: 'Importar oportunidades de planilha',
  entity: 'oportunidade',
  entityPlural: 'oportunidades',
  requiredFields: ['name'],
  matchField: 'name',
  keyOf: (l) => l.name,
  fields: [
    { key: 'name', label: 'Contato', aliases: ['nome', 'contato', 'cliente', 'lead'], sample: ['João Pereira', 'Marcia Alves'] },
    { key: 'company', label: 'Empresa', aliases: ['empresa', 'razao social', 'estabelecimento'], sample: ['Mercado Central', 'Clínica Vida'] },
    { key: 'phone', label: 'Telefone', aliases: ['telefone', 'fone', 'celular', 'whatsapp', 'contato telefone'], sample: ['(11) 97777-0001', '(11) 97777-0002'] },
    { key: 'email', label: 'E-mail', aliases: ['email', 'e mail'], sample: ['joao@mercado.com', 'marcia@clinicavida.com'] },
    { key: 'source', label: 'Origem', aliases: ['origem', 'canal', 'como conheceu'], sample: ['Indicação', 'Google'] },
    { key: 'estimatedValue', label: 'Valor estimado', aliases: ['valor', 'valor estimado', 'orcamento', 'ticket'], sample: ['1.200,00', '800,00'] },
    { key: 'notes', label: 'Observações', aliases: ['observacao', 'observacoes', 'obs', 'anotacoes'], sample: ['', ''] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    name: v.name ?? '',
    stage: 'novo_contato',
    createdAt: new Date().toISOString(),
    ...leadsImport.patch(v),
  }),
  patch: (v) => defined({
    name: v.name,
    company: v.company,
    phone: v.phone,
    email: v.email,
    source: v.source,
    estimatedValue: parseNumber(v.estimatedValue),
    notes: v.notes,
  }),
};

export const bankAccountsImport: ImportSpec<BankAccount> = {
  key: 'contas-bancarias',
  title: 'Importar contas bancárias de planilha',
  entity: 'conta',
  entityPlural: 'contas',
  requiredFields: ['bank'],
  matchField: 'account',
  keyOf: (b) => b.account,
  fields: [
    { key: 'bank', label: 'Banco', aliases: ['banco', 'instituicao'], sample: ['Banco do Brasil', 'Nubank'] },
    { key: 'agency', label: 'Agência', aliases: ['agencia', 'ag'], sample: ['1234-5', '0001'] },
    { key: 'account', label: 'Conta', aliases: ['conta', 'conta corrente', 'numero da conta', 'cc'], sample: ['98765-4', '1122334-5'] },
    { key: 'alias', label: 'Apelido', aliases: ['apelido', 'descricao', 'identificacao'], sample: ['Conta principal', 'Conta reserva'] },
    { key: 'openingBalance', label: 'Saldo inicial', aliases: ['saldo', 'saldo inicial', 'saldo de abertura'], sample: ['10.000,00', '0,00'] },
  ],
  create: (v, ctx) => ({
    id: ctx.id,
    orgId: ctx.orgId,
    bank: v.bank ?? '',
    account: v.account ?? '',
    openingBalance: parseNumber(v.openingBalance) ?? 0,
    isActive: true,
    ...bankAccountsImport.patch(v),
  }),
  patch: (v) => defined({
    bank: v.bank,
    agency: v.agency,
    account: v.account,
    alias: v.alias,
    openingBalance: parseNumber(v.openingBalance),
  }),
};
