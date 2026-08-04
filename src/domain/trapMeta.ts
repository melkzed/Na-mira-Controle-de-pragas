import type { TrapStatus } from './types';

export const TRAP_STATUS_META: Record<TrapStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ativa: { label: 'Ativa', tone: 'success' },
  extraviada: { label: 'Extraviada', tone: 'danger' },
  substituida: { label: 'Substituída', tone: 'warning' },
  retirada: { label: 'Retirada', tone: 'neutral' },
};
