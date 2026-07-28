/**
 * Domínio — entidades (modelos) principais espelhando o esquema PostgreSQL.
 * Tipos puros, sem lógica de infraestrutura.
 */
import type {
  AppointmentPriority,
  AppointmentStatus,
  CrmStage,
  CustomerType,
  EquipmentStatus,
  FinanceEntryStatus,
  FinanceEntryType,
  RecurrenceFreq,
  ServiceOrderStatus,
  StockLocationKind,
  StockMovementType,
  UserRole,
  WarrantyType,
  WarrantyUnit,
} from './enums';

export interface Organization {
  id: string;
  name: string;
  legalName?: string;
  cnpj?: string;
}

export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  isActive: boolean;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  leaderId?: string;
  color: string;
  memberIds: string[];
}

export interface Customer {
  id: string;
  orgId: string;
  type: CustomerType;
  name: string;
  companyName?: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  areaM2?: number;
  notes?: string;
  /** Observações permanentes do contrato — aparecem na OS, agenda e app do técnico. */
  permanentNotes?: string;
  /** Cliente possui contrato de monitoramento (habilita armadilhas/MIP). */
  monitoringContracted?: boolean;
  /** Situação cadastral e CNAE (preenchidos via consulta ao CNPJ). */
  registrationStatus?: string;
  economicActivity?: string;
  tags: string[];
  isActive: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
}

// ── Monitoramento de armadilhas (MIP) ───────────────────────────────────────
export type TrapStatus = 'ativa' | 'extraviada' | 'substituida' | 'retirada';

export interface TrapDevice {
  id: string;
  orgId: string;
  customerId: string;
  code: string; // identificação/numeração (ex.: "Porta Isca 005")
  type: string; // Porta-isca, Luminosa, Cola, Mecânica, Feromônio...
  location?: string; // ponto de instalação
  status: TrapStatus;
  createdAt: string;
}

export interface TrapInspection {
  id: string;
  trapId: string;
  date: string; // ISO
  consumed: boolean; // houve consumo?
  action?: 'nenhuma' | 'substituida' | 'retirada' | 'reinstalada' | 'extraviada';
  technicianId?: string;
  notes?: string;
}

// ── Não conformidade ────────────────────────────────────────────────────────
export type NonConformityCategory =
  | 'fresta'
  | 'falha_estrutural'
  | 'limpeza_inadequada'
  | 'armazenamento_incorreto'
  | 'outra';

export type NonConformityStatus = 'aberta' | 'em_andamento' | 'resolvida';

export interface NonConformity {
  id: string;
  orgId: string;
  customerId: string;
  date: string; // ISO
  category: NonConformityCategory;
  description: string;
  priority: AppointmentPriority;
  correctiveAction?: string;
  status: NonConformityStatus;
  photos?: { name: string; dataUrl: string }[];
  createdBy?: string;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  orgId: string;
  name: string;
}

/** Lote de um produto (rastreabilidade: código, validade, quantidade). */
export interface Batch {
  id: string;
  code: string;
  expiresAt?: string; // ISO date (yyyy-mm-dd)
  quantity: number;
  receivedAt: string; // ISO date
}

export interface Product {
  id: string;
  orgId: string;
  name: string;
  categoryId?: string;
  manufacturer?: string;
  supplierId?: string;
  registrationCode?: string;
  activeIngredient?: string;
  applicationType?: string;
  dosage?: string;
  unit: string;
  minQuantity: number;
  price: number;
  storageLocation?: string;
  isRegulated: boolean;
  isActive: boolean;
  /** Histórico de lotes — o lote "atual" é o de validade mais próxima com saldo. */
  batches?: Batch[];
}

export interface ProductBatch {
  id: string;
  productId: string;
  batchCode?: string;
  expiresAt?: string;
  quantityAtCentral: number;
}

export interface StockLocation {
  id: string;
  orgId: string;
  kind: StockLocationKind;
  name: string;
  ownerId?: string;
}

export interface StockBalance {
  id: string;
  locationId: string;
  productId: string;
  batchId?: string;
  quantity: number;
}

/** Solicitação de reposição de estoque (gerada pela OS / pelo técnico). */
export interface StockRequest {
  id: string;
  orgId: string;
  productId: string;
  quantity: number;
  requestedBy?: string;
  serviceOrderId?: string;
  appointmentId?: string;
  note?: string;
  status: 'pendente' | 'atendida' | 'cancelada';
  createdAt: string;
  resolvedAt?: string;
}

export interface StockMovement {
  id: string;
  orgId: string;
  type: StockMovementType;
  productId: string;
  quantity: number;
  fromLocationId?: string;
  toLocationId?: string;
  serviceOrderId?: string;
  performedBy?: string;
  reason?: string;
  createdAt: string;
}

export interface Equipment {
  id: string;
  orgId: string;
  name: string;
  code?: string;
  assetNumber?: string;
  kind?: string;
  status: EquipmentStatus;
  assignedTo?: string;
  nextMaintenanceAt?: string;
  /** Retirada em uso: quando, para quem, OS e previsão de devolução. */
  checkedOutAt?: string;
  checkedOutTo?: string;
  checkedOutOsId?: string;
  expectedReturnAt?: string;
  notes?: string;
}

export interface Vehicle {
  id: string;
  orgId: string;
  plate: string;
  model?: string;
  driverId?: string;
  odometerKm: number;
  isActive: boolean;
  inOperation?: boolean;
}

export interface ServiceType {
  id: string;
  orgId: string;
  name: string;
  defaultDurationMin: number;
  defaultPrice: number;
  color: string;
  /** Produtos padrão do serviço — pré-preenchem a OS; o técnico ajusta o que usou. */
  defaultProducts?: { productId: string; qty: number }[];
}

export interface AppointmentProduct {
  productId: string;
  plannedQty: number;
}

export interface Appointment {
  id: string;
  orgId: string;
  customerId: string;
  serviceTypeId?: string;
  technicianId?: string;
  teamId?: string;
  vehicleId?: string;
  status: AppointmentStatus;
  priority: AppointmentPriority;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedMinutes?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Hora marcada — a otimização mantém a visita dentro da janela agendada. */
  fixedTime?: boolean;
  notes?: string;
  /** Observação do técnico registrada em campo (aparece no sistema da empresa). */
  technicianNotes?: string;
  /** Fotos do atendimento (antes/durante/após), registradas pelo técnico. */
  photos?: ServiceOrderPhoto[];
  /** Assinatura eletrônica do técnico, capturada ao finalizar a visita. */
  technicianSignature?: string;
  routeOrder?: number;
  products: AppointmentProduct[];
  /** Agrupa as ocorrências de uma mesma recorrência (cada uma é independente). */
  recurrenceId?: string;
  /** Rótulo da recorrência: 'semanal' | 'quinzenal' | 'mensal'. */
  recurrenceRule?: string;
  /** Data/hora em que a visita foi confirmada (pelo cliente/atendimento). */
  confirmedAt?: string;
}

export interface ServiceOrderProduct {
  productId: string;
  usedQty: number;
  unitCost?: number;
}

export interface ServiceOrder {
  id: string;
  orgId: string;
  number: number;
  appointmentId?: string;
  customerId: string;
  technicianId?: string;
  serviceTypeId?: string;
  status: ServiceOrderStatus;
  areaTreated?: string;
  procedures?: string;
  notes?: string;
  startedAt?: string;
  finishedAt?: string;
  totalMinutes?: number;
  pestIds: string[];
  products: ServiceOrderProduct[];
  hasCustomerSignature: boolean;
  createdAt: string;

  // ── Ordem de Serviço avançada ──────────────────────────────────────────
  /** Múltiplos serviços na mesma OS (além do serviceTypeId principal). */
  serviceTypeIds?: string[];
  /** Áreas tratadas (cadastro). Complementa o texto livre areaTreated. */
  areaIds?: string[];
  /** Equipe: múltiplos técnicos e o vendedor responsável. */
  technicianIds?: string[];
  sellerId?: string;
  /** Equipamentos utilizados no atendimento. */
  equipmentIds?: string[];
  /** Forma de pagamento acordada. */
  paymentMethod?: string;
  /** Garantia do serviço (com/sem, prazo e tipo). */
  warranty?: WarrantyInfo;
  /** Recorrência do serviço. */
  recurrence?: OsRecurrence;
  /** Datas do serviço. */
  executionDate?: string;
  dueDate?: string;
  validityDate?: string;
  /** Fotos antes/durante/após. */
  photos?: ServiceOrderPhoto[];
  /** Localização registrada durante o atendimento (app do técnico). */
  location?: { lat: number; lng: number };
  /** Assinaturas eletrônicas (dataURL) incorporadas ao PDF. */
  technicianSignature?: string;
  customerSignature?: string;
}

export interface Pest {
  id: string;
  orgId: string;
  name: string;
  /** Categoria (ex.: rasteira, voadora, roedor, cupim…). */
  category?: string;
  description?: string;
  /** Tempo de garantia padrão (dias) — alimenta a OS ao selecionar a praga. */
  defaultWarrantyDays?: number;
  notes?: string;
}

/** Área/ambiente tratado (cadastro reutilizável na OS). */
export interface TreatedArea {
  id: string;
  orgId: string;
  name: string;
  notes?: string;
}

/** Foto vinculada à OS, por fase do serviço. */
export interface ServiceOrderPhoto {
  dataUrl: string;
  phase: 'antes' | 'durante' | 'apos';
  name?: string;
}

export interface WarrantyInfo {
  has: boolean;
  value?: number;
  unit?: WarrantyUnit;
  type?: WarrantyType;
}

export interface OsRecurrence {
  enabled: boolean;
  frequency?: RecurrenceFreq;
}

export interface FinanceEntry {
  id: string;
  orgId: string;
  type: FinanceEntryType;
  status: FinanceEntryStatus;
  categoryId?: string;
  customerId?: string;
  serviceOrderId?: string;
  /** Vínculo com a conta recorrente que gerou este lançamento. */
  recurringId?: string;
  description: string;
  amount: number;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
}

/** Conta a pagar recorrente (aluguel, salários, água, energia, contratos…). */
export interface RecurringPayable {
  id: string;
  orgId: string;
  description: string;
  category?: string;
  amount: number;
  /** Frequência (mensal, bimestral, trimestral, semestral, anual). */
  frequency: RecurrenceFreq;
  /** Dia de vencimento (1–28). */
  dueDay: number;
  active: boolean;
  createdAt: string;
}

export interface InvoiceTaxes {
  issRate: number;
  iss: number;
  issRetido: boolean;
  irrf: number;
  inss: number;
  pis: number;
  cofins: number;
  csll: number;
  totalRetencoes: number;
  /** Valor líquido a receber (bruto − retenções). */
  net: number;
}

export interface Invoice {
  id: string;
  orgId: string;
  number: number;
  series: string;
  serviceOrderId?: string;
  customerId?: string;
  description: string;
  amount: number;
  taxAmount: number;
  status: 'emitida' | 'cancelada' | 'processando' | 'rejeitada';
  issuedAt: string;
  /** Provedor de emissão (ex.: 'governo-nacional', 'simulado'). */
  provider?: string;
  /** Ambiente NFS-e Nacional retornado pelo governo. */
  accessKey?: string;
  protocol?: string;
  verificationCode?: string;
  /** Mensagem de rejeição/erro do provedor, se houver. */
  message?: string;
  /** Detalhamento tributário (ISS + retenções + líquido). */
  taxes?: InvoiceTaxes;
}

export interface License {
  id: string;
  orgId: string;
  name: string;
  issuer?: string;
  number?: string;
  responsibleId?: string;
  issuedAt?: string;
  expiresAt?: string;
  status: string;
}

export interface CrmLead {
  id: string;
  orgId: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  stage: CrmStage;
  estimatedValue?: number;
  ownerId?: string;
  nextActionAt?: string;
  notes?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  entityType?: string;
  read: boolean;
  createdAt: string;
}
