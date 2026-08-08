import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { getUser } from '@/application/repository';
import { useVehiclesStore, useUsersStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
import { toast } from '@/store/toastStore';
import type { Vehicle } from '@/domain/types';
import { formatNumber } from '@/lib/utils';

export function VeiculosPage() {
  const { items, add, update, remove } = useVehiclesStore();
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico' && u.isActive));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setFormOpen(true); };

  return (
    <div>
      <PageHeader title="Veículos" description={`${items.length} veículos · frota, abastecimentos e manutenções`} actions={<Button leftIcon={<Plus size={16} />} onClick={openNew}>Novo veículo</Button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => {
          const driver = getUser(v.driverId);
          return (
            <Card key={v.id} hover className="group p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Truck size={22} /></div>
                <div className="flex items-center gap-2">
                  <Badge tone={v.inOperation ? 'brand' : 'neutral'} dot>{v.inOperation ? 'Em operação' : 'Na base'}</Badge>
                  <button onClick={() => openEdit(v)} aria-label={`Editar veículo ${v.plate}`} className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-brand group-hover:opacity-100" title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => { remove(v.id); toast('Veículo excluído', { tone: 'danger', action: { label: 'Desfazer', onClick: () => add(v) } }); }} aria-label={`Excluir veículo ${v.plate}`} className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-danger group-hover:opacity-100" title="Excluir"><Trash2 size={15} /></button>
                </div>
              </div>
              <p className="mt-3 text-lg font-bold tracking-tight text-foreground">{v.plate}</p>
              <p className="text-sm text-muted-foreground">{v.model}</p>
              <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    Técnico responsável {driver && <Avatar name={driver.name} size="xs" />}
                  </span>
                  <Select
                    value={v.driverId ?? ''}
                    onChange={(e) => {
                      update(v.id, { driverId: e.target.value || undefined });
                      const newDriver = technicians.find((t) => t.id === e.target.value);
                      toast(newDriver ? `${v.plate} agora com ${newDriver.name}.` : `${v.plate} sem técnico responsável.`, { tone: 'success' });
                    }}
                    className="h-9 text-sm"
                    aria-label={`Técnico responsável pelo veículo ${v.plate}`}
                  >
                    <option value="">Sem técnico</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </label>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Quilometragem</span><span className="font-medium text-foreground">{formatNumber(v.odometerKm)} km</span></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Mini label="Abastec." value="8" />
                <Mini label="Manut." value="2" />
                <Mini label="Seguro" value="OK" />
              </div>
            </Card>
          );
        })}
      </div>
      <VehicleForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={(v) => {
          if (editing) update(editing.id, v);
          else add({ id: uid('veh'), orgId: 'org-namira', isActive: true, ...v });
          setFormOpen(false);
        }}
      />
    </div>
  );
}

function VehicleForm({ open, initial, onClose, onSave }: { open: boolean; initial: Vehicle | null; onClose: () => void; onSave: (v: Omit<Vehicle, 'id' | 'orgId' | 'isActive'>) => void }) {
  const users = useUsersStore((s) => s.items);
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [driverId, setDriverId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [inOperation, setInOperation] = useState(false);
  const [touched, setTouched] = useState(false);
  const isEdit = !!initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setPlate(initial.plate); setModel(initial.model ?? ''); setDriverId(initial.driverId ?? '');
      setOdometer(String(initial.odometerKm)); setInOperation(initial.inOperation ?? false);
    } else {
      setPlate(''); setModel(''); setDriverId(''); setOdometer(''); setInOperation(false);
    }
    setTouched(false);
  }, [open, initial]);

  const submit = () => {
    setTouched(true);
    if (!plate.trim()) return;
    onSave({ plate: plate.trim().toUpperCase(), model: model.trim() || undefined, driverId: driverId || undefined, odometerKm: Number(odometer) || 0, inOperation });
  };

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? 'Editar veículo' : 'Novo veículo'} subtitle={isEdit ? initial?.plate : 'Cadastro de veículo da frota'}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!plate.trim()}>{isEdit ? 'Salvar' : 'Adicionar'}</Button></div>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Placa" required><Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC-1D23" />{touched && !plate.trim() && <span className="mt-1 block text-xs text-danger">Informe a placa.</span>}</Field>
        <Field label="Modelo"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Fiat Fiorino" /></Field>
        <Field label="Motorista" className="col-span-2"><Select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Quilometragem (km)"><Input type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
          <input type="checkbox" checked={inOperation} onChange={(e) => setInOperation(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Em operação
        </label>
      </div>
    </Drawer>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-2 text-center"><p className="text-sm font-bold text-foreground">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}
