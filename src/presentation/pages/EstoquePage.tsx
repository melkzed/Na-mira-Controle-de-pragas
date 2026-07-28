import { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, PackagePlus, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/misc';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import { Avatar } from '../components/ui/Avatar';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import * as seed from '@/infrastructure/seed/data';
import { centralBalance, getProduct, getUser, technicianBalances } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import { useStockStore } from '@/store/stockStore';
import { useStockRequestsStore } from '@/store/stockRequestsStore';
import { toast } from '@/store/toastStore';
import type { Product } from '@/domain/types';
import { formatNumber, daysUntil } from '@/lib/utils';
import { fmtDate } from '@/lib/date';
import { PackageCheck } from 'lucide-react';

export function EstoquePage() {
  const [tab, setTab] = useState<'central' | 'tecnicos' | 'validade'>('central');
  const [entryOpen, setEntryOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Controle de Estoque"
        description="Estoque central e estoque individual de cada técnico"
        actions={
          <>
            <Button variant="outline" leftIcon={<ArrowLeftRight size={16} />} onClick={() => setTransferOpen(true)}>Transferir</Button>
            <Button leftIcon={<PackagePlus size={16} />} onClick={() => setEntryOpen(true)}>Entrada</Button>
          </>
        }
      />

      <RestockRequestsPanel />

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'central', label: 'Estoque Central' },
            { value: 'tecnicos', label: 'Estoque dos Técnicos' },
            { value: 'validade', label: 'Validade / Lotes' },
          ]}
        />
      </div>

      {tab === 'central' && <CentralStock />}
      {tab === 'tecnicos' && <TechStock />}
      {tab === 'validade' && <BatchStock />}

      <EntryForm open={entryOpen} onClose={() => setEntryOpen(false)} />
      <TransferForm open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}

/** Pendências de reposição solicitadas pelos técnicos / pela OS. */
function RestockRequestsPanel() {
  const { requests, resolve } = useStockRequestsStore();
  const entry = useStockStore((s) => s.entry);
  const pending = requests.filter((r) => r.status === 'pendente');

  const atender = (id: string, productId: string, quantity: number) => {
    entry('loc-central', productId, quantity); // repõe no estoque central
    resolve(id, 'atendida');
    toast('Reposição atendida e lançada no estoque central.', { tone: 'success' });
  };

  if (pending.length === 0) return null;

  return (
    <Card className="mb-4 border-warning/40">
      <CardHeader
        title={<span className="flex items-center gap-2"><PackageCheck size={16} className="text-warning" /> Solicitações de reposição</span>}
        subtitle={`${pending.length} pendência(s) — enviadas pelos técnicos / OS`}
      />
      <CardBody className="space-y-2">
        {pending.map((r) => {
          const prod = getProduct(r.productId);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{prod?.name ?? r.productId} <span className="font-normal text-muted-foreground">· {r.quantity} {prod?.unit}</span></p>
                <p className="text-xs text-muted-foreground">
                  {getUser(r.requestedBy)?.name ?? 'Solicitante'} · {fmtDate(r.createdAt)}{r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              <Badge tone="warning" dot>Pendente</Badge>
              <Button size="sm" variant="outline" onClick={() => resolve(r.id, 'cancelada')}>Recusar</Button>
              <Button size="sm" onClick={() => atender(r.id, r.productId, r.quantity)}>Atender</Button>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/** Entrada de estoque (compra/ajuste) em um local. */
function EntryForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useProductsStore((s) => s.items);
  const entry = useStockStore((s) => s.entry);
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('loc-central');
  const [qty, setQty] = useState('');

  useEffect(() => { if (open) { setProductId(products[0]?.id ?? ''); setLocationId('loc-central'); setQty(''); } }, [open, products]);

  const submit = () => {
    const n = Number(qty);
    if (!productId || !n || n <= 0) return;
    entry(locationId, productId, n);
    const prod = products.find((p) => p.id === productId);
    toast(`Entrada registrada: +${n} ${prod?.unit ?? ''} de ${prod?.name ?? ''}`, { tone: 'success' });
    onClose();
  };

  return (
    <Drawer open={open} onClose={onClose} title="Entrada de estoque" subtitle="Compra ou ajuste de saldo"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!productId || !(Number(qty) > 0)}>Registrar entrada</Button></div>}>
      <div className="space-y-4">
        <Field label="Produto" required>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <Field label="Local">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{seed.stockLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        </Field>
        <Field label="Quantidade" required>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Drawer>
  );
}

/** Transferência de saldo entre locais (ex.: central → técnico). */
function TransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useProductsStore((s) => s.items);
  const transfer = useStockStore((s) => s.transfer);
  const balanceOf = useStockStore((s) => s.balanceOf);
  const [productId, setProductId] = useState('');
  const [fromLoc, setFromLoc] = useState('loc-central');
  const [toLoc, setToLoc] = useState('');
  const [qty, setQty] = useState('');

  const techLocations = seed.stockLocations.filter((l) => l.kind === 'tecnico');
  useEffect(() => {
    if (open) { setProductId(products[0]?.id ?? ''); setFromLoc('loc-central'); setToLoc(techLocations[0]?.id ?? ''); setQty(''); }
  }, [open, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = productId ? balanceOf(fromLoc, productId) : 0;
  const n = Number(qty);
  const valid = !!productId && !!toLoc && fromLoc !== toLoc && n > 0 && n <= available;

  const submit = () => {
    if (!valid) return;
    const ok = transfer(fromLoc, toLoc, productId, n);
    const prod = products.find((p) => p.id === productId);
    if (ok) { toast(`Transferido ${n} ${prod?.unit ?? ''} de ${prod?.name ?? ''}`, { tone: 'success' }); onClose(); }
    else toast('Saldo insuficiente para transferir.', { tone: 'danger' });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Transferir estoque" subtitle="Movimentação entre locais"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Transferir</Button></div>}>
      <div className="space-y-4">
        <Field label="Produto" required>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="De"><Select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>{seed.stockLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Para"><Select value={toLoc} onChange={(e) => setToLoc(e.target.value)}>{seed.stockLocations.filter((l) => l.id !== fromLoc).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        </div>
        <Field label="Quantidade" required hint={`Disponível na origem: ${available}`}>
          <Input type="number" min={1} max={available} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          {n > available && <span className="mt-1 block text-xs text-danger">Acima do saldo disponível ({available}).</span>}
        </Field>
      </div>
    </Drawer>
  );
}

function CentralStock() {
  const products = useProductsStore((s) => s.items);
  useStockStore((s) => s.balances); // reatividade ao alterar o estoque
  const columns: Column<Product>[] = [
    { key: 'name', header: 'Produto', render: (p) => (
      <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.activeIngredient ?? p.manufacturer}</p></div>
    ) },
    { key: 'qty', header: 'Saldo', render: (p) => {
      const qty = centralBalance(p.id);
      const pct = Math.min(100, (qty / (p.minQuantity * 3 || 1)) * 100);
      return (
        <div className="w-32">
          <div className="flex justify-between text-xs"><span className="font-semibold">{formatNumber(qty)} {p.unit}</span><span className="text-muted-foreground">mín {p.minQuantity}</span></div>
          <Progress value={pct} tone={qty <= p.minQuantity ? 'danger' : qty <= p.minQuantity * 1.5 ? 'warning' : 'success'} className="mt-1" />
        </div>
      );
    } },
    { key: 'loc', header: 'Local', render: (p) => <span className="text-muted-foreground">{p.storageLocation ?? '—'}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (p) => {
      const qty = centralBalance(p.id);
      return qty <= p.minQuantity ? <Badge tone="danger" dot>Repor</Badge> : qty <= p.minQuantity * 1.5 ? <Badge tone="warning" dot>Baixo</Badge> : <Badge tone="success" dot>OK</Badge>;
    } },
  ];
  return <Table columns={columns} rows={products} keyField={(p) => p.id} />;
}

function TechStock() {
  useStockStore((s) => s.balances); // reatividade ao alterar o estoque
  const techLocations = seed.stockLocations.filter((l) => l.kind === 'tecnico');
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {techLocations.map((loc) => {
        const balances = technicianBalances(loc.id);
        const owner = getUser(loc.ownerId);
        return (
          <Card key={loc.id}>
            <CardHeader
              title={<div className="flex items-center gap-2"><Avatar name={owner?.name ?? '?'} size="sm" />{owner?.name}</div>}
              subtitle={`${balances.length} itens alocados`}
            />
            <CardBody className="space-y-2.5">
              {balances.map(({ product, quantity }) => (
                <div key={product.id} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{product.name}</span>
                  <Badge tone={quantity <= 2 ? 'warning' : 'neutral'}>{quantity} {product.unit}</Badge>
                </div>
              ))}
              {balances.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function BatchStock() {
  const products = useProductsStore((s) => s.items);
  const rows = products
    .flatMap((product) => (product.batches ?? []).map((batch) => ({ product, batch })))
    .sort((a, b) => (a.batch.expiresAt ?? '') < (b.batch.expiresAt ?? '') ? -1 : 1);
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'product', header: 'Produto', render: (r) => <span className="font-medium">{r.product.name}</span> },
    { key: 'batch', header: 'Lote', render: (r) => <span className="text-muted-foreground">{r.batch.code}</span> },
    { key: 'qty', header: 'Qtd.', render: (r) => `${r.batch.quantity} ${r.product.unit}` },
    { key: 'exp', header: 'Validade', render: (r) => r.batch.expiresAt ? fmtDate(r.batch.expiresAt) : '—' },
    { key: 'status', header: 'Situação', align: 'right', render: (r) => {
      const d = daysUntil(r.batch.expiresAt) ?? 999;
      if (d < 0) return <Badge tone="danger" dot><TriangleAlert size={11} className="mr-1" />Vencido</Badge>;
      if (d <= 30) return <Badge tone="warning" dot>Vence em {d}d</Badge>;
      return <Badge tone="success" dot>Válido</Badge>;
    } },
  ];
  return <Table columns={columns} rows={rows} keyField={(r) => `${r.product.id}-${r.batch.id}`} empty="Nenhum lote cadastrado." />;
}
