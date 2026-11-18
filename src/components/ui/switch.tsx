'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked: controlledChecked, defaultChecked = false, onCheckedChange, disabled, ...props }, ref) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(defaultChecked);
    const isChecked = controlledChecked !== undefined ? controlledChecked : uncontrolledChecked;

    const toggle = () => {
      if (disabled) return;
      const next = !isChecked;
      if (controlledChecked === undefined) {
        setUncontrolledChecked(next);
      }
      onCheckedChange?.(next);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isChecked}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 ease-unslop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:focus-visible:ring-teal-400/30 disabled:cursor-not-allowed disabled:opacity-50',
          isChecked
            ? 'border-[#0F766E] bg-[#0F766E] dark:border-teal-400 dark:bg-teal-400'
            : 'border-[#C6D9D3] bg-[#E4EEEB] dark:border-zinc-700 dark:bg-zinc-800',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-[#FCFEFD] shadow-[0_1px_2px_rgba(17,34,30,0.12)] transition-transform duration-150 ease-unslop dark:bg-zinc-950',
            isChecked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    );
  }
);

Switch.displayName = 'Switch';
