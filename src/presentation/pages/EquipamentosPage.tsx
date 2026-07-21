import { useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import { getUser } from '@/application/repository';
import { users } from '@/infrastructure/seed/data';
import { useEquipmentStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
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
  const { items, add, remove } = useEquipmentStore();
  const [formOpen, setFormOpen] = useState(false);

  const columns: Column<Equipment>[] = [
    { key: 'name', header: 'Equipamento', render: (e) => (<div><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.code} · Patrimônio {e.assetNumber}</p></div>) },
    { key: 'kind', header: 'Tipo', render: (e) => <Badge tone="neutral">{e.kind}</Badge> },
    { key: 'resp', header: 'Responsável', render: (e) => getUser(e.assignedTo)?.name ?? '—' },
    { key: 'maint', header: 'Próx. manutenção', render: (e) => e.nextMaintenanceAt ? fmtDate(e.nextMaintenanceAt) : '—' },
    { key: 'status', header: 'Status', align: 'right', render: (e) => <Badge tone={statusMeta[e.status].tone} dot>{statusMeta[e.status].label}</Badge> },
    { key: 'act', header: '', align: 'right', render: (e) => (
      <button onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 size={15} /></button>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Equipamentos" description={`${items.length} itens · pulverizadores, bombas, EPIs e ferramentas`} actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo equipamento</Button>} />
      <Table columns={columns} rows={items} keyField={(e) => e.id} />
      <EquipmentForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(e) => { add(e); setFormOpen(false); }} />
    </div>
  );
}

function EquipmentForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (e: Equipment) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [assetNumber, setAssetNumber] = useState('');
  const [kind, setKind] = useState('Pulverizador');
  const [status, setStatus] = useState<EquipmentStatus>('disponivel');
  const [assignedTo, setAssignedTo] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setCode(''); setAssetNumber(''); setKind('Pulverizador'); setStatus('disponivel'); setAssignedTo(''); setTouched(false); }
  }, [open]);

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    onSave({ id: uid('eq'), orgId: 'org-namira', name: name.trim(), code: code.trim() || undefined, assetNumber: assetNumber.trim() || undefined, kind, status, assignedTo: assignedTo || undefined });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Novo equipamento" subtitle="Cadastro de equipamento"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!name.trim()}>Adicionar</Button></div>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome" required className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} />{touched && !name.trim() && <span className="mt-1 block text-xs text-danger">Informe o nome.</span>}</Field>
        <Field label="Código"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PC-01" /></Field>
        <Field label="Nº patrimônio"><Input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} placeholder="PAT-1001" /></Field>
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{['Pulverizador', 'Bomba', 'Nebulizador', 'EPI', 'Ferramenta'].map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>{(Object.keys(statusMeta) as EquipmentStatus[]).map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}</Select></Field>
        <Field label="Responsável" className="col-span-2"><Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </div>
    </Drawer>
  );
}
