'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { useApp, type ToastMessage } from '@/context/app-context';
import { cn } from '@/lib/utils';

const TOAST_ACCENT_CLASSES: Record<NonNullable<ToastMessage['variant']>, string> = {
  default: 'border-l-[3px] border-l-[#0F766E] dark:border-l-teal-400',
  info: 'border-l-[3px] border-l-[#0B4F4A] dark:border-l-teal-400',
  success: 'border-l-[3px] border-l-[#065F46] dark:border-l-emerald-400',
  warning: 'border-l-[3px] border-l-amber-600 dark:border-l-amber-400',
  error: 'border-l-[3px] border-l-red-600 dark:border-l-red-400',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismissToast } = useApp();

  return (
    <>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2"
        >
          {toasts.map((item) => {
            const variant = item.variant ?? 'default';
            return (
              <div
                key={item.id}
                className={cn(
                  'pointer-events-auto flex items-start justify-between gap-3 rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] px-3.5 py-2.5 text-[#11221E] shadow-[0_4px_12px_rgba(17,34,30,0.08)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100',
                  TOAST_ACCENT_CLASSES[variant]
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                      {item.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  aria-label="Đóng thông báo"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#5C7871] transition-colors hover:bg-[#E4EEEB] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function useToast() {
  const { showToast, toasts, dismissToast } = useApp();
  return {
    toast: (opts: {
      title: string;
      description?: string;
      variant?: ToastMessage['variant'];
    }) => showToast(opts.title, opts.description, opts.variant),
    showToast,
    toasts,
    dismissToast,
  };
}
