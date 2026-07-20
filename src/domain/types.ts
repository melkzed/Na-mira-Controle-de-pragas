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
  ServiceOrderStatus,
  StockLocationKind,
  StockMovementType,
  UserRole,
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
  notes?: string;
  routeOrder?: number;
  products: AppointmentProduct[];
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
}

export interface Pest {
  id: string;
  orgId: string;
  name: string;
}

export interface FinanceEntry {
  id: string;
  orgId: string;
  type: FinanceEntryType;
  status: FinanceEntryStatus;
  categoryId?: string;
  customerId?: string;
  serviceOrderId?: string;
  description: string;
  amount: number;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
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
