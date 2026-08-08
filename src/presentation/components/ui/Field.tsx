import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const base =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60';

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-danger">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[84px] resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Fecha o popup ao clicar fora dele, só enquanto estiver aberto. */
function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  return ref;
}

/** Achata os children de uma <option> num texto simples — usado quando a
 *  option não tem `value` explícito (nesse caso o próprio texto é o valor,
 *  igual ao <select> nativo). */
function optionText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(optionText).join('');
  if (isValidElement(node)) return optionText(node.props.children);
  return '';
}

interface ParsedOption {
  value: string;
  disabled?: boolean;
  content: ReactNode;
}

function parseOptions(children: ReactNode): ParsedOption[] {
  return Children.toArray(children)
    .filter((c): c is ReactElement<OptionHTMLAttributes<HTMLOptionElement>> => isValidElement(c))
    .map((c) => ({
      value: c.props.value !== undefined ? String(c.props.value) : optionText(c.props.children),
      disabled: c.props.disabled,
      content: c.props.children,
    }));
}

/** Substitui o `<select>` nativo por um dropdown no estilo do sistema — a
 *  lista de opções do navegador não é estilizável via CSS, então usamos um
 *  popup próprio (mesmo padrão visual do Combobox). Mantém a mesma API do
 *  `<select>` (value/onChange com e.target.value, `<option>` como children)
 *  para não exigir mudanças nas telas que já usam `Select`. */
export const Select = forwardRef<HTMLButtonElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, value, onChange, disabled, id, name, title, tabIndex, 'aria-label': ariaLabel }, ref) => {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const rootRef = useOutsideClose(open, () => setOpen(false));
    const options = useMemo(() => parseOptions(children), [children]);
    const currentValue = value != null ? String(value) : '';
    const current = options.find((o) => o.value === currentValue);

    const pick = (v: string) => {
      setOpen(false);
      onChange?.({ target: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>);
    };

    const toggleOpen = () => {
      if (disabled) return;
      setActiveIdx(Math.max(0, options.findIndex((o) => o.value === currentValue)));
      setOpen((v) => !v);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleOpen(); return; }
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, options.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (options[activeIdx]) pick(options[activeIdx].value); }
    };

    return (
      <div ref={rootRef} className="relative">
        <button
          ref={ref}
          type="button"
          id={id}
          name={name}
          title={title}
          tabIndex={tabIndex}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggleOpen}
          onKeyDown={onKeyDown}
          className={cn(base, 'flex items-center justify-between gap-2 text-left', className)}
        >
          <span className="min-w-0 truncate">
            {current ? current.content : <span className="text-muted-foreground/70">Selecione…</span>}
          </span>
          <ChevronDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-elevated">
            {options.map((o, i) => (
              <button
                key={`${o.value}-${i}`}
                type="button"
                role="option"
                aria-selected={o.value === currentValue}
                disabled={o.disabled}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                  o.value === currentValue ? 'bg-brand-soft text-brand' : i === activeIdx ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="min-w-0 truncate">{o.content}</span>
                {o.value === currentValue && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
