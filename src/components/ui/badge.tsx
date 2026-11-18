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
    'border-teal-700/20 bg-teal-50/80 text-teal-800 dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-300',
  teal:
    'border-teal-700/20 bg-teal-50/80 text-teal-800 dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-300',
  secondary:
    'border-zinc-200/80 bg-zinc-100 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-800/80 dark:text-zinc-300',
  muted:
    'border-zinc-200/60 bg-zinc-50 text-zinc-600 dark:border-zinc-800/60 dark:bg-zinc-900 dark:text-zinc-400',
  outline:
    'border-zinc-200/80 bg-transparent text-zinc-700 dark:border-zinc-800/80 dark:text-zinc-300',
  success:
    'border-emerald-600/20 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning:
    'border-amber-600/20 bg-amber-50/80 text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-300',
  destructive:
    'border-red-600/20 bg-red-50/80 text-red-800 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  error:
    'border-red-600/20 bg-red-50/80 text-red-800 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  danger:
    'border-red-600/20 bg-red-50/80 text-red-800 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300',
  info:
    'border-zinc-300/80 bg-zinc-100/80 text-zinc-800 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-200',
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
