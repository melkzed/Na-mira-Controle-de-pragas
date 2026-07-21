import type { Batch, Product } from '@/domain/types';
import { daysUntil } from './utils';

/**
 * Lote "atual" de um produto: entre os lotes com saldo, o de validade mais
 * próxima (FEFO — First Expired, First Out). Sem saldo, usa o recebido mais
 * recente. É esse lote que aparece na Ordem de Serviço e nos documentos.
 */
export function currentBatch(product?: Product): Batch | undefined {
  const batches = product?.batches ?? [];
  if (!batches.length) return undefined;
  const withStock = batches.filter((b) => b.quantity > 0 && b.expiresAt);
  if (withStock.length) {
    return [...withStock].sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1))[0];
  }
  return [...batches].sort((a, b) => (a.receivedAt > b.receivedAt ? -1 : 1))[0];
}

export type ExpiryLevel = 'ok' | 'vencendo' | 'vencido';

export function expiryLevel(expiresAt?: string): ExpiryLevel {
  const d = daysUntil(expiresAt);
  if (d === null) return 'ok';
  if (d < 0) return 'vencido';
  if (d <= 30) return 'vencendo';
  return 'ok';
}

/** Todos os lotes (de todos os produtos) que estão vencidos ou vencendo. */
export function expiringBatches(products: Product[]) {
  const rows: { product: Product; batch: Batch; level: ExpiryLevel }[] = [];
  for (const product of products) {
    for (const batch of product.batches ?? []) {
      const level = expiryLevel(batch.expiresAt);
      if (level !== 'ok') rows.push({ product, batch, level });
    }
  }
  return rows.sort((a, b) => (a.batch.expiresAt ?? '') < (b.batch.expiresAt ?? '') ? -1 : 1);
}
