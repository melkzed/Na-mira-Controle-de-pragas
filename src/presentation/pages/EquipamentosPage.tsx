import { Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getUser } from '@/application/repository';
import type { Equipment } from '@/domain/types';
import type { EquipmentStatus } from '@/domain/enums';
import { fmtDate } from '@/lib/date';

const statusMeta: Record<EquipmentStatus, { label: string; tone: any }> = {
  disponivel: { label: 'Disponível', tone: 'success' },
  em_uso: { label: 'Em uso', tone: 'brand' },
  manutencao: { label: 'Manutenção', tone: 'warning' },
  inativo: { label: 'Inativo', tone: 'neutral' },
};

export function EquipamentosPage() {
  const columns: Column<Equipment>[] = [
    { key: 'name', header: 'Equipamento', render: (e) => (
      <div><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.code} · Patrimônio {e.assetNumber}</p></div>
    ) },
    { key: 'kind', header: 'Tipo', render: (e) => <Badge tone="neutral">{e.kind}</Badge> },
    { key: 'resp', header: 'Responsável', render: (e) => getUser(e.assignedTo)?.name ?? '—' },
    { key: 'maint', header: 'Próx. manutenção', render: (e) => e.nextMaintenanceAt ? fmtDate(e.nextMaintenanceAt) : '—' },
    { key: 'status', header: 'Status', align: 'right', render: (e) => <Badge tone={statusMeta[e.status].tone} dot>{statusMeta[e.status].label}</Badge> },
  ];
  return (
    <div>
      <PageHeader title="Equipamentos" description="Pulverizadores, bombas, EPIs e ferramentas" actions={<Button leftIcon={<Plus size={16} />}>Novo equipamento</Button>} />
      <Table columns={columns} rows={seed.equipment} keyField={(e) => e.id} />
    </div>
  );
}
