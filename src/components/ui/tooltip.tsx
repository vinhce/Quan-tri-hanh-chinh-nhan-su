'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export interface TooltipProps {
  content?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);

  if (content !== undefined) {
    return (
      <span
        className={cn('relative inline-flex', className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
        {open && (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-1 text-xs font-medium text-[#11221E] shadow-[0_2px_8px_rgba(17,34,30,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {content}
          </span>
        )}
      </span>
    );
  }

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span
        className={cn('relative inline-flex', className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({
  children,
  asChild,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { asChild?: boolean }) {
  return (
    <span className={cn('inline-flex', className)} {...props}>
      {children}
    </span>
  );
}

export function TooltipContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(TooltipContext);
  if (!ctx?.open) return null;
  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-1 text-xs font-medium text-[#11221E] shadow-[0_2px_8px_rgba(17,34,30,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-zinc-100',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
