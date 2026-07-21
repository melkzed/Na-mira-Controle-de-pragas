import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastTone } from '@/store/toastStore';
import { cn } from '@/lib/utils';

const toneMeta: Record<ToastTone, { icon: typeof Info; ring: string }> = {
  default: { icon: Info, ring: 'text-foreground' },
  info: { icon: Info, ring: 'text-info' },
  success: { icon: CheckCircle2, ring: 'text-success' },
  warning: { icon: TriangleAlert, ring: 'text-warning' },
  danger: { icon: XCircle, ring: 'text-danger' },
};

/** Fila de notificações (toasts) — acessível: região aria-live "polite". */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const meta = toneMeta[t.tone];
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 pr-2 shadow-elevated"
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', meta.ring)} />
              <p className="flex-1 pt-0.5 text-sm text-foreground">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-brand hover:bg-muted"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Fechar notificação"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
