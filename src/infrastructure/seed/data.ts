/**
 * Infraestrutura — dados de exemplo (seed).
 * Gera um dataset coeso e realista relativo à data atual, para que a agenda,
 * dashboards e relatórios sempre apareçam populados no modo standalone.
 *
 * Substituível pela fonte Supabase (ver src/infrastructure/repositories).
 */
import type {
  Appointment,
  CrmLead,
  Customer,
  Equipment,
  FinanceEntry,
  Invoice,
  License,
  Pest,
  Product,
  ProductCategory,
  ServiceOrder,
  ServiceType,
  NonConformity,
  StockBalance,
  StockLocation,
  Supplier,
  Team,
  TrapDevice,
  TrapInspection,
  User,
  Vehicle,
} from '@/domain/types';

const ORG = 'org-namira';

function iso(date: Date): string {
  return date.toISOString();
}

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return iso(d);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return iso(d);
}

// ── Usuários / equipe ──────────────────────────────────────────────────────
export const users: User[] = [
  { id: 'u-admin', orgId: ORG, name: 'Marina Duarte', email: 'marina@namira.com', role: 'admin', isActive: true, phone: '(11) 99999-0001' },
  { id: 'u-sup', orgId: ORG, name: 'Rafael Nunes', email: 'rafael@namira.com', role: 'supervisor', isActive: true, phone: '(11) 99999-0002' },
  { id: 'u-fin', orgId: ORG, name: 'Camila Reis', email: 'camila@namira.com', role: 'financeiro', isActive: true, phone: '(11) 99999-0003' },
  { id: 'u-t1', orgId: ORG, name: 'Diego Almeida', email: 'diego@namira.com', role: 'tecnico', isActive: true, phone: '(11) 98888-1001' },
  { id: 'u-t2', orgId: ORG, name: 'Bruno Carvalho', email: 'bruno@namira.com', role: 'tecnico', isActive: true, phone: '(11) 98888-1002' },
  { id: 'u-t3', orgId: ORG, name: 'Paula Freitas', email: 'paula@namira.com', role: 'tecnico', isActive: true, phone: '(11) 98888-1003' },
  { id: 'u-t4', orgId: ORG, name: 'Lucas Moreira', email: 'lucas@namira.com', role: 'tecnico', isActive: true, phone: '(11) 98888-1004' },
];

export const technicians = users.filter((u) => u.role === 'tecnico');

export const teams: Team[] = [
  { id: 'team-a', orgId: ORG, name: 'Equipe Alfa', leaderId: 'u-t1', color: '#10b981', memberIds: ['u-t1', 'u-t2'] },
  { id: 'team-b', orgId: ORG, name: 'Equipe Beta', leaderId: 'u-t3', color: '#6366f1', memberIds: ['u-t3', 'u-t4'] },
];

// ── Catálogos ───────────────────────────────────────────────────────────────
export const serviceTypes: ServiceType[] = [
  { id: 'st-ded', orgId: ORG, name: 'Dedetização', defaultDurationMin: 90, defaultPrice: 320, color: '#10b981', defaultProducts: [{ productId: 'prod-1', qty: 1 }, { productId: 'prod-3', qty: 2 }, { productId: 'prod-7', qty: 1 }] },
  { id: 'st-des', orgId: ORG, name: 'Desratização', defaultDurationMin: 75, defaultPrice: 280, color: '#6366f1', defaultProducts: [{ productId: 'prod-2', qty: 2 }, { productId: 'prod-7', qty: 1 }] },
  { id: 'st-san', orgId: ORG, name: 'Sanitização', defaultDurationMin: 60, defaultPrice: 240, color: '#0ea5e9', defaultProducts: [{ productId: 'prod-5', qty: 3 }, { productId: 'prod-6', qty: 1 }] },
  { id: 'st-cup', orgId: ORG, name: 'Descupinização', defaultDurationMin: 120, defaultPrice: 540, color: '#f59e0b', defaultProducts: [{ productId: 'prod-4', qty: 1 }] },
  { id: 'st-esc', orgId: ORG, name: 'Escorpião/Aranha', defaultDurationMin: 80, defaultPrice: 360, color: '#ef4444', defaultProducts: [{ productId: 'prod-1', qty: 1 }] },
];

export const pests: Pest[] = [
  { id: 'p-bar', orgId: ORG, name: 'Baratas' },
  { id: 'p-rat', orgId: ORG, name: 'Ratos' },
  { id: 'p-cup', orgId: ORG, name: 'Cupins' },
  { id: 'p-for', orgId: ORG, name: 'Formigas' },
  { id: 'p-mos', orgId: ORG, name: 'Mosquitos' },
  { id: 'p-esc', orgId: ORG, name: 'Escorpiões' },
  { id: 'p-ara', orgId: ORG, name: 'Aranhas' },
  { id: 'p-pul', orgId: ORG, name: 'Pulgas' },
];

export const suppliers: Supplier[] = [
  { id: 'sup-1', orgId: ORG, name: 'BioControl Distribuidora', document: '12.345.678/0001-90', phone: '(11) 3000-1000' },
  { id: 'sup-2', orgId: ORG, name: 'AgroPrag Insumos', document: '98.765.432/0001-10', phone: '(11) 3000-2000' },
];

export const productCategories: ProductCategory[] = [
  { id: 'cat-ins', orgId: ORG, name: 'Inseticidas' },
  { id: 'cat-rod', orgId: ORG, name: 'Rodenticidas' },
  { id: 'cat-cup', orgId: ORG, name: 'Cupinicidas' },
  { id: 'cat-san', orgId: ORG, name: 'Sanitizantes' },
  { id: 'cat-epi', orgId: ORG, name: 'EPIs / Insumos' },
];

export const products: Product[] = [
  { id: 'prod-1', orgId: ORG, name: 'K-Othrine SC 25', categoryId: 'cat-ins', manufacturer: 'Bayer', supplierId: 'sup-1', registrationCode: 'MS 3.0294.0001', activeIngredient: 'Deltametrina', applicationType: 'Pulverização', dosage: '20ml/L', unit: 'L', minQuantity: 5, price: 189.9, isRegulated: true, isActive: true, storageLocation: 'A1', batches: [{ id: 'b-1a', code: 'KO-2408', expiresAt: daysFromNow(52), quantity: 10, receivedAt: daysFromNow(-20) }, { id: 'b-1b', code: 'KO-2312', expiresAt: daysFromNow(140), quantity: 6, receivedAt: daysFromNow(-70) }] },
  { id: 'prod-2', orgId: ORG, name: 'Klerat Blocos', categoryId: 'cat-rod', manufacturer: 'Syngenta', supplierId: 'sup-1', registrationCode: 'MS 2.0154.0002', activeIngredient: 'Brodifacoum', applicationType: 'Isca', dosage: '1 bloco/PEA', unit: 'kg', minQuantity: 3, price: 96.5, isRegulated: true, isActive: true, storageLocation: 'B2', batches: [{ id: 'b-2a', code: 'KL-2401', expiresAt: daysFromNow(9), quantity: 2, receivedAt: daysFromNow(-90) }] },
  { id: 'prod-3', orgId: ORG, name: 'Fipronil Gel Barata', categoryId: 'cat-ins', manufacturer: 'BASF', supplierId: 'sup-2', registrationCode: 'MS 3.1055.0007', activeIngredient: 'Fipronil', applicationType: 'Gel', dosage: 'pontos de 0,5g', unit: 'un', minQuantity: 10, price: 74.0, isRegulated: true, isActive: true, storageLocation: 'A3', batches: [{ id: 'b-3a', code: 'FG-2405', expiresAt: daysFromNow(18), quantity: 6, receivedAt: daysFromNow(-30) }, { id: 'b-3b', code: 'FG-2502', expiresAt: daysFromNow(150), quantity: 18, receivedAt: daysFromNow(-5) }] },
  { id: 'prod-4', orgId: ORG, name: 'Premise 200 SC', categoryId: 'cat-cup', manufacturer: 'Bayer', supplierId: 'sup-1', registrationCode: 'MS 3.0294.0033', activeIngredient: 'Imidacloprido', applicationType: 'Injeção', dosage: '10ml/L', unit: 'L', minQuantity: 4, price: 264.0, isRegulated: true, isActive: true, storageLocation: 'C1' },
  { id: 'prod-5', orgId: ORG, name: 'Quaternário de Amônio 5ª', categoryId: 'cat-san', manufacturer: 'Start Química', supplierId: 'sup-2', activeIngredient: 'Cloreto de benzalcônio', applicationType: 'Atomização', dosage: '10ml/L', unit: 'L', minQuantity: 8, price: 58.0, isRegulated: false, isActive: true, storageLocation: 'D2', batches: [{ id: 'b-5a', code: 'QA-2312', expiresAt: daysFromNow(-4), quantity: 4, receivedAt: daysFromNow(-200) }, { id: 'b-5b', code: 'QA-2504', expiresAt: daysFromNow(200), quantity: 30, receivedAt: daysFromNow(-10) }] },
  { id: 'prod-6', orgId: ORG, name: 'Máscara PFF2 (cx 50)', categoryId: 'cat-epi', manufacturer: '3M', supplierId: 'sup-2', unit: 'cx', minQuantity: 2, price: 120.0, isRegulated: false, isActive: true, storageLocation: 'E1' },
  { id: 'prod-7', orgId: ORG, name: 'Luva Nitrílica (par)', categoryId: 'cat-epi', manufacturer: 'Volk', supplierId: 'sup-2', unit: 'par', minQuantity: 20, price: 9.5, isRegulated: false, isActive: true, storageLocation: 'E2' },
];

// ── Estoque em dois níveis ───────────────────────────────────────────────────
export const stockLocations: StockLocation[] = [
  { id: 'loc-central', orgId: ORG, kind: 'central', name: 'Estoque Central' },
  { id: 'loc-t1', orgId: ORG, kind: 'tecnico', name: 'Estoque · Diego Almeida', ownerId: 'u-t1' },
  { id: 'loc-t2', orgId: ORG, kind: 'tecnico', name: 'Estoque · Bruno Carvalho', ownerId: 'u-t2' },
  { id: 'loc-t3', orgId: ORG, kind: 'tecnico', name: 'Estoque · Paula Freitas', ownerId: 'u-t3' },
  { id: 'loc-t4', orgId: ORG, kind: 'tecnico', name: 'Estoque · Lucas Moreira', ownerId: 'u-t4' },
];

export const stockBalances: StockBalance[] = [
  // Central — alguns abaixo do mínimo de propósito (alertas)
  { id: 'sb-1', locationId: 'loc-central', productId: 'prod-1', quantity: 18 },
  { id: 'sb-2', locationId: 'loc-central', productId: 'prod-2', quantity: 2 }, // baixo
  { id: 'sb-3', locationId: 'loc-central', productId: 'prod-3', quantity: 24 },
  { id: 'sb-4', locationId: 'loc-central', productId: 'prod-4', quantity: 3 }, // no limite
  { id: 'sb-5', locationId: 'loc-central', productId: 'prod-5', quantity: 40 },
  { id: 'sb-6', locationId: 'loc-central', productId: 'prod-6', quantity: 1 }, // baixo
  { id: 'sb-7', locationId: 'loc-central', productId: 'prod-7', quantity: 60 },
  // Técnicos
  { id: 'sb-t1-1', locationId: 'loc-t1', productId: 'prod-1', quantity: 4 },
  { id: 'sb-t1-3', locationId: 'loc-t1', productId: 'prod-3', quantity: 6 },
  { id: 'sb-t1-7', locationId: 'loc-t1', productId: 'prod-7', quantity: 8 },
  { id: 'sb-t2-2', locationId: 'loc-t2', productId: 'prod-2', quantity: 3 },
  { id: 'sb-t2-5', locationId: 'loc-t2', productId: 'prod-5', quantity: 5 },
  { id: 'sb-t3-4', locationId: 'loc-t3', productId: 'prod-4', quantity: 2 },
  { id: 'sb-t3-1', locationId: 'loc-t3', productId: 'prod-1', quantity: 2 },
  { id: 'sb-t4-3', locationId: 'loc-t4', productId: 'prod-3', quantity: 5 },
];

// Lotes vencendo / vencidos (para alertas do dashboard)
export const batchExpiry: { productId: string; batchCode: string; expiresAt: string; qty: number }[] = [
  { productId: 'prod-3', batchCode: 'FG-2405', expiresAt: daysFromNow(18), qty: 6 },
  { productId: 'prod-5', batchCode: 'QA-2312', expiresAt: daysFromNow(-4), qty: 4 }, // vencido
  { productId: 'prod-1', batchCode: 'KO-2408', expiresAt: daysFromNow(52), qty: 10 },
  { productId: 'prod-2', batchCode: 'KL-2401', expiresAt: daysFromNow(9), qty: 2 }, // vencendo
];

// ── Equipamentos e veículos ──────────────────────────────────────────────────
export const equipment: Equipment[] = [
  { id: 'eq-1', orgId: ORG, name: 'Pulverizador Costal 20L', code: 'PC-01', assetNumber: 'PAT-1001', kind: 'Pulverizador', status: 'em_uso', assignedTo: 'u-t1' },
  { id: 'eq-2', orgId: ORG, name: 'Pulverizador Costal 20L', code: 'PC-02', assetNumber: 'PAT-1002', kind: 'Pulverizador', status: 'disponivel' },
  { id: 'eq-3', orgId: ORG, name: 'Termonebulizador', code: 'TN-01', assetNumber: 'PAT-1010', kind: 'Nebulizador', status: 'manutencao', nextMaintenanceAt: daysFromNow(6) },
  { id: 'eq-4', orgId: ORG, name: 'Bomba de Injeção Cupim', code: 'BI-01', assetNumber: 'PAT-1020', kind: 'Bomba', status: 'em_uso', assignedTo: 'u-t3' },
  { id: 'eq-5', orgId: ORG, name: 'Kit EPI Completo', code: 'EPI-05', assetNumber: 'PAT-1030', kind: 'EPI', status: 'disponivel' },
];

export const vehicles: Vehicle[] = [
  { id: 'veh-1', orgId: ORG, plate: 'FKD-2A31', model: 'Fiat Fiorino', driverId: 'u-t1', odometerKm: 84210, isActive: true, inOperation: true },
  { id: 'veh-2', orgId: ORG, plate: 'GJP-8B72', model: 'Renault Kangoo', driverId: 'u-t3', odometerKm: 51230, isActive: true, inOperation: true },
  { id: 'veh-3', orgId: ORG, plate: 'HLM-1C09', model: 'VW Saveiro', driverId: 'u-t4', odometerKm: 32980, isActive: true, inOperation: false },
];

// ── Clientes ─────────────────────────────────────────────────────────────────
export const customers: Customer[] = [
  { id: 'c-1', orgId: ORG, type: 'pj', name: 'Padaria Pão Quente', companyName: 'Pão Quente Ltda', document: '12.345.678/0001-99', phone: '(11) 3011-1000', whatsapp: '(11) 99011-1000', email: 'contato@paoquente.com', city: 'São Paulo', state: 'SP', district: 'Pinheiros', street: 'Rua dos Pinheiros', number: '820', cep: '05422-001', latitude: -23.5629, longitude: -46.6825, propertyType: 'Comercial', areaM2: 220, tags: ['Contrato mensal', 'Alimentício'], isActive: true, createdAt: daysFromNow(-210) },
  { id: 'c-2', orgId: ORG, type: 'pf', name: 'Helena Martins', document: '123.456.789-00', phone: '(11) 98123-4567', whatsapp: '(11) 98123-4567', city: 'São Paulo', state: 'SP', district: 'Vila Mariana', street: 'Rua Domingos de Morais', number: '2100', cep: '04010-100', latitude: -23.5895, longitude: -46.6345, propertyType: 'Residencial', areaM2: 90, tags: ['Residencial'], isActive: true, createdAt: daysFromNow(-120) },
  { id: 'c-3', orgId: ORG, type: 'pj', name: 'Restaurante Sabor & Cia', companyName: 'Sabor e Cia Alimentos', document: '22.333.444/0001-55', phone: '(11) 3222-3333', whatsapp: '(11) 99222-3333', email: 'gerencia@saborcia.com', city: 'São Paulo', state: 'SP', district: 'Moema', street: 'Av. Ibirapuera', number: '1500', cep: '04029-000', latitude: -23.6009, longitude: -46.6555, propertyType: 'Comercial', areaM2: 340, tags: ['Contrato trimestral', 'Alimentício'], isActive: true, createdAt: daysFromNow(-320) },
  { id: 'c-4', orgId: ORG, type: 'pj', name: 'Condomínio Villa Verde', companyName: 'Cond. Villa Verde', document: '33.444.555/0001-66', phone: '(11) 3444-5555', email: 'sindico@villaverde.com', city: 'São Paulo', state: 'SP', district: 'Morumbi', street: 'Av. Giovanni Gronchi', number: '3000', cep: '05724-000', latitude: -23.6178, longitude: -46.7256, propertyType: 'Condomínio', areaM2: 1800, tags: ['Contrato mensal', 'Condomínio'], monitoringContracted: true, permanentNotes: 'Acessar pela portaria lateral. Avisar o zelador antes de chegar. Uso de EPI obrigatório nas áreas comuns.', isActive: true, createdAt: daysFromNow(-400) },
  { id: 'c-5', orgId: ORG, type: 'pf', name: 'Carlos Eduardo Lima', document: '987.654.321-00', phone: '(11) 97654-3210', whatsapp: '(11) 97654-3210', city: 'São Paulo', state: 'SP', district: 'Tatuapé', street: 'Rua Tuiuti', number: '540', cep: '03307-000', latitude: -23.5401, longitude: -46.5766, propertyType: 'Residencial', areaM2: 120, tags: ['Residencial'], isActive: true, createdAt: daysFromNow(-60) },
  { id: 'c-6', orgId: ORG, type: 'pj', name: 'Mercado Bom Preço', companyName: 'Bom Preço Varejo', document: '44.555.666/0001-77', phone: '(11) 3555-6666', email: 'compras@bompreco.com', city: 'São Paulo', state: 'SP', district: 'Santana', street: 'Av. Cruzeiro do Sul', number: '2200', cep: '02031-000', latitude: -23.5028, longitude: -46.6256, propertyType: 'Comercial', areaM2: 680, tags: ['Contrato mensal', 'Varejo'], monitoringContracted: true, permanentNotes: 'Serviço somente após as 22h (fora do horário comercial). Retirar produtos do estoque de alimentos.', isActive: true, createdAt: daysFromNow(-500) },
  { id: 'c-7', orgId: ORG, type: 'pj', name: 'Escola Crescer', companyName: 'Instituto Crescer', document: '55.666.777/0001-88', phone: '(11) 3666-7777', email: 'adm@escolacrescer.com', city: 'São Paulo', state: 'SP', district: 'Perdizes', street: 'Rua Cardoso de Almeida', number: '900', cep: '05013-000', latitude: -23.5345, longitude: -46.6789, propertyType: 'Institucional', areaM2: 950, tags: ['Contrato semestral', 'Educação'], isActive: true, createdAt: daysFromNow(-280) },
  { id: 'c-8', orgId: ORG, type: 'pf', name: 'Fernanda Rocha', document: '111.222.333-44', phone: '(11) 96123-9876', whatsapp: '(11) 96123-9876', city: 'São Paulo', state: 'SP', district: 'Lapa', street: 'Rua Guaicurus', number: '150', cep: '05033-000', latitude: -23.5245, longitude: -46.7012, propertyType: 'Residencial', areaM2: 75, tags: ['Residencial'], isActive: true, createdAt: daysFromNow(-30) },
];

// ── Agendamentos (semana atual) ──────────────────────────────────────────────
const A = (
  id: string,
  customerId: string,
  serviceTypeId: string,
  technicianId: string,
  dayOffset: number,
  hour: number,
  durationMin: number,
  status: Appointment['status'],
  priority: Appointment['priority'],
  routeOrder: number,
): Appointment => {
  const cust = customers.find((c) => c.id === customerId)!;
  const start = new Date(at(dayOffset, hour));
  const end = new Date(start.getTime() + durationMin * 60000);
  return {
    id,
    orgId: ORG,
    customerId,
    serviceTypeId,
    technicianId,
    status,
    priority,
    scheduledStart: iso(start),
    scheduledEnd: iso(end),
    estimatedMinutes: durationMin,
    address: `${cust.street}, ${cust.number} — ${cust.district}`,
    latitude: cust.latitude,
    longitude: cust.longitude,
    routeOrder,
    products: [],
  };
};

export const appointments: Appointment[] = [
  // Hoje (offset 0)
  A('a-1', 'c-1', 'st-ded', 'u-t1', 0, 8, 90, 'finalizado', 'normal', 1),
  A('a-2', 'c-3', 'st-des', 'u-t1', 0, 10, 75, 'em_atendimento', 'alta', 2),
  A('a-3', 'c-6', 'st-san', 'u-t1', 0, 14, 60, 'confirmado', 'normal', 3),
  A('a-3b', 'c-8', 'st-ded', 'u-t1', 0, 16, 60, 'agendado', 'normal', 4),
  A('a-3c', 'c-5', 'st-des', 'u-t1', 0, 17, 60, 'agendado', 'baixa', 5),
  A('a-4', 'c-4', 'st-cup', 'u-t3', 0, 9, 120, 'em_deslocamento', 'urgente', 1),
  A('a-5', 'c-7', 'st-ded', 'u-t3', 0, 14, 90, 'agendado', 'normal', 2),
  A('a-6', 'c-2', 'st-esc', 'u-t2', 0, 11, 80, 'confirmado', 'alta', 1),
  A('a-7', 'c-5', 'st-san', 'u-t4', 0, 15, 60, 'agendado', 'baixa', 1),
  // Amanhã (offset 1)
  A('a-8', 'c-8', 'st-ded', 'u-t2', 1, 9, 90, 'confirmado', 'normal', 1),
  A('a-9', 'c-6', 'st-des', 'u-t1', 1, 11, 75, 'agendado', 'normal', 1),
  A('a-10', 'c-3', 'st-san', 'u-t4', 1, 14, 60, 'agendado', 'normal', 1),
  // Depois de amanhã (offset 2)
  A('a-11', 'c-4', 'st-ded', 'u-t3', 2, 8, 90, 'agendado', 'alta', 1),
  A('a-12', 'c-1', 'st-des', 'u-t1', 2, 10, 75, 'agendado', 'normal', 1),
  A('a-13', 'c-7', 'st-cup', 'u-t3', 2, 14, 120, 'agendado', 'normal', 2),
  // offset 3-4
  A('a-14', 'c-2', 'st-ded', 'u-t2', 3, 9, 90, 'agendado', 'normal', 1),
  A('a-15', 'c-5', 'st-san', 'u-t4', 3, 13, 60, 'agendado', 'baixa', 1),
  A('a-16', 'c-6', 'st-des', 'u-t1', 4, 8, 75, 'agendado', 'normal', 1),
  A('a-17', 'c-8', 'st-esc', 'u-t2', 4, 11, 80, 'agendado', 'alta', 1),
  // ontem (histórico)
  A('a-18', 'c-1', 'st-ded', 'u-t1', -1, 9, 90, 'finalizado', 'normal', 1),
  A('a-19', 'c-3', 'st-san', 'u-t4', -1, 14, 60, 'finalizado', 'normal', 1),
  A('a-20', 'c-4', 'st-des', 'u-t3', -1, 10, 75, 'cancelado', 'normal', 1),
];

// ── Ordens de serviço ────────────────────────────────────────────────────────
export const serviceOrders: ServiceOrder[] = [
  { id: 'so-1', orgId: ORG, number: 1042, appointmentId: 'a-18', customerId: 'c-1', technicianId: 'u-t1', serviceTypeId: 'st-ded', status: 'concluida', areaTreated: 'Cozinha, estoque e área externa', procedures: 'Pulverização e aplicação de gel', pestIds: ['p-bar', 'p-for'], products: [{ productId: 'prod-1', usedQty: 1.2, unitCost: 189.9 }, { productId: 'prod-3', usedQty: 2 }], hasCustomerSignature: true, totalMinutes: 88, startedAt: at(-1, 9), finishedAt: at(-1, 10, 28), createdAt: daysFromNow(-1) },
  { id: 'so-2', orgId: ORG, number: 1043, appointmentId: 'a-19', customerId: 'c-3', technicianId: 'u-t4', serviceTypeId: 'st-san', status: 'concluida', areaTreated: 'Salão e sanitários', procedures: 'Atomização de sanitizante', pestIds: [], products: [{ productId: 'prod-5', usedQty: 3 }], hasCustomerSignature: true, totalMinutes: 55, startedAt: at(-1, 14), finishedAt: at(-1, 14, 55), createdAt: daysFromNow(-1) },
  { id: 'so-3', orgId: ORG, number: 1044, appointmentId: 'a-1', customerId: 'c-1', technicianId: 'u-t1', serviceTypeId: 'st-ded', status: 'concluida', areaTreated: 'Cozinha e estoque', procedures: 'Pulverização', pestIds: ['p-bar'], products: [{ productId: 'prod-1', usedQty: 0.8 }], hasCustomerSignature: true, totalMinutes: 84, startedAt: at(0, 8), finishedAt: at(0, 9, 24), createdAt: daysFromNow(0) },
  { id: 'so-4', orgId: ORG, number: 1045, appointmentId: 'a-2', customerId: 'c-3', technicianId: 'u-t1', serviceTypeId: 'st-des', status: 'em_andamento', areaTreated: 'Depósito', pestIds: ['p-rat'], products: [], hasCustomerSignature: false, createdAt: daysFromNow(0) },
];

// ── Financeiro ────────────────────────────────────────────────────────────────
export const financeEntries: FinanceEntry[] = [
  { id: 'fe-1', orgId: ORG, type: 'receita', status: 'pago', description: 'OS #1042 · Padaria Pão Quente', amount: 320, customerId: 'c-1', serviceOrderId: 'so-1', dueDate: daysFromNow(-1), paidAt: daysFromNow(-1), createdAt: daysFromNow(-1) },
  { id: 'fe-2', orgId: ORG, type: 'receita', status: 'pago', description: 'OS #1043 · Restaurante Sabor & Cia', amount: 240, customerId: 'c-3', serviceOrderId: 'so-2', dueDate: daysFromNow(-1), paidAt: daysFromNow(-1), createdAt: daysFromNow(-1) },
  { id: 'fe-3', orgId: ORG, type: 'receita', status: 'pago', description: 'OS #1044 · Padaria Pão Quente', amount: 320, customerId: 'c-1', serviceOrderId: 'so-3', dueDate: daysFromNow(0), paidAt: daysFromNow(0), createdAt: daysFromNow(0) },
  { id: 'fe-4', orgId: ORG, type: 'receita', status: 'pendente', description: 'Contrato mensal · Condomínio Villa Verde', amount: 1450, customerId: 'c-4', dueDate: daysFromNow(5), createdAt: daysFromNow(-2) },
  { id: 'fe-5', orgId: ORG, type: 'receita', status: 'atrasado', description: 'Contrato mensal · Mercado Bom Preço', amount: 980, customerId: 'c-6', dueDate: daysFromNow(-3), createdAt: daysFromNow(-33) },
  { id: 'fe-6', orgId: ORG, type: 'despesa', status: 'pago', description: 'Compra de insumos · BioControl', amount: 1240, dueDate: daysFromNow(-6), paidAt: daysFromNow(-6), createdAt: daysFromNow(-6) },
  { id: 'fe-7', orgId: ORG, type: 'despesa', status: 'pendente', description: 'Combustível · frota', amount: 620, dueDate: daysFromNow(2), createdAt: daysFromNow(-1) },
  { id: 'fe-8', orgId: ORG, type: 'despesa', status: 'pendente', description: 'Salários equipe de campo', amount: 8600, dueDate: daysFromNow(7), createdAt: daysFromNow(-1) },
  { id: 'fe-9', orgId: ORG, type: 'despesa', status: 'pago', description: 'Manutenção termonebulizador', amount: 380, dueDate: daysFromNow(-4), paidAt: daysFromNow(-4), createdAt: daysFromNow(-4) },
];

// Série de faturamento dos últimos 6 meses (para gráficos)
export const revenueSeries: { month: string; receita: number; despesa: number }[] = [
  { month: 'Fev', receita: 28400, despesa: 18200 },
  { month: 'Mar', receita: 31200, despesa: 19100 },
  { month: 'Abr', receita: 29800, despesa: 17600 },
  { month: 'Mai', receita: 34500, despesa: 20300 },
  { month: 'Jun', receita: 38200, despesa: 21800 },
  { month: 'Jul', receita: 41100, despesa: 22400 },
];

// ── Fiscal / licenças ─────────────────────────────────────────────────────────
export const licenses: License[] = [
  { id: 'lic-1', orgId: ORG, name: 'Alvará Sanitário', issuer: 'Vigilância Sanitária Municipal', number: 'VS-2024-3391', responsibleId: 'u-sup', issuedAt: daysFromNow(-300), expiresAt: daysFromNow(65), status: 'ativa' },
  { id: 'lic-2', orgId: ORG, name: 'Licença Ambiental', issuer: 'CETESB', number: 'CET-88120', responsibleId: 'u-admin', issuedAt: daysFromNow(-320), expiresAt: daysFromNow(22), status: 'ativa' },
  { id: 'lic-3', orgId: ORG, name: 'Registro Responsável Técnico (CRQ)', issuer: 'CRQ-IV', number: 'RT-04-55210', responsibleId: 'u-sup', issuedAt: daysFromNow(-600), expiresAt: daysFromNow(-8), status: 'vencida' },
  { id: 'lic-4', orgId: ORG, name: 'Autorização de Funcionamento', issuer: 'Prefeitura', number: 'AF-2023-771', responsibleId: 'u-admin', issuedAt: daysFromNow(-250), expiresAt: daysFromNow(180), status: 'ativa' },
];

// ── CRM ───────────────────────────────────────────────────────────────────────
export const crmLeads: CrmLead[] = [
  { id: 'l-1', orgId: ORG, name: 'Hotel Vista Mar', company: 'Vista Mar Hotéis', phone: '(11) 3777-8888', email: 'reservas@vistamar.com', source: 'Site', stage: 'novo_contato', estimatedValue: 2400, ownerId: 'u-sup', nextActionAt: daysFromNow(1), notes: 'Solicitou orçamento para controle mensal.', createdAt: daysFromNow(-2) },
  { id: 'l-2', orgId: ORG, name: 'Clínica São Lucas', company: 'São Lucas Saúde', phone: '(11) 3888-9999', email: 'adm@saolucas.com', source: 'Indicação', stage: 'orcamento', estimatedValue: 1800, ownerId: 'u-sup', nextActionAt: daysFromNow(2), notes: 'Orçamento enviado, aguardando retorno.', createdAt: daysFromNow(-5) },
  { id: 'l-3', orgId: ORG, name: 'Buffet Festa Boa', company: 'Festa Boa Eventos', phone: '(11) 3999-0000', source: 'WhatsApp', stage: 'negociacao', estimatedValue: 3200, ownerId: 'u-admin', nextActionAt: daysFromNow(0), notes: 'Negociando periodicidade e valor.', createdAt: daysFromNow(-9) },
  { id: 'l-4', orgId: ORG, name: 'Academia Corpo & Movimento', company: 'C&M Fitness', phone: '(11) 3010-2020', source: 'Anúncio', stage: 'follow_up', estimatedValue: 1200, ownerId: 'u-sup', nextActionAt: daysFromNow(3), createdAt: daysFromNow(-14) },
  { id: 'l-5', orgId: ORG, name: 'Farmácia Vida', company: 'Vida Drogaria', phone: '(11) 3020-3030', source: 'Indicação', stage: 'ganho', estimatedValue: 1600, ownerId: 'u-admin', createdAt: daysFromNow(-20) },
  { id: 'l-6', orgId: ORG, name: 'Loja de Móveis Conforto', company: 'Conforto Móveis', phone: '(11) 3040-5050', source: 'Site', stage: 'perdido', estimatedValue: 900, ownerId: 'u-sup', notes: 'Optou por concorrente.', createdAt: daysFromNow(-25) },
];

// ── Monitoramento de armadilhas (clientes com monitoramento contratado) ──────
export const trapDevices: TrapDevice[] = [
  { id: 'trap-1', orgId: ORG, customerId: 'c-4', code: 'Porta Isca 001', type: 'Porta-isca', location: 'Garagem G1', status: 'ativa', createdAt: daysFromNow(-180) },
  { id: 'trap-2', orgId: ORG, customerId: 'c-4', code: 'Porta Isca 002', type: 'Porta-isca', location: 'Depósito', status: 'ativa', createdAt: daysFromNow(-180) },
  { id: 'trap-3', orgId: ORG, customerId: 'c-4', code: 'Luminosa 001', type: 'Luminosa', location: 'Salão de festas', status: 'ativa', createdAt: daysFromNow(-120) },
  { id: 'trap-4', orgId: ORG, customerId: 'c-4', code: 'Porta Isca 005', type: 'Porta-isca', location: 'Lixeira externa', status: 'ativa', createdAt: daysFromNow(-90) },
  { id: 'trap-5', orgId: ORG, customerId: 'c-6', code: 'Porta Isca 001', type: 'Porta-isca', location: 'Estoque seco', status: 'ativa', createdAt: daysFromNow(-200) },
  { id: 'trap-6', orgId: ORG, customerId: 'c-6', code: 'Placa Cola 001', type: 'Placa de cola', location: 'Câmara fria', status: 'substituida', createdAt: daysFromNow(-200) },
];

export const nonConformities: NonConformity[] = [
  { id: 'nc-1', orgId: ORG, customerId: 'c-4', date: daysFromNow(-2), category: 'fresta', description: 'Fresta na porta de acesso ao depósito, permitindo entrada de roedores.', priority: 'alta', correctiveAction: 'Instalar rodo/veda-porta e telamento na saída de ar.', status: 'aberta', createdBy: 'u-t3', createdAt: daysFromNow(-2) },
  { id: 'nc-2', orgId: ORG, customerId: 'c-6', date: daysFromNow(-6), category: 'armazenamento_incorreto', description: 'Produtos armazenados diretamente no piso, sem paletes.', priority: 'normal', correctiveAction: 'Utilizar estrados/paletes e afastar 30cm das paredes.', status: 'em_andamento', createdBy: 'u-t1', createdAt: daysFromNow(-6) },
  { id: 'nc-3', orgId: ORG, customerId: 'c-3', date: daysFromNow(-10), category: 'limpeza_inadequada', description: 'Acúmulo de resíduos orgânicos atrás dos equipamentos da cozinha.', priority: 'urgente', correctiveAction: 'Higienização diária e reforço na coleta de resíduos.', status: 'resolvida', createdBy: 'u-t4', createdAt: daysFromNow(-10) },
];

export const trapInspections: TrapInspection[] = [
  { id: 'insp-1', trapId: 'trap-4', date: daysFromNow(-2), consumed: true, action: 'substituida', technicianId: 'u-t3', notes: 'Consumo alto próximo à lixeira externa.' },
  { id: 'insp-2', trapId: 'trap-1', date: daysFromNow(-2), consumed: false, action: 'nenhuma', technicianId: 'u-t3' },
  { id: 'insp-3', trapId: 'trap-2', date: daysFromNow(-30), consumed: true, action: 'nenhuma', technicianId: 'u-t3', notes: 'Isca com sinais de roedores.' },
  { id: 'insp-4', trapId: 'trap-5', date: daysFromNow(-5), consumed: false, action: 'nenhuma', technicianId: 'u-t1' },
];

// ── Notas Fiscais de Serviço (exemplos) ─────────────────────────────────────
export const invoicesSeed: Invoice[] = [
  { id: 'inv-1', orgId: ORG, number: 1042, series: 'RPS-1', serviceOrderId: 'so-1', customerId: 'c-1', description: 'Dedetização · Padaria Pão Quente', amount: 320, taxAmount: 9.6, status: 'emitida', issuedAt: daysFromNow(-1) },
  { id: 'inv-2', orgId: ORG, number: 1043, series: 'RPS-1', serviceOrderId: 'so-2', customerId: 'c-3', description: 'Sanitização · Restaurante Sabor & Cia', amount: 240, taxAmount: 7.2, status: 'emitida', issuedAt: daysFromNow(-1) },
];

// ── Histórico / auditoria (exemplos iniciais) ───────────────────────────────
export const auditSeed = [
  { id: 'aud-s1', userId: 'u-sup', userName: 'Rafael Nunes', action: 'confirmação', entityType: 'agendamento', description: 'Visita confirmada · Padaria Pão Quente', createdAt: daysFromNow(0) },
  { id: 'aud-s2', userId: 'u-t3', userName: 'Paula Freitas', action: 'inspeção', entityType: 'armadilha', description: 'Inspeção registrada · Porta Isca 005 (consumo)', createdAt: daysFromNow(-2) },
  { id: 'aud-s3', userId: 'u-admin', userName: 'Marina Duarte', action: 'reagendamento', entityType: 'agendamento', description: 'Visita reagendada · Helena Martins', createdAt: daysFromNow(-1) },
  { id: 'aud-s4', userId: 'u-fin', userName: 'Camila Reis', action: 'criação', entityType: 'financeiro', description: 'Lançamento criado · Contrato mensal Villa Verde', createdAt: daysFromNow(-2) },
  { id: 'aud-s5', userId: 'u-t3', userName: 'Paula Freitas', action: 'criação', entityType: 'não conformidade', description: 'Não conformidade registrada · Fresta (Villa Verde)', createdAt: daysFromNow(-2) },
];

export const orgProfile = {
  id: ORG,
  name: 'Na Mira Controle de Pragas',
  legalName: 'Na Mira Serviços de Dedetização Ltda',
  cnpj: '41.222.333/0001-44',
  taxRegime: 'Simples Nacional',
  city: 'São Paulo',
  state: 'SP',
};
