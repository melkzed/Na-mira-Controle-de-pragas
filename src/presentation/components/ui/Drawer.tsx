import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/** Painel centralizado (modal) para cadastro, edição e detalhes — ocupa 95%
 *  da tela em todos os módulos. Substituiu a antiga aba lateral deslizante,
 *  que era estreita demais para os formulários do sistema. Acessível: fecha
 *  com Esc, move o foco para o painel ao abrir e restaura o foco anterior ao
 *  fechar. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Conteúdo usa toda a largura do painel, sem a coluna de leitura. Para
   *  telas de detalhe com várias colunas (Ordem de Serviço, Cliente) ou
   *  tabelas largas; formulários ficam melhores no padrão. */
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Mantém o onClose atual sem entrar nas dependências do efeito — evitar isso
  // é essencial: se o efeito re-executasse a cada render, o foco seria roubado
  // do campo a cada tecla digitada ("escreve uma letra e trava").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Foca o painel uma vez, ao abrir (após a animação iniciar).
    const t = setTimeout(() => panelRef.current?.focus(), 60);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const panel = (
    <>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
        <X size={18} />
      </Button>
    </>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <motion.aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : undefined}
              tabIndex={-1}
              className="flex h-[95vh] w-[95vw] flex-col rounded-2xl border border-border bg-surface shadow-elevated outline-none"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 border-b border-border p-5">
                {panel}
              </header>
              {/* O painel ocupa 95% da tela, mas o conteúdo mantém uma coluna
                  de leitura centralizada — um formulário de uma coluna
                  esticado por um monitor inteiro fica ruim de usar. Telas de
                  detalhe com várias colunas usam `wide`. */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className={wide ? 'w-full' : 'mx-auto w-full max-w-4xl'}>{children}</div>
              </div>
              {footer && (
                <footer className="border-t border-border p-4">{footer}</footer>
              )}
            </motion.aside>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
