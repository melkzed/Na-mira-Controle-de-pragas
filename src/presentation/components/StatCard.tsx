import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Icon } from './ui/Icon';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import type { Tone } from './ui/Badge';
import { staggerItem } from './ui/misc';

const toneRing: Record<Tone, string> = {
  neutral: 'text-muted-foreground bg-muted',
  brand: 'text-brand bg-brand-soft',
  info: 'text-info bg-info-soft',
  success: 'text-success bg-success-soft',
  warning: 'text-warning bg-warning-soft',
  danger: 'text-danger bg-danger-soft',
};

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  format,
  delta,
  hint,
}: {
  label: string;
  value: number;
  icon: string;
  tone?: Tone;
  format?: (n: number) => string;
  delta?: number;
  hint?: string;
}) {
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-border bg-surface p-5 shadow-soft transition-shadow hover:shadow-card"
    >
      <div className="flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', toneRing[tone])}>
          <Icon name={icon} size={19} />
        </div>
        {typeof delta === 'number' && (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
              delta >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        <AnimatedNumber value={value} format={format} />
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}
