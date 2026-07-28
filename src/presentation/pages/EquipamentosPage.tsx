import { useEffect, useState } from 'react';
import { Check, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
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
import { toast } from '@/store/toastStore';

const statusMeta: Record<EquipmentStatus, { label: string; tone: any }> = {
  disponivel: { label: 'Disponível', tone: 'success' },
  em_uso: { label: 'Em uso', tone: 'brand' },
  manutencao: { label: 'Manutenção', tone: 'warning' },
  inativo: { label: 'Inativo', tone: 'neutral' },
};

// Categorias de equipamento — base + personalizadas (persistidas no navegador).
const BASE_KINDS = ['Pulverizador', 'Bomba', 'Nebulizador', 'EPI', 'Ferramenta'];
const KINDS_KEY = 'namira-equip-kinds';
function loadKinds(): string[] {
  try {
    const raw = localStorage.getItem(KINDS_KEY);
    const extra = raw ? (JSON.parse(raw) as string[]) : [];
    return [...BASE_KINDS, ...extra.filter((k) => !BASE_KINDS.includes(k))];
  } catch {
    return BASE_KINDS;
  }
}
function saveKind(kind: string) {
  try {
    const raw = localStorage.getItem(KINDS_KEY);
    const extra = raw ? (JSON.parse(raw) as string[]) : [];
    if (!BASE_KINDS.includes(kind) && !extra.includes(kind)) {
      localStorage.setItem(KINDS_KEY, JSON.stringify([...extra, kind]));
    }
  } catch {
    /* ignora */
  }
}

/** Equipamento em uso com devolução vencida. */
export function isEquipmentOverdue(e: Equipment): boolean {
  return e.status === 'em_uso' && !!e.expectedReturnAt && new Date(e.expectedReturnAt).getTime() < Date.now();
}
const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function EquipamentosPage() {
  const { items, add, update, remove } = useEquipmentStore();
  const [formOpen, setFormOpen] = useState(false);

  const emUso = items.filter((e) => e.status === 'em_uso');
  const atrasados = items.filter(isEquipmentOverdue);
  const disponiveis = items.filter((e) => e.status === 'disponivel');

  const devolver = (e: Equipment) => {
    update(e.id, { status: 'disponivel', checkedOutAt: undefined, checkedOutTo: undefined, checkedOutOsId: undefined, expectedReturnAt: undefined });
    toast(`${e.name} devolvido ao estoque.`, { tone: 'success' });
  };

  const columns: Column<Equipment>[] = [
    { key: 'name', header: 'Equipamento', render: (e) => (<div><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.code} · Patrimônio {e.assetNumber}</p></div>) },
    { key: 'kind', header: 'Tipo', render: (e) => <Badge tone="neutral">{e.kind}</Badge> },
    { key: 'resp', header: 'Responsável', render: (e) => getUser(e.checkedOutTo ?? e.assignedTo)?.name ?? '—' },
    { key: 'ret', header: 'Devolução prevista', render: (e) => e.status === 'em_uso'
      ? <span className={isEquipmentOverdue(e) ? 'font-semibold text-danger' : 'text-foreground'}>{fmtDateTime(e.expectedReturnAt)}{isEquipmentOverdue(e) ? ' · atrasado' : ''}</span>
      : <span className="text-muted-foreground">—</span> },
    { key: 'status', header: 'Status', align: 'right', render: (e) => isEquipmentOverdue(e)
      ? <Badge tone="danger" dot>Atrasado</Badge>
      : <Badge tone={statusMeta[e.status].tone} dot>{statusMeta[e.status].label}</Badge> },
    { key: 'act', header: '', align: 'right', render: (e) => (
      <div className="flex items-center justify-end gap-1">
        {e.status === 'em_uso' && <Button size="sm" variant="outline" onClick={(ev) => { ev.stopPropagation(); devolver(e); }}>Devolver</Button>}
        <button onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 size={15} /></button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Equipamentos" description={`${items.length} itens · pulverizadores, bombas, EPIs e ferramentas`} actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo equipamento</Button>} />

      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatMini label="Em uso" value={emUso.length} tone="brand" />
        <StatMini label="Atrasados" value={atrasados.length} tone={atrasados.length ? 'danger' : 'neutral'} />
        <StatMini label="Disponíveis" value={disponiveis.length} tone="success" />
      </div>

      {atrasados.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-sm text-danger">
          <TriangleAlert size={16} className="shrink-0" />
          {atrasados.length} equipamento(s) com devolução atrasada: {atrasados.map((e) => e.name).join(', ')}.
        </div>
      )}

      <Table columns={columns} rows={items} keyField={(e) => e.id} />
      <EquipmentForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(e) => { add(e); setFormOpen(false); }} />
    </div>
  );
}

function StatMini({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'danger' | 'success' | 'neutral' }) {
  const toneCls = { brand: 'text-brand', danger: 'text-danger', success: 'text-success', neutral: 'text-muted-foreground' }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
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
  const [kinds, setKinds] = useState<string[]>(BASE_KINDS);
  const [addingKind, setAddingKind] = useState(false);
  const [newKind, setNewKind] = useState('');

  useEffect(() => {
    if (open) { setName(''); setCode(''); setAssetNumber(''); setKinds(loadKinds()); setKind('Pulverizador'); setStatus('disponivel'); setAssignedTo(''); setTouched(false); setAddingKind(false); setNewKind(''); }
  }, [open]);

  const confirmNewKind = () => {
    const k = newKind.trim();
    if (!k) return;
    saveKind(k);
    setKinds((prev) => (prev.includes(k) ? prev : [...prev, k]));
    setKind(k);
    setAddingKind(false);
    setNewKind('');
  };

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
        <Field label="Tipo / Categoria">
          {addingKind ? (
            <div className="flex gap-2">
              <Input value={newKind} autoFocus onChange={(e) => setNewKind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewKind(); } }} placeholder="Nova categoria" />
              <Button type="button" variant="outline" size="icon" onClick={confirmNewKind} disabled={!newKind.trim()} aria-label="Salvar categoria"><Check size={16} /></Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => { setAddingKind(false); setNewKind(''); }} aria-label="Cancelar"><X size={16} /></Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k}>{k}</option>)}</Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setAddingKind(true)} title="Adicionar categoria" aria-label="Adicionar categoria"><Plus size={16} /></Button>
            </div>
          )}
        </Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>{(Object.keys(statusMeta) as EquipmentStatus[]).map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}</Select></Field>
        <Field label="Responsável" className="col-span-2"><Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </div>
    </Drawer>
  );
}
