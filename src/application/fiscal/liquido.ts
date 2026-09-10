/**
 * Valor líquido de um recebimento.
 *
 * O que a tela chamava de "valor" era o bruto menos o desconto do lançamento.
 * Só que num serviço para pessoa jurídica o que entra na conta é bem menos:
 * ISS retido, IRRF, INSS, PIS, COFINS e CSLL saem antes. O sistema já calcula
 * tudo isso ao emitir a NFS-e — o financeiro é que não usava esse cálculo.
 *
 * A conta mora aqui, num lugar só, para a tela do Financeiro e os relatórios
 * nunca divergirem: dois números diferentes para "quanto entrou" é pior do que
 * não ter o número.
 */
import type { FinanceEntry, Invoice } from '@/domain/types';
import { useInvoicesStore } from '@/store/invoicesStore';

export interface ValorRecebimento {
  /** Valor do lançamento, já sem o desconto concedido. */
  bruto: number;
  /** Soma das retenções da nota vinculada. Zero quando não há nota. */
  retencoes: number;
  /** O que de fato entra na conta. */
  liquido: number;
  /** A nota que originou as retenções, quando existe. */
  nota?: Invoice;
}

/** Nota emitida para o atendimento do lançamento. Cancelada não conta. */
export function notaDoLancamento(e: Pick<FinanceEntry, 'serviceOrderId'>): Invoice | undefined {
  if (!e.serviceOrderId) return undefined;
  return useInvoicesStore.getState().invoices
    .find((i) => i.serviceOrderId === e.serviceOrderId && i.status !== 'cancelada');
}

/** Bruto (menos desconto), retenções e líquido de um lançamento. */
export function valorRecebimento(e: Pick<FinanceEntry, 'amount' | 'discount' | 'serviceOrderId'>): ValorRecebimento {
  const bruto = e.amount - (e.discount ?? 0);
  const nota = notaDoLancamento(e);
  // Sem nota emitida não há retenção a descontar — o líquido é o próprio bruto.
  // Nota antiga, gravada antes de o detalhamento existir, também cai aqui.
  const retencoes = nota?.taxes?.totalRetencoes ?? 0;
  return { bruto, retencoes, liquido: bruto - retencoes, nota };
}

/** Soma o líquido de uma lista de lançamentos. */
export function somaLiquida(entries: Pick<FinanceEntry, 'amount' | 'discount' | 'serviceOrderId'>[]): number {
  return entries.reduce((s, e) => s + valorRecebimento(e).liquido, 0);
}
