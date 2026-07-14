import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  hover?: boolean;
  className?: string;
}

/** Card base do design system — superfície elevada, borda sutil, hover opcional. */
export function Card({ children, hover = false, className, ...props }: CardProps) {
  return (
    <motion.div
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-soft',
        hover &&
          'transition-shadow duration-300 hover:shadow-card hover:-translate-y-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 pb-0', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
