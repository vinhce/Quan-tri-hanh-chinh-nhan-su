'use client';

import * as React from 'react';
import { useApp, type ToastMessage } from '@/context/app-context';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
