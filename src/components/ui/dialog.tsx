'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  return (
    <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  asChild,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const ctx = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
      onClick: (e: React.MouseEvent) => {
        (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick?.(e);
        ctx?.setOpen(true);
      },
    });
  }
  return (
    <button
      type="button"
      onClick={() => ctx?.setOpen(true)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(DialogContext);
  if (!ctx?.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#11221E]/45 transition-opacity dark:bg-zinc-950/60"
        onClick={() => ctx.setOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-50 flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 text-[#11221E] shadow-[0_12px_32px_rgba(17,34,30,0.14)] transition-[transform,opacity] duration-200 ease-unslop dark:border-zinc-800/80 dark:bg-[#121214] dark:text-zinc-100',
          className
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          aria-label="Đóng hộp thoại"
          className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#5C7871] transition-colors hover:bg-[#E4EEEB] hover:text-[#11221E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-base font-semibold leading-6 text-[#11221E] dark:text-zinc-100', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm leading-5 text-[#415A54] dark:text-zinc-400', className)} {...props} />
  );
}

export function DialogClose({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(DialogContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.setOpen(false)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}
