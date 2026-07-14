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

export function ServiceOrderStatusBadge({ status }: { status: ServiceOrderStatus }) {
  const meta = SERVICE_ORDER_STATUS_META[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}
