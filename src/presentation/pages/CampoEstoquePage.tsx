import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Package, PackagePlus, Wrench } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Combobox } from '../components/ui/Combobox';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Textarea } from '../components/ui/Field';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { technicianBalances } from '@/application/repository';
import { useEquipmentStore } from '@/store/entityStores';
import { useStockRequestsStore } from '@/store/stockRequestsStore';
import { useEquipmentRequestsStore } from '@/store/equipmentRequestsStore';
import { toast } from '@/store/toastStore';
import { fmtDate } from '@/lib/date';

const EQUIPMENT_REQUEST_STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', aprovada: 'Aprovada', negada: 'Negada' };

/** "Estoque" do App do Técnico — produtos e ferramentas/equipamentos alocados, com solicitação de reposição. */
export function CampoEstoquePage() {
  const { techId } = useFieldTech();
  const requestRestock = useStockRequestsStore((s) => s.add);
  const loc = `loc-${techId.replace('u-', '')}`;
  const stock = technicianBalances(loc);

  const equipment = useEquipmentStore((s) => s.items);
  const { requests, add: requestEquipment } = useEquipmentRequestsStore();
  const mine = equipment.filter((e) => e.checkedOutTo === techId);
  const myRequests = requests.filter((r) => r.technicianId === techId).slice(0, 5);
  const [equipmentId, setEquipmentId] = useState('');
  const [note, setNote] = useState('');
  // Reposição pedida pelo técnico: quem sabe quanto precisa é ele. Antes o
  // sistema chutava `max(minQuantity, 5)` e o pedido chegava ao almoxarifado
  // com um número que ninguém escolheu.
  const [restock, setRestock] = useState<{ id: string; name: string; unit: string; saldo: number } | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockNote, setRestockNote] = useState('');

  const doRequestEquipment = () => {
    if (!equipmentId) return;
    const eq = equipment.find((e) => e.id === equipmentId);
    requestEquipment({ technicianId: techId, equipmentId, note: note.trim() || undefined });
    toast(`Solicitação de "${eq?.name}" enviada ao almoxarifado.`, { tone: 'success' });
    setEquipmentId(''); setNote('');
  };

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Estoque</h1>
        <Link to="/campo/produtos" className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"><BookOpen size={14} /> Catálogo de produtos</Link>
      </div>

      <p className="mb-2 px-1 text-sm font-semibold text-foreground">Meus produtos <span className="font-normal text-muted-foreground">· solicite reposição ao estoque</span></p>
      <Card>
        <CardBody className="space-y-2.5">
          {stock.length === 0 && <p className="text-sm text-muted-foreground">Sem produtos alocados.</p>}
          {stock.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                <p className="truncate text-xs text-muted-foreground">{product.activeIngredient ?? product.manufacturer}</p>
              </div>
              <Badge tone={quantity <= 2 ? 'warning' : 'neutral'}>{quantity} {product.unit}</Badge>
              <button
                onClick={() => {
                  setRestock({ id: product.id, name: product.name, unit: product.unit, saldo: quantity });
                  setRestockQty(String(Math.max(product.minQuantity, 5)));
                  setRestockNote('');
                }}
                aria-label={`Solicitar reposição de ${product.name}`}
                className="shrink-0 rounded-lg border border-border p-1.5 text-brand transition hover:bg-brand-soft"
                title="Solicitar reposição"
              ><PackagePlus size={15} /></button>
            </div>
          ))}
        </CardBody>
      </Card>

      <p className="mb-2 mt-6 px-1 text-sm font-semibold text-foreground">Ferramentas e equipamentos <span className="font-normal text-muted-foreground">· comigo e solicitações</span></p>
      <Card>
        <CardBody className="space-y-3">
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum equipamento retirado no momento.</p>
          ) : (
            <div className="space-y-2">
              {mine.map((e) => (
                <div key={e.id} className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Wrench size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{e.name}{e.code ? ` (${e.code})` : ''}</p>
                    {e.expectedReturnAt && <p className="truncate text-xs text-muted-foreground">Devolução prevista: {fmtDate(e.expectedReturnAt)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Solicitar equipamento</p>
            <div className="space-y-2">
              <Combobox
                value={equipmentId}
                onChange={setEquipmentId}
                placeholder="Buscar equipamento…"
                options={equipment.map((e) => ({ value: e.id, label: e.name, sub: e.code }))}
              />
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder="Observação (opcional)"
                  className="h-9 flex-1 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <Button size="sm" disabled={!equipmentId} onClick={doRequestEquipment}>Solicitar</Button>
              </div>
            </div>
          </div>

          {myRequests.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Minhas solicitações recentes</p>
              {myRequests.map((r) => {
                const eq = equipment.find((e) => e.id === r.equipmentId);
                const tone = r.status === 'aprovada' ? 'success' : r.status === 'negada' ? 'danger' : 'warning';
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{eq?.name ?? r.equipmentId}</span>
                    <Badge tone={tone}>{EQUIPMENT_REQUEST_STATUS_LABEL[r.status]}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={!!restock}
        onClose={() => setRestock(null)}
        title="Solicitar reposição"
        subtitle={restock?.name}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRestock(null)}>Cancelar</Button>
            <Button
              leftIcon={<Check size={15} />}
              disabled={!(Number(restockQty) > 0)}
              onClick={() => {
                if (!restock || !(Number(restockQty) > 0)) return;
                requestRestock({
                  productId: restock.id,
                  quantity: Number(restockQty),
                  requestedBy: techId,
                  note: restockNote.trim() || undefined,
                });
                toast(`Reposição de ${restockQty} ${restock.unit} de ${restock.name} solicitada ao estoque.`, { tone: 'success' });
                setRestock(null);
              }}
            >
              Solicitar
            </Button>
          </div>
        }
      >
        {restock && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-sm font-semibold text-foreground">{restock.name}</p>
              <p className="text-xs text-muted-foreground">Você tem {restock.saldo} {restock.unit} no seu estoque.</p>
            </div>
            <Field label={`Quantidade a solicitar (${restock.unit})`} required>
              <Input
                type="number" min={1} step="any" inputMode="decimal"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                autoFocus
              />
              {!(Number(restockQty) > 0) && <span className="mt-1 block text-xs text-danger">Informe quanto você precisa.</span>}
            </Field>
            <Field label="Observação para o almoxarifado">
              <Textarea rows={3} value={restockNote} onChange={(e) => setRestockNote(e.target.value)} placeholder="Ex.: preciso para o atendimento de amanhã cedo." />
            </Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}
