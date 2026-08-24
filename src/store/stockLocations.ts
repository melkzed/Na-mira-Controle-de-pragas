/**
 * Locais de estoque — acesso e criação.
 *
 * Antes essa lista vinha só do seed do frontend, o que quebrava na prática:
 * um técnico cadastrado pela tela nunca ganhava um local, ficava com saldo
 * zero para sempre e não tinha onde guardar produto próprio. Agora é cadastro
 * de verdade (`useStockLocationsStore`, dual-mode) e todo técnico ganha o seu
 * na hora do cadastro — ver `ensureTechnicianStockLocation`.
 */
import type { StockLocation } from '@/domain/types';
import { useStockLocationsStore } from './entityStores';
import { currentOrgId } from './appStore';

/** Local de estoque de um técnico, se já existir. */
export function technicianStockLocation(techId: string): StockLocation | undefined {
  return useStockLocationsStore.getState().items.find((l) => l.kind === 'tecnico' && l.ownerId === techId);
}

/** Id do local de estoque de um técnico (undefined quando ainda não tem). */
export function technicianStockLocationId(techId: string): string | undefined {
  return technicianStockLocation(techId)?.id;
}

/**
 * Garante que o técnico tenha um local de estoque, criando se faltar, e
 * devolve o id. Idempotente: chamar de novo para o mesmo técnico não duplica.
 *
 * Chamado ao cadastrar/convidar um técnico e também de forma preguiçosa ao
 * abrir o app de campo — assim técnicos criados antes desta mudança (ou pela
 * Edge Function de convite, que grava direto em `public.users`) também passam
 * a ter o seu na primeira vez que aparecem.
 */
export function ensureTechnicianStockLocation(techId: string, techName?: string): string {
  const existing = technicianStockLocation(techId);
  if (existing) return existing.id;
  const location: StockLocation = {
    id: `loc-t-${techId.slice(0, 8)}`,
    orgId: currentOrgId(),
    kind: 'tecnico',
    name: `Estoque · ${techName ?? 'Técnico'}`,
    ownerId: techId,
  };
  useStockLocationsStore.getState().add(location);
  return location.id;
}

/** Local do estoque central da organização — o padrão de entradas/compras. */
export function centralStockLocationId(): string | undefined {
  return useStockLocationsStore.getState().items.find((l) => l.kind === 'central')?.id;
}

/**
 * Ordena os locais para exibição: central primeiro, depois os demais em ordem
 * alfabética. A store guarda na ordem de criação (mais novo primeiro), então
 * sem isso um técnico recém-cadastrado aparecia no topo das listas, acima do
 * estoque central.
 */
export function sortedStockLocations(items: StockLocation[]): StockLocation[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) {
      if (a.kind === 'central') return -1;
      if (b.kind === 'central') return 1;
    }
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}
