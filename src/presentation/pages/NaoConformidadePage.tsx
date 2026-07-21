import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, FileText, ImagePlus, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Select, Textarea } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { PriorityBadge } from '../components/StatusBadge';
import { useCustomersStore } from '@/store/customersStore';
import { useNonConformitiesStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
import { useAppStore } from '@/store/appStore';
import { logChange } from '@/store/auditStore';
import type { AppointmentPriority } from '@/domain/enums';
import type { NonConformity, NonConformityCategory, NonConformityStatus } from '@/domain/types';
import { fmtDate } from '@/lib/date';
import { NC_CATEGORY_LABEL, printNonConformityReport } from '@/lib/printReports';

const STATUS_META: Record<NonConformityStatus, { label: string; tone: 'warning' | 'brand' | 'success' }> = {
  aberta: { label: 'Aberta', tone: 'warning' },
  em_andamento: { label: 'Em andamento', tone: 'brand' },
  resolvida: { label: 'Resolvida', tone: 'success' },
};
const CATEGORIES: NonConformityCategory[] = ['fresta', 'falha_estrutural', 'limpeza_inadequada', 'armazenamento_incorreto', 'outra'];

export function NaoConformidadePage() {
  const [params, setParams] = useSearchParams();
  const customers = useCustomersStore((s) => s.customers);
  const { items, add, update, remove } = useNonConformitiesStore();
  const currentUser = useAppStore((s) => s.currentUser);

  const [customerId, setCustomerId] = useState(params.get('client') ?? customers[0]?.id ?? '');
  const customer = customers.find((c) => c.id === customerId);
  useEffect(() => { setParams(customerId ? { client: customerId } : {}, { replace: true }); }, [customerId, setParams]);

  const list = useMemo(
    () => items.filter((i) => i.customerId === customerId).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)),
    [items, customerId],
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Não Conformidades"
        description="Registro de frestas, falhas estruturais, limpeza e armazenamento inadequados"
        actions={
          <>
            <Button variant="outline" leftIcon={<FileText size={16} />} disabled={!customer || list.length === 0} onClick={() => customer && printNonConformityReport(customer, list)}>Gerar PDF</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova não conformidade</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Cliente:</span>
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="sm:max-w-xs">
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {list.length === 0 ? (
        <Card><CardBody className="py-16 text-center">
          <TriangleAlert size={26} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhuma não conformidade registrada</p>
          <p className="mt-1 text-sm text-muted-foreground">Registre frestas, falhas ou irregularidades encontradas no local.</p>
        </CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((nc) => (
            <Card key={nc.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{NC_CATEGORY_LABEL[nc.category]}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(nc.date)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={nc.priority} />
                  <button onClick={() => remove(nc.id)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 size={15} /></button>
                </div>
              </div>
              <p className="mt-2 text-sm text-foreground">{nc.description}</p>
              {nc.correctiveAction && <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Ação corretiva:</span> {nc.correctiveAction}</p>}
              {nc.photos && nc.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {nc.photos.map((ph, i) => <img key={i} src={ph.dataUrl} alt={ph.name} className="h-16 w-20 rounded-lg border border-border object-cover" />)}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Select value={nc.status} onChange={(e) => update(nc.id, { status: e.target.value as NonConformityStatus })} className="h-8 w-auto text-xs">
                  {(Object.keys(STATUS_META) as NonConformityStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </Select>
                <Badge tone={STATUS_META[nc.status].tone} dot>{STATUS_META[nc.status].label}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NcForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(data) => { add({ ...data, id: uid('nc'), orgId: 'org-namira', customerId, createdBy: currentUser?.id, createdAt: new Date().toISOString() }); logChange('criação', 'não conformidade', `${NC_CATEGORY_LABEL[data.category]} · ${customer?.name ?? ''}`); setFormOpen(false); }}
      />
    </div>
  );
}

type NcDraft = Pick<NonConformity, 'date' | 'category' | 'description' | 'priority' | 'correctiveAction' | 'status' | 'photos'>;

function NcForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (d: NcDraft) => void }) {
  const [category, setCategory] = useState<NonConformityCategory>('fresta');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<AppointmentPriority>('normal');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [photos, setPhotos] = useState<{ name: string; dataUrl: string }[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setCategory('fresta'); setDescription(''); setPriority('normal'); setCorrectiveAction(''); setPhotos([]); setTouched(false); }
  }, [open]);

  const onPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => [...p, { name: file.name, dataUrl: String(reader.result) }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const submit = () => {
    setTouched(true);
    if (!description.trim()) return;
    onSave({ date: new Date().toISOString(), category, description: description.trim(), priority, correctiveAction: correctiveAction.trim() || undefined, status: 'aberta', photos: photos.length ? photos : undefined });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova não conformidade" subtitle="Registro de irregularidade no local" width="max-w-xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!description.trim()}>Registrar</Button></div>}>
      <div className="space-y-4">
        <Field label="Categoria" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as NonConformityCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{NC_CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Descrição" required>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva a irregularidade encontrada…" />
          {touched && !description.trim() && <span className="mt-1 block text-xs text-danger">Informe a descrição.</span>}
        </Field>
        <Field label="Prioridade">
          <Segmented value={priority} onChange={setPriority} size="sm" options={[{ value: 'baixa', label: 'Baixa' }, { value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' }]} />
        </Field>
        <Field label="Ação corretiva recomendada">
          <Textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="Ex.: vedar frestas, instalar telas, adequar armazenamento…" />
        </Field>
        <Field label="Fotos">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted">
            <ImagePlus size={16} /> Anexar fotos
            <input type="file" accept="image/*" multiple onChange={onPhotos} className="hidden" />
          </label>
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((ph, i) => (
                <div key={i} className="relative">
                  <img src={ph.dataUrl} alt={ph.name} className="h-16 w-20 rounded-lg border border-border object-cover" />
                  <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Drawer>
  );
}
