import { createContext, useContext, useState, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useUsersStore } from '@/store/entityStores';
import { Select } from '../ui/Field';

interface FieldTechValue {
  /** Usuário autenticado é técnico (não é staff em pré-visualização). */
  isTech: boolean;
  /** Id do técnico ativo (o próprio, ou o selecionado pelo staff). */
  techId: string;
  techName: string;
  previewId: string;
  setPreviewId: (id: string) => void;
}

const Ctx = createContext<FieldTechValue | null>(null);

/**
 * Provider da identidade de campo. O técnico enxerga apenas os próprios dados;
 * gestores/staff podem pré-visualizar qualquer técnico. Compartilhado entre as
 * telas do App do Técnico para manter a seleção consistente na navegação.
 */
export function FieldTechProvider({ children }: { children: ReactNode }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico' && u.isActive));
  const isTech = currentUser?.role === 'tecnico';
  const [previewId, setPreviewId] = useState(technicians[0]?.id ?? '');
  const techId = isTech && currentUser ? currentUser.id : (previewId || technicians[0]?.id || '');
  const techName =
    (isTech && currentUser?.name) ||
    technicians.find((t) => t.id === techId)?.name ||
    currentUser?.name ||
    'Técnico';

  return (
    <Ctx.Provider value={{ isTech, techId, techName, previewId, setPreviewId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFieldTech(): FieldTechValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFieldTech deve ser usado dentro de FieldTechProvider');
  return v;
}

/** Faixa de pré-visualização — exibida apenas para staff (não-técnicos). */
export function PreviewBanner() {
  const { isTech, previewId, setPreviewId } = useFieldTech();
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico' && u.isActive));
  if (isTech) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-3">
      <Eye size={15} className="shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">Pré-visualizar como:</span>
      <Select
        value={previewId}
        onChange={(e) => setPreviewId(e.target.value)}
        aria-label="Selecionar técnico para pré-visualização"
        className="h-8 flex-1"
      >
        {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
    </div>
  );
}
