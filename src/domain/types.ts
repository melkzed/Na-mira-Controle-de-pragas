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
  /** Permissão de acesso ao aplicativo de campo (só relevante para técnicos). */
  fieldAppAccess?: boolean;
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

  // ── Cadastro Completo (clientes recorrentes/contrato) ──────────────────
  /** 'basico' = cadastro rápido (nome/endereço/telefone); 'completo' = com
   *  estrutura do local, armadilhas, reservatórios, contratos etc. Sem valor
   *  definido é tratado como completo (clientes cadastrados antes desta divisão). */
  registrationTier?: 'basico' | 'completo';
  /** Ambientes do local, conforme o segmento do cliente (ex.: Cozinha, Câmara Fria). */
  localStructure?: string[];
  reservoirs?: Reservoir[];
  contactSchedule?: ContactSchedule;
  contracts?: ServiceContract[];
  /** Serviços complementares contratados (ex.: Limpeza de Coifa, Sanitização). */
  complementaryServices?: string[];
}

/** Reservatório de água do cliente (caixa d'água, cisterna, reservatório elevado…). */
export interface Reservoir {
  id: string;
  type: string;
  location?: string;
  notes?: string;
}

/** Agenda de contato comercial/pós-venda do cliente. */
export interface ContactSchedule {
  nextContactAt?: string;
  responsibleId?: string;
  notes?: string;
}

export type ContractStatus = 'ativo' | 'vencido' | 'renovacao_pendente' | 'cancelado';

/** Contrato de prestação de serviço vinculado ao cliente. */
export interface ServiceContract {
  id: string;
  startDate?: string;
  endDate?: string;
  renewal?: string;
  status: ContractStatus;
  notes?: string;
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
  /** Data da instalação do dispositivo (distinta de createdAt, que é o registro no sistema). */
  installedAt?: string;
  /** Próxima inspeção prevista — permite planejar/alertar visitas de monitoramento. */
  nextInspectionAt?: string;
  /** Responsável fixo pela armadilha (normalmente o técnico da rota do cliente). */
  responsibleId?: string;
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
  /** Grupo químico (ex.: Piretróide, Neonicotinóide, Hidroxicumarina…) — laudos técnicos. */
  chemicalGroup?: string;
  /** Antídoto/conduta em caso de intoxicação — laudos técnicos. */
  antidote?: string;
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

/** Evento no histórico de movimentação de um equipamento/ferramenta. */
export interface EquipmentHistoryEntry {
  at: string;
  type: 'entrega' | 'devolucao' | 'status';
  technicianId?: string;
  by?: string;
  note?: string;
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
  checkedOutBy?: string;
  expectedReturnAt?: string;
  notes?: string;
  /** Histórico completo de entregas/devoluções/mudanças de status. */
  history?: EquipmentHistoryEntry[];
}

/** Solicitação de ferramenta/equipamento feita pelo técnico no app de campo. */
export interface EquipmentRequest {
  id: string;
  orgId: string;
  technicianId: string;
  equipmentId: string;
  note?: string;
  status: 'pendente' | 'aprovada' | 'negada';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  expectedReturnAt?: string;
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

// ── App do Técnico: ponto e combustível ─────────────────────────────────────

/** Registro de abastecimento — controle de combustível × quilometragem do técnico. */
export interface FuelLog {
  id: string;
  orgId: string;
  technicianId: string;
  vehicleId?: string;
  date: string; // ISO
  odometerStart: number;
  odometerEnd: number;
  liters: number;
  amount: number;
  notes?: string;
}

export type TimeClockType = 'entrada' | 'saida';

/** Marcação de ponto (entrada/saída) do técnico. */
export interface TimeClockEntry {
  id: string;
  orgId: string;
  technicianId: string;
  type: TimeClockType;
  timestamp: string; // ISO
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
  /** Validade padrão do serviço (dias) — sugere a validade da OS. */
  defaultValidityDays?: number;
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
  /** Valor final acordado do serviço nesta OS — sempre com origem explícita:
   *  sugerido pelo preço padrão do(s) serviço(s) selecionado(s), mas editável
   *  por OS. Usado em OS/Recibo/Financeiro/Serviços a Receber/NF. */
  serviceValue?: number;
  /** Situação do pagamento — "Serviço pago" (sim/não) e seus desdobramentos
   *  no Financeiro. Alimenta automaticamente Serviços a Receber quando pendente. */
  paymentStatus?: PaymentStatus;
  /** Data em que o pagamento foi efetivamente recebido. */
  paymentDate?: string;
  /** Garantia do serviço (com/sem, prazo e tipo). */
  warranty?: WarrantyInfo;
  /** Recorrência do serviço. */
  recurrence?: OsRecurrence;
  /** Data do serviço (execução). */
  executionDate?: string;
  /** Data de vencimento do pagamento. */
  dueDate?: string;
  /** Validade do serviço executado (proteção contra as pragas tratadas). */
  validityDate?: string;
  /** Validade do certificado emitido — pode divergir da validade do serviço
   *  quando o serviço foi feito sem garantia (certificado não se aplica). */
  certificateValidityDate?: string;
  /** Data prevista da próxima visita (quando o serviço é recorrente). */
  nextVisitDate?: string;
  /** Validade individual por praga combatida — sobrepõe o padrão do cadastro
   *  da praga (Pest.defaultValidityDays) quando informada nesta OS. */
  pestValidity?: { pestId: string; validityDate?: string }[];
  /** Quantidade por área tratada (ex.: 2 Quartos, 1 Sala) — chave é o id de TreatedArea. */
  areaQty?: Record<string, number>;
  /** Mensagem interna para o técnico — visível apenas no app de campo;
   *  nunca deve aparecer na OS impressa, no Certificado ou no Laudo. */
  technicianMessage?: string;
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
  /** Validade da proteção contra essa praga (dias) — sugere a validade da OS. */
  defaultValidityDays?: number;
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

/** Situação do pagamento do serviço — reflete no Financeiro (Serviços a Receber). */
export type PaymentStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado';

export interface OsRecurrence {
  enabled: boolean;
  frequency?: RecurrenceFreq;
}

/** Forma de emissão do pagamento. */
export type PaymentMethodKind = 'cheque' | 'debito_conta' | 'eletronico' | 'dinheiro';
/** Aprovação eletrônica do pagamento antes da emissão. */
export type ApprovalStatus = 'pendente' | 'aprovado' | 'reprovado';
/** Tributo estadual/municipal vinculado ao lançamento. */
export type TaxKind = 'darf' | 'iptu' | 'concessionaria';

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
  /** Aprovação eletrônica — despesas só são emitidas depois de aprovadas. */
  approvalStatus?: ApprovalStatus;
  /** Desconto vinculado ao lançamento (abatido do valor na emissão). */
  discount?: number;
  /** Forma de emissão do pagamento. */
  paymentMethod?: PaymentMethodKind;
  /** Conta bancária usada na emissão/recebimento. */
  bankAccountId?: string;
  /** Agrupa vários lançamentos pagos juntos em uma mesma emissão. */
  groupId?: string;
  /** Tributo estadual/municipal (DARF, IPTU, concessionárias). */
  taxKind?: TaxKind;
  /** Vencimento original, preenchido quando a pendência é prorrogada. */
  postponedFrom?: string;
  /** Documento fiscal anexado (nota fiscal do fornecedor) — nome e conteúdo. */
  fiscalDocumentName?: string;
  fiscalDocumentUrl?: string;
}

/** Conta bancária da empresa — saldo calculado a partir dos lançamentos (BankTransaction). */
export interface BankAccount {
  id: string;
  orgId: string;
  bank: string;
  agency?: string;
  account: string;
  alias?: string;
  openingBalance: number;
  isActive: boolean;
}

/** Movimentação de uma conta bancária — extrato eletrônico e conciliação. */
export interface BankTransaction {
  id: string;
  orgId: string;
  accountId: string;
  type: 'deposito' | 'transferencia_saida' | 'transferencia_entrada' | 'pagamento' | 'recebimento' | 'estorno';
  amount: number;
  date: string;
  description?: string;
  reconciled: boolean;
  relatedFinanceEntryId?: string;
  transferPairId?: string;
}

/** Cheque emitido — controle de compensação. */
export interface Check {
  id: string;
  orgId: string;
  number: string;
  bank: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  payee?: string;
  status: 'emitido' | 'compensado' | 'devolvido' | 'cancelado';
  financeEntryId?: string;
}

/** Empréstimo ou aplicação financeira — saldo real x teórico. */
export interface LoanInvestment {
  id: string;
  orgId: string;
  kind: 'emprestimo' | 'aplicacao';
  description: string;
  principal: number;
  rate?: number;
  startDate: string;
  dueDate?: string;
  theoreticalBalance: number;
  realBalance: number;
  active: boolean;
}

/** Fechamento diário de caixa. */
export interface CashClosing {
  id: string;
  orgId: string;
  date: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  closedBy?: string;
  closedAt: string;
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
