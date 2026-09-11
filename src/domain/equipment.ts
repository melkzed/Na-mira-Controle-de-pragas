import type { Equipment } from './types';

/** Equipamento em uso com devolução vencida.
 *
 *  Vive no domínio, e não na página: três telas fazem a mesma pergunta, e um
 *  módulo que exporta componentes e mais alguma coisa perde o hot reload. */
export function isEquipmentOverdue(e: Equipment): boolean {
  return e.status === 'em_uso' && !!e.expectedReturnAt && new Date(e.expectedReturnAt).getTime() < Date.now();
}
