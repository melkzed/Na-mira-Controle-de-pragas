import { Badge } from './ui/Badge';
import {
  APPOINTMENT_PRIORITY_META,
  APPOINTMENT_STATUS_META,
  SERVICE_ORDER_STATUS_META,
  type AppointmentPriority,
  type AppointmentStatus,
  type ServiceOrderStatus,
} from '@/domain/enums';

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const meta = APPOINTMENT_STATUS_META[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: AppointmentPriority }) {
  const meta = APPOINTMENT_PRIORITY_META[priority];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ServiceOrderStatusBadge({ status, cancelledBy }: {
  status: ServiceOrderStatus;
  /** Quando a OS foi cancelada, diz de quem partiu — o rótulo muda para
   *  "Cancelada pelo cliente", que é informação diferente de um cancelamento
   *  feito pela empresa. */
  cancelledBy?: 'cliente' | 'empresa';
}) {
  const meta = SERVICE_ORDER_STATUS_META[status];
  const label = status === 'cancelada' && cancelledBy
    ? `Cancelada pelo ${cancelledBy}`
    : meta.label;
  return <Badge tone={meta.tone} dot>{label}</Badge>;
}
