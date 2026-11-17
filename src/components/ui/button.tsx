import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'danger'
  | 'link';

export type ButtonSize = 'default' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300 border border-transparent',
  primary:
    'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300 border border-transparent',
  secondary:
    'bg-zinc-100 text-zinc-900 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700/80 border border-zinc-200/80 dark:border-zinc-700/80',
  outline:
    'bg-white text-zinc-800 hover:bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-800/80 dark:hover:bg-zinc-800/80',
  ghost:
    'bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100 border border-transparent',
  destructive:
    'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500/90 dark:text-white dark:hover:bg-red-500 border border-transparent',
  danger:
    'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500/90 dark:text-white dark:hover:bg-red-500 border border-transparent',
  link: 'bg-transparent text-teal-700 underline-offset-4 hover:underline dark:text-teal-400 border border-transparent px-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5 py-2 text-sm',
  md: 'h-9 px-3.5 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-4 text-sm',
  icon: 'h-9 w-9 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 ease-unslop active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:focus-visible:ring-teal-400/30 disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
