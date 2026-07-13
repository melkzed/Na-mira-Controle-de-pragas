import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type Tone =
  | 'neutral'
  | 'brand'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', {
            'bg-muted-foreground': tone === 'neutral',
            'bg-brand': tone === 'brand',
            'bg-info': tone === 'info',
            'bg-success': tone === 'success',
            'bg-warning': tone === 'warning',
            'bg-danger': tone === 'danger',
          })}
        />
      )}
      {children}
    </span>
  );
}
