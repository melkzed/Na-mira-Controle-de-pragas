import { useState } from 'react';
import { ArrowLeftRight, PackagePlus, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/misc';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import { Avatar } from '../components/ui/Avatar';
import * as seed from '@/infrastructure/seed/data';
import { centralBalance, getUser, technicianBalances } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import type { Product } from '@/domain/types';
import { formatNumber, daysUntil } from '@/lib/utils';
import { fmtDate } from '@/lib/date';

export function EstoquePage() {
  const [tab, setTab] = useState<'central' | 'tecnicos' | 'validade'>('central');

  return (
    <div>
      <PageHeader
        title="Controle de Estoque"
        description="Estoque central e estoque individual de cada técnico"
        actions={
          <>
            <Button variant="outline" leftIcon={<ArrowLeftRight size={16} />}>Transferir</Button>
            <Button leftIcon={<PackagePlus size={16} />}>Entrada</Button>
          </>
        }
      />

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
    </div>
  );
}

function CentralStock() {
  const products = useProductsStore((s) => s.items);
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
