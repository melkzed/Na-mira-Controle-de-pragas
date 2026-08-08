/**
 * Domínio — enumerações espelhando o esquema PostgreSQL (db/schema.sql).
 * Camada de domínio: sem dependências de framework/infra.
 */

export type UserRole =
  | 'admin'
  | 'supervisor'
  | 'financeiro'
  | 'atendimento'
  | 'estoque'
  | 'tecnico';

export type CustomerType = 'pf' | 'pj';

export type AppointmentStatus =
  | 'programada'
  | 'agendado'
  | 'confirmado'
  | 'em_deslocamento'
  | 'em_atendimento'
  | 'finalizado'
  | 'cancelado'
  | 'reagendado';

export type AppointmentPriority = 'baixa' | 'normal' | 'alta' | 'urgente';

export type ServiceOrderStatus =
  | 'rascunho'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export type StockMovementType =
  | 'entrada'
  | 'saida'
  | 'transferencia'
  | 'consumo'
  | 'perda'
  | 'ajuste'
  | 'devolucao';

export type StockLocationKind = 'central' | 'tecnico' | 'veiculo';

export type FinanceEntryType = 'receita' | 'despesa';

export type FinanceEntryStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelado';

export type CrmStage =
  | 'novo_contato'
  | 'orcamento'
  | 'negociacao'
  | 'follow_up'
  | 'ganho'
  | 'perdido';

export type EquipmentStatus = 'disponivel' | 'em_uso' | 'manutencao' | 'perdido' | 'danificado' | 'inativo';

// ── Metadados de apresentação para os estados de domínio ──────────────────

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'brand' | 'success' | 'danger' }
> = {
  programada: { label: 'Programada', tone: 'neutral' },
  agendado: { label: 'Aguardando confirmação', tone: 'warning' },
  confirmado: { label: 'Confirmada', tone: 'info' },
  em_deslocamento: { label: 'Em deslocamento', tone: 'warning' },
  em_atendimento: { label: 'Em atendimento', tone: 'brand' },
  finalizado: { label: 'Finalizada', tone: 'success' },
  cancelado: { label: 'Cancelada', tone: 'danger' },
  reagendado: { label: 'Reagendada', tone: 'neutral' },
};

/** Status expostos como filtro/estados de confirmação da visita. */
export const CONFIRMATION_STATUSES: AppointmentStatus[] = [
  'programada',
  'agendado',
  'confirmado',
  'reagendado',
  'cancelado',
];

export const APPOINTMENT_PRIORITY_META: Record<
  AppointmentPriority,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
  baixa: { label: 'Baixa', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'info' },
  alta: { label: 'Alta', tone: 'warning' },
  urgente: { label: 'Urgente', tone: 'danger' },
};

export const SERVICE_ORDER_STATUS_META: Record<
  ServiceOrderStatus,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }
> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  em_andamento: { label: 'Em andamento', tone: 'brand' },
  concluida: { label: 'Concluída', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
};

export const CRM_STAGE_META: Record<CrmStage, { label: string; color: string }> = {
  novo_contato: { label: 'Novo contato', color: '#64748b' },
  orcamento: { label: 'Orçamento', color: '#6366f1' },
  negociacao: { label: 'Negociação', color: '#f59e0b' },
  follow_up: { label: 'Follow-up', color: '#0ea5e9' },
  ganho: { label: 'Ganho', color: '#10b981' },
  perdido: { label: 'Perdido', color: '#ef4444' },
};

export const ROLE_META: Record<UserRole, { label: string }> = {
  admin: { label: 'Administrador' },
  supervisor: { label: 'Supervisor' },
  financeiro: { label: 'Financeiro' },
  atendimento: { label: 'Atendimento' },
  estoque: { label: 'Estoque' },
  tecnico: { label: 'Técnico' },
};

// ── Ordem de Serviço avançada ──────────────────────────────────────────────
export type WarrantyUnit = 'dias' | 'meses';
export type WarrantyType = 'preventivo' | 'corretivo' | 'monitoramento';
export type RecurrenceFreq = 'semanal' | 'quinzenal' | '45dias' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export const WARRANTY_TYPE_LABEL: Record<WarrantyType, string> = {
  preventivo: 'Controle preventivo',
  corretivo: 'Controle corretivo',
  monitoramento: 'Monitoramento',
};

export const RECURRENCE_FREQ_LABEL: Record<RecurrenceFreq, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  '45dias': '45 dias',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

/** Aproximação em dias de cada frequência — usada para sugerir a próxima visita na OS. */
export const RECURRENCE_FREQ_DAYS: Record<RecurrenceFreq, number> = {
  semanal: 7,
  quinzenal: 15,
  '45dias': 45,
  mensal: 30,
  bimestral: 60,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

/** Formas de pagamento comuns (usadas na OS). */
export const PAYMENT_METHODS = ['Dinheiro', 'PIX', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Transferência', 'A faturar'] as const;
