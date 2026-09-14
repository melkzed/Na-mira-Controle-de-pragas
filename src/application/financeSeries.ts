import { useFinanceStore } from '@/store/entityStores';
import type { FinanceEntry } from '@/domain/types';

export interface MonthPoint {
  /** `AAAA-MM` — chave de agrupamento. */
  key: string;
  /** Rótulo curto do mês, para o eixo do gráfico. */
  month: string;
  receita: number;
  despesa: number;
}

/** Valor efetivo do lançamento: o desconto concedido não entra no resultado. */
export function netAmount(e: FinanceEntry): number {
  return e.amount - (e.discount ?? 0);
}

/**
 * Receita e despesa mês a mês, a partir dos lançamentos reais.
 *
 * Mora aqui, e não na tela, porque três pontos fazem a mesma pergunta: o DRE
 * do Financeiro, o gráfico do painel e os indicadores de receita do mês. Com o
 * cálculo em um lugar só, os três não podem divergir — antes o painel lia uma
 * série fixa do exemplo e mostrava um faturamento que não era o da empresa.
 *
 * Lançamento cancelado fica de fora; o mês é o do vencimento (ou o da criação,
 * quando não há vencimento), que é como o Financeiro já agrupa.
 */
export function monthlySeries(months = 12): MonthPoint[] {
  const pontos: MonthPoint[] = [];
  const base = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    pontos.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      receita: 0,
      despesa: 0,
    });
  }
  const porMes = new Map(pontos.map((m) => [m.key, m]));
  useFinanceStore.getState().items
    .filter((e) => e.status !== 'cancelado')
    .forEach((e) => {
      const alvo = porMes.get((e.dueDate ?? e.createdAt).slice(0, 7));
      if (!alvo) return;
      if (e.type === 'receita') alvo.receita += netAmount(e);
      else alvo.despesa += netAmount(e);
    });
  return pontos;
}
