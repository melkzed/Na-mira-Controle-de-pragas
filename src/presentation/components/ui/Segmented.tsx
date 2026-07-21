import { cn } from '@/lib/utils';

/**
 * Controle segmentado com indicador (fundo animado por CSS).
 * Não usa `layoutId`/shared-layout do Framer de propósito: um layoutId dentro
 * de uma subárvore que sai por AnimatePresence (ex.: dentro de um Drawer) trava
 * o onExitComplete e deixa o backdrop preso capturando cliques.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/60 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative rounded-lg font-medium transition-all duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
