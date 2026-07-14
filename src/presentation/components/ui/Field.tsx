import { cn } from '@/lib/utils';
import {
  forwardRef,
  type InputHTMLAttributes,
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

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, 'appearance-none pr-8', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';
