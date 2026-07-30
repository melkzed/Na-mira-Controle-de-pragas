import type { EquipmentStatus } from './enums';

/** Rótulos e tom visual de cada status de equipamento/ferramenta. */
export const EQUIPMENT_STATUS_META: Record<EquipmentStatus, { label: string; tone: 'success' | 'brand' | 'warning' | 'danger' | 'neutral' }> = {
  disponivel: { label: 'Disponível', tone: 'success' },
  em_uso: { label: 'Em uso', tone: 'brand' },
  manutencao: { label: 'Manutenção', tone: 'warning' },
  perdido: { label: 'Perdido', tone: 'danger' },
  danificado: { label: 'Danificado', tone: 'danger' },
  inativo: { label: 'Inativo', tone: 'neutral' },
};
