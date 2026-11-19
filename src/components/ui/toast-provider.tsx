'use client';

import * as React from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useApp, type ToastMessage } from '@/context/app-context';
import { cn } from '@/lib/utils';
import { setFlashToast, notify } from '@/lib/notify';

interface VariantStyle {
  cardClass: string;
  iconBoxClass: string;
  icon: React.ReactNode;
}

const VARIANT_CONFIGS: Record<NonNullable<ToastMessage['variant']>, VariantStyle> = {
  success: {
    cardClass:
      'border-l-4 border-l-emerald-600 dark:border-l-emerald-400 border-emerald-200/90 dark:border-emerald-800/60 bg-white/95 dark:bg-[#121214]/95 text-zinc-900 dark:text-zinc-100 shadow-[0_8px_24px_rgba(5,150,105,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
    iconBoxClass:
      'border border-emerald-300/80 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/60 dark:text-emerald-400',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />,
  },
  error: {
    cardClass:
      'border-l-4 border-l-red-600 dark:border-l-red-400 border-red-200/90 dark:border-red-800/60 bg-white/95 dark:bg-[#121214]/95 text-zinc-900 dark:text-zinc-100 shadow-[0_8px_24px_rgba(220,38,38,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
    iconBoxClass:
      'border border-red-300/80 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-950/60 dark:text-red-400',
    icon: <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />,
  },
  warning: {
    cardClass:
      'border-l-4 border-l-amber-500 dark:border-l-amber-400 border-amber-200/90 dark:border-amber-800/60 bg-white/95 dark:bg-[#121214]/95 text-zinc-900 dark:text-zinc-100 shadow-[0_8px_24px_rgba(217,119,6,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
    iconBoxClass:
      'border border-amber-300/80 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-400',
    icon: <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />,
  },
  info: {
    cardClass:
      'border-l-4 border-l-teal-600 dark:border-l-teal-400 border-teal-200/90 dark:border-teal-800/60 bg-white/95 dark:bg-[#121214]/95 text-zinc-900 dark:text-zinc-100 shadow-[0_8px_24px_rgba(15,118,110,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
    iconBoxClass:
      'border border-teal-300/80 bg-teal-50 text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/60 dark:text-teal-400',
    icon: <Info className="h-4 w-4 shrink-0" strokeWidth={2} />,
  },
  default: {
    cardClass:
      'border-l-4 border-l-teal-600 dark:border-l-teal-400 border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-[#121214]/95 text-zinc-900 dark:text-zinc-100 shadow-[0_8px_24px_rgba(17,34,30,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
    iconBoxClass:
      'border border-teal-300/80 bg-teal-50 text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/60 dark:text-teal-400',
    icon: <Info className="h-4 w-4 shrink-0" strokeWidth={2} />,
  },
};

export function ToastProvider({ children }: { children?: React.ReactNode }) {
  const { toasts, dismissToast } = useApp();

  return (
    <>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed top-4 right-4 sm:top-5 sm:right-5 z-[9999] flex w-[calc(100vw-2rem)] sm:w-96 max-w-sm flex-col gap-2.5"
        >
          {toasts.map((item) => {
            const variant = item.variant ?? 'default';
            const config = VARIANT_CONFIGS[variant] ?? VARIANT_CONFIGS.default;
            return (
              <div
                key={item.id}
                role={variant === 'error' ? 'alert' : 'status'}
                className={cn(
                  'toast-item-enter pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 backdrop-blur-md transition-all',
                  config.cardClass
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    config.iconBoxClass
                  )}
                >
                  {config.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-5 text-zinc-900 dark:text-zinc-100 break-words">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 break-words">
                      {item.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  aria-label="Đóng thông báo"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
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
    addSuccess: (desc?: string, title = 'Thêm mới thành công!') =>
      showToast(title, desc, 'success'),
    createSuccess: (desc?: string, title = 'Tạo thành công!') =>
      showToast(title, desc, 'success'),
    updateSuccess: (desc?: string, title = 'Cập nhật thành công!') =>
      showToast(title, desc, 'success'),
    deleteSuccess: (desc?: string, title = 'Xóa thành công!') =>
      showToast(title, desc, 'success'),
    actionError: (desc?: string, title = 'Đã xảy ra lỗi, vui lòng thử lại!') =>
      showToast(title, desc, 'error'),
    missingInfo: (desc?: string, title = 'Vui lòng nhập đầy đủ thông tin!') =>
      showToast(title, desc, 'warning'),
    setFlash: setFlashToast,
    notify,
  };
}
