import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { centralBalance } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';
import type { Batch, Product } from '@/domain/types';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { downloadCsv } from '@/lib/export';
import { currentBatch, expiryLevel } from '@/lib/batches';
import { fmtDate } from '@/lib/date';

export function ProdutosPage() {
  const { items: products, add, update, remove } = useProductsStore();
  const [selected, setSelected] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const catName = (id?: string) => seed.productCategories.find((c) => c.id === id)?.name ?? '—';

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || (p.activeIngredient ?? '').toLowerCase().includes(query.toLowerCase())),
    [products, query],
  );

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Produto', render: (p) => (<div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.manufacturer}</p></div>) },
    { key: 'cat', header: 'Categoria', render: (p) => <Badge tone="neutral">{catName(p.categoryId)}</Badge> },
    { key: 'ai', header: 'Princípio ativo', render: (p) => <span className="text-muted-foreground">{p.activeIngredient ?? '—'}</span> },
    { key: 'batch', header: 'Lote atual', render: (p) => {
      const b = currentBatch(p);
      if (!b) return <span className="text-muted-foreground">—</span>;
      const lvl = expiryLevel(b.expiresAt);
      return <div><p className="text-sm">{b.code}</p><Badge tone={lvl === 'vencido' ? 'danger' : lvl === 'vencendo' ? 'warning' : 'neutral'} className="text-[10px]">val. {b.expiresAt ? fmtDate(b.expiresAt) : '—'}</Badge></div>;
    } },
    { key: 'qty', header: 'Estoque', align: 'right', render: (p) => `${formatNumber(centralBalance(p.id))} ${p.unit}` },
    { key: 'price', header: 'Preço', align: 'right', render: (p) => formatCurrency(p.price) },
  ];

  const exportCsv = () => downloadCsv('produtos', filtered, [
    { header: 'Produto', value: (p) => p.name },
    { header: 'Categoria', value: (p) => catName(p.categoryId) },
    { header: 'Princípio ativo', value: (p) => p.activeIngredient ?? '' },
    { header: 'Lote atual', value: (p) => currentBatch(p)?.code ?? '' },
    { header: 'Validade', value: (p) => { const e = currentBatch(p)?.expiresAt; return e ? fmtDate(e) : ''; } },
    { header: 'Unidade', value: (p) => p.unit },
    { header: 'Estoque mínimo', value: (p) => p.minQuantity },
    { header: 'Preço', value: (p) => p.price },
  ]);

  return (
    <div>
      <PageHeader
        title="Produtos"
        description={`${products.length} produtos no catálogo`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>Novo produto</Button>
          </>
        }
      />

      <div className="mb-4 relative sm:max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou princípio ativo…" className="pl-9" />
      </div>

      <Table columns={columns} rows={filtered} keyField={(p) => p.id} onRowClick={setSelected} />

      {/* Detalhe */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected?.manufacturer}
        footer={selected && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={() => { remove(selected.id); setSelected(null); }}>Excluir</Button>
            <Button variant="outline" leftIcon={<Pencil size={15} />} onClick={() => { setEditing(selected); setSelected(null); setFormOpen(true); }}>Editar</Button>
          </div>
        )}
      >
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
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Histórico de lotes</p>
              <div className="space-y-2">
                {(selected.batches ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum lote cadastrado.</p>}
                {(selected.batches ?? []).map((bch) => {
                  const lvl = expiryLevel(bch.expiresAt);
                  return (
                    <div key={bch.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">Lote {bch.code}</p>
                        <p className="text-xs text-muted-foreground">Recebido {fmtDate(bch.receivedAt)} · {bch.quantity} {selected.unit}</p>
                      </div>
                      <Badge tone={lvl === 'vencido' ? 'danger' : lvl === 'vencendo' ? 'warning' : 'success'} dot>
                        {lvl === 'vencido' ? 'Vencido' : lvl === 'vencendo' ? 'Vence em breve' : 'Válido'} · {bch.expiresAt ? fmtDate(bch.expiresAt) : '—'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-info/30 bg-info-soft/50 p-3 text-sm text-foreground">
              <p className="font-semibold">FISPQ / Ficha de Segurança</p>
              <p className="mt-1 text-muted-foreground">Documento de segurança disponível para consulta e uso em campo.</p>
              <Button variant="outline" size="sm" className="mt-2">Abrir FISPQ</Button>
            </div>
          </div>
        )}
      </Drawer>

      <ProductForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={(p, isNew) => { if (isNew) add(p); else update(p.id, p); setFormOpen(false); }}
      />
    </div>
  );
}

function ProductForm({ open, initial, onClose, onSave }: { open: boolean; initial?: Product | null; onClose: () => void; onSave: (p: Product, isNew: boolean) => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState<Partial<Product>>({});
  const [touched, setTouched] = useState(false);
  // Novo lote a registrar (compra) — opcional.
  const [batchCode, setBatchCode] = useState('');
  const [batchExpiry, setBatchExpiry] = useState('');
  const [batchQty, setBatchQty] = useState('');

  useEffect(() => {
    if (!open) return;
    setF(initial ? { ...initial } : { unit: 'un', minQuantity: 0, price: 0, isRegulated: false, isActive: true, categoryId: seed.productCategories[0]?.id });
    setBatchCode(''); setBatchExpiry(''); setBatchQty('');
    setTouched(false);
  }, [open, initial]);

  const set = (k: keyof Product, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const nameErr = touched && !f.name?.trim();

  const submit = () => {
    setTouched(true);
    if (!f.name?.trim()) return;
    // Anexa um novo lote ao histórico, se informado.
    let batches: Batch[] | undefined = initial?.batches ? [...initial.batches] : (f.batches ? [...f.batches] : undefined);
    if (batchCode.trim()) {
      const b: Batch = { id: uid('b'), code: batchCode.trim(), expiresAt: batchExpiry || undefined, quantity: Number(batchQty) || 0, receivedAt: new Date().toISOString().slice(0, 10) };
      batches = [...(batches ?? []), b];
    }
    const product: Product = {
      id: initial?.id ?? uid('prod'),
      orgId: currentOrgId(),
      name: f.name.trim(),
      categoryId: f.categoryId,
      manufacturer: f.manufacturer?.trim() || undefined,
      registrationCode: f.registrationCode?.trim() || undefined,
      activeIngredient: f.activeIngredient?.trim() || undefined,
      applicationType: f.applicationType?.trim() || undefined,
      dosage: f.dosage?.trim() || undefined,
      unit: f.unit || 'un',
      minQuantity: Number(f.minQuantity) || 0,
      price: Number(f.price) || 0,
      storageLocation: f.storageLocation?.trim() || undefined,
      isRegulated: !!f.isRegulated,
      isActive: f.isActive ?? true,
      batches,
    };
    onSave(product, !isEdit);
  };

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? 'Editar produto' : 'Novo produto'} subtitle="Catálogo de produtos" width="max-w-xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!f.name?.trim()}>{isEdit ? 'Salvar' : 'Adicionar'}</Button></div>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome" required className="col-span-2"><Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} />{nameErr && <span className="mt-1 block text-xs text-danger">Informe o nome.</span>}</Field>
        <Field label="Categoria"><Select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value)}>{seed.productCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Fabricante"><Input value={f.manufacturer ?? ''} onChange={(e) => set('manufacturer', e.target.value)} /></Field>
        <Field label="Princípio ativo"><Input value={f.activeIngredient ?? ''} onChange={(e) => set('activeIngredient', e.target.value)} /></Field>
        <Field label="Registro MS/Anvisa"><Input value={f.registrationCode ?? ''} onChange={(e) => set('registrationCode', e.target.value)} /></Field>
        <Field label="Tipo de aplicação"><Input value={f.applicationType ?? ''} onChange={(e) => set('applicationType', e.target.value)} placeholder="Pulverização, Gel…" /></Field>
        <Field label="Dosagem"><Input value={f.dosage ?? ''} onChange={(e) => set('dosage', e.target.value)} /></Field>
        <Field label="Unidade"><Select value={f.unit ?? 'un'} onChange={(e) => set('unit', e.target.value)}>{['un', 'L', 'ml', 'kg', 'g', 'cx', 'par'].map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Estoque mínimo"><Input type="number" min={0} value={f.minQuantity ?? 0} onChange={(e) => set('minQuantity', e.target.value)} /></Field>
        <Field label="Preço (R$)"><Input type="number" min={0} step="0.01" value={f.price ?? 0} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label="Localização"><Input value={f.storageLocation ?? ''} onChange={(e) => set('storageLocation', e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={!!f.isRegulated} onChange={(e) => set('isRegulated', e.target.checked)} className="h-4 w-4 rounded border-border" />
          Produto regulamentado
        </label>

        {/* Registro de lote (compra) */}
        <div className="col-span-2 border-t border-border pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Registrar lote {isEdit ? '(nova compra)' : 'inicial'}</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Lote"><Input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="KO-2408" /></Field>
            <Field label="Validade"><Input type="date" value={batchExpiry} onChange={(e) => setBatchExpiry(e.target.value)} onFocus={(e) => e.currentTarget.showPicker?.()} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
            <Field label="Qtd."><Input type="number" min={0} value={batchQty} onChange={(e) => setBatchQty(e.target.value)} /></Field>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">O lote informado é adicionado ao histórico e passa a aparecer na Ordem de Serviço.</p>
        </div>
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
