import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
