import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { centralBalance } from '@/application/repository';
import type { Product } from '@/domain/types';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function ProdutosPage() {
  const [selected, setSelected] = useState<Product | null>(null);
  const catName = (id?: string) => seed.productCategories.find((c) => c.id === id)?.name ?? '—';

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Produto', render: (p) => (
      <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.manufacturer}</p></div>
    ) },
    { key: 'cat', header: 'Categoria', render: (p) => <Badge tone="neutral">{catName(p.categoryId)}</Badge> },
    { key: 'ai', header: 'Princípio ativo', render: (p) => <span className="text-muted-foreground">{p.activeIngredient ?? '—'}</span> },
    { key: 'reg', header: 'Registro', render: (p) => p.isRegulated ? <Badge tone="info">Regulado</Badge> : <span className="text-muted-foreground">—</span> },
    { key: 'qty', header: 'Estoque', align: 'right', render: (p) => `${formatNumber(centralBalance(p.id))} ${p.unit}` },
    { key: 'price', header: 'Preço', align: 'right', render: (p) => formatCurrency(p.price) },
  ];

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo de produtos, saneantes e insumos"
        actions={<Button leftIcon={<Plus size={16} />}>Novo produto</Button>}
      />
      <Table columns={columns} rows={seed.products} keyField={(p) => p.id} onRowClick={setSelected} />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} subtitle={selected?.manufacturer}>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Categoria" value={catName(selected.categoryId)} />
              <Info label="Registro MS/Anvisa" value={selected.registrationCode ?? '—'} />
              <Info label="Princípio ativo" value={selected.activeIngredient ?? '—'} />
              <Info label="Tipo de aplicação" value={selected.applicationType ?? '—'} />
              <Info label="Dosagem" value={selected.dosage ?? '—'} />
              <Info label="Unidade" value={selected.unit} />
              <Info label="Estoque atual" value={`${formatNumber(centralBalance(selected.id))} ${selected.unit}`} />
              <Info label="Estoque mínimo" value={`${selected.minQuantity} ${selected.unit}`} />
              <Info label="Preço" value={formatCurrency(selected.price)} />
              <Info label="Localização" value={selected.storageLocation ?? '—'} />
            </div>
            <div className="rounded-lg border border-info/30 bg-info-soft/50 p-3 text-sm text-foreground">
              <p className="font-semibold">FISPQ / Ficha de Segurança</p>
              <p className="mt-1 text-muted-foreground">Documento de segurança disponível para consulta e uso em campo.</p>
              <Button variant="outline" size="sm" className="mt-2">Abrir FISPQ</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
