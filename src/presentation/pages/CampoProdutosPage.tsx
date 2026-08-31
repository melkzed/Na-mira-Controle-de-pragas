import { useMemo, useState } from 'react';
import { FlaskConical, Package, Search, ShieldAlert } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Field';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { technicianBalances } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import { compareText } from '@/lib/utils';

/**
 * Produtos — consulta de campo. O técnico vê o catálogo técnico (princípio
 * ativo, diluição, tipo de aplicação, registro) e o que tem alocado no próprio
 * estoque. Sem preços nem custos: informação operacional para a aplicação.
 */
export function CampoProdutosPage() {
  const { techId } = useFieldTech();
  const products = useProductsStore((s) => s.items);
  const [query, setQuery] = useState('');

  const loc = `loc-${techId.replace('u-', '')}`;
  const myStock = useMemo(() => {
    const map = new Map<string, number>();
    technicianBalances(loc).forEach(({ product, quantity }) => map.set(product.id, quantity));
    return map;
  }, [loc]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.isActive)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.activeIngredient ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Primeiro o que está na minha bolsa; dentro de cada bloco, alfabético.
        const am = myStock.has(a.id) ? 0 : 1;
        const bm = myStock.has(b.id) ? 0 : 1;
        return am - bm || compareText(a.name, b.name);
      });
  }, [products, query, myStock]);

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-3">
        <p className="text-base font-bold text-foreground">Produtos</p>
        <p className="text-xs text-muted-foreground">Catálogo técnico e meu estoque alocado</p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou princípio ativo…" className="pl-9" />
      </div>

      <div className="space-y-2">
        {list.map((p) => {
          const qty = myStock.get(p.id);
          return (
            <Card key={p.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><FlaskConical size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    {qty != null ? (
                      <Badge tone={qty <= 2 ? 'warning' : 'success'} className="shrink-0"><Package size={11} className="mr-1" />{qty} {p.unit}</Badge>
                    ) : (
                      <Badge tone="neutral" className="shrink-0">não alocado</Badge>
                    )}
                  </div>
                  {p.activeIngredient && <p className="text-xs text-muted-foreground">{p.activeIngredient}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.applicationType && <Info label="Aplicação" value={p.applicationType} />}
                    {p.dosage && <Info label="Diluição" value={p.dosage} />}
                    {p.registrationCode && <Info label="Registro" value={p.registrationCode} />}
                  </div>
                  {p.isRegulated && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning"><ShieldAlert size={13} /> Produto controlado — uso conforme receituário</p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {list.length === 0 && (
          <Card><CardBody className="py-12 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</CardBody></Card>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-foreground">
      <span className="text-muted-foreground">{label}:</span> {value}
    </span>
  );
}
