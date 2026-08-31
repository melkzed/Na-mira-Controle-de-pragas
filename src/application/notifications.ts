/**
 * Aplicação — para onde cada notificação leva.
 *
 * Notificação que só informa obriga a pessoa a procurar o que aconteceu no
 * menu. Aqui o tipo de entidade vira rota, e o id (quando existe) já abre o
 * registro — as telas de Clientes e Ordens de Serviço aceitam `?id=`.
 */
import type { AppNotification } from '@/domain/types';

/** Rota do módulo de cada tipo de entidade. Tipo desconhecido não vira link:
 *  melhor não ter clique do que mandar a pessoa para o lugar errado. */
const MODULE_ROUTE: Record<string, string> = {
  service_order: '/ordens',
  appointment: '/agenda',
  customer: '/clientes',
  product: '/produtos',
  stock: '/estoque',
  equipment: '/equipamentos',
  technician: '/tecnicos',
  vehicle: '/veiculos',
  finance: '/financeiro',
  fiscal: '/fiscal',
  license: '/relatorios',
  non_conformity: '/nao-conformidade',
  trap: '/monitoramento',
  crm: '/crm',
};

/** Telas que sabem abrir um registro específico pela URL (`?id=`). */
const SUPPORTS_ID = new Set(['/ordens', '/clientes']);

/** Destino da notificação, ou `null` quando não há para onde levar. */
export function notificationLink(n: AppNotification): string | null {
  const base = n.entityType ? MODULE_ROUTE[n.entityType] : undefined;
  if (!base) return null;
  if (n.entityId && SUPPORTS_ID.has(base)) return `${base}?id=${n.entityId}`;
  return base;
}
