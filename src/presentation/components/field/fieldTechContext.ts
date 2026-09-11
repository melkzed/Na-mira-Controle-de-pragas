import { createContext, useContext } from 'react';

export interface FieldTechValue {
  /** Usuário autenticado é técnico (não é staff em pré-visualização). */
  isTech: boolean;
  /** Id do técnico ativo (o próprio, ou o selecionado pelo staff). */
  techId: string;
  techName: string;
  previewId: string;
  setPreviewId: (id: string) => void;
}

/** O contexto e o hook vivem fora do arquivo dos componentes: um módulo que
 *  exporta componentes e mais alguma coisa perde o hot reload no Vite. */
export const FieldTechCtx = createContext<FieldTechValue | null>(null);

export function useFieldTech(): FieldTechValue {
  const v = useContext(FieldTechCtx);
  if (!v) throw new Error('useFieldTech deve ser usado dentro de FieldTechProvider');
  return v;
}
