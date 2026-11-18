import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'error'
  | 'danger'
  | 'info'
  | 'teal'
  | 'muted';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'border-[#0F766E]/30 bg-[#CBE8E2] text-[#0B4F4A] font-semibold dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-300',
  teal:
    'border-[#0F766E]/30 bg-[#CBE8E2] text-[#0B4F4A] font-semibold dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-300',
  secondary:
    'border-[#C6D9D3] bg-[#E4EEEB] text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-800/80 dark:text-zinc-300',
  muted:
    'border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800/60 dark:bg-zinc-900 dark:text-zinc-400',
  outline:
    'border-[#C6D9D3] bg-transparent text-[#415A54] dark:border-zinc-800/80 dark:text-zinc-300',
  success:
    'border-[#6EE7B7] bg-[#D1FAE5] text-[#065F46] font-semibold dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning:
    'border-amber-600/30 bg-amber-50 text-amber-900 font-semibold dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-300',
  destructive:
    'border-red-600/30 bg-red-50 text-red-900 font-semibold dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  error:
    'border-red-600/30 bg-red-50 text-red-900 font-semibold dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  danger:
    'border-red-600/30 bg-red-50 text-red-900 font-semibold dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  info:
    'border-[#C6D9D3] bg-[#E4EEEB] text-[#415A54] dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-200',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'secondary', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-4 transition-colors',
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
