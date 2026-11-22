'use client';

import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

export type SwalVariant = 'primary' | 'danger' | 'warning';

export interface ConfirmSwalOptions {
  title: string;
  html?: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: SwalVariant;
}

export interface PromptTextSwalOptions {
  title: string;
  label?: string;
  html?: string;
  text?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'textarea';
  variant?: 'primary' | 'danger';
}

export interface AlertSwalOptions {
  title: string;
  html?: string;
  text?: string;
  confirmText?: string;
  icon?: 'success' | 'error' | 'warning' | 'info';
}

export interface ChoiceSwalOptions {
  title: string;
  html?: string;
  text?: string;
  confirmText: string;
  denyText: string;
  cancelText?: string;
  variant?: SwalVariant;
}

export function escapeSwalHtml(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SWAL_STYLE_ID = 'lac-viet-hrm-swal-theme';

function ensureSwalThemeInjected(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SWAL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SWAL_STYLE_ID;
  style.textContent = `
    .hrm-swal-popup {
      border-radius: 1rem !important;
      border: 1px solid #C6D9D3 !important;
      background-color: #FCFEFD !important;
      color: #11221E !important;
      padding: 1.5rem !important;
      max-width: 28rem !important;
      width: calc(100% - 2rem) !important;
      box-shadow: 0 12px 32px rgba(17, 34, 30, 0.14) !important;
      font-family: var(--font-sans), Inter, system-ui, -apple-system, sans-serif !important;
      text-align: left !important;
    }
    html.dark .hrm-swal-popup {
      border-color: rgba(39, 39, 42, 0.85) !important;
      background-color: #121214 !important;
      color: #F4F4F5 !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55) !important;
    }
    .hrm-swal-title {
      font-size: 1rem !important;
      font-weight: 600 !important;
      line-height: 1.5rem !important;
      color: #11221E !important;
      padding: 0 !important;
      margin: 0 !important;
      text-align: left !important;
    }
    html.dark .hrm-swal-title {
      color: #F4F4F5 !important;
    }
    .hrm-swal-html {
      font-size: 0.875rem !important;
      line-height: 1.375rem !important;
      color: #415A54 !important;
      margin: 0.5rem 0 0 0 !important;
      padding: 0 !important;
      text-align: left !important;
    }
    html.dark .hrm-swal-html {
      color: #A1A1AA !important;
    }
    .hrm-swal-label {
      display: block !important;
      font-size: 0.8125rem !important;
      font-weight: 500 !important;
      color: #11221E !important;
      margin: 0.875rem 0 0.375rem 0 !important;
      padding: 0 !important;
      text-align: left !important;
    }
    html.dark .hrm-swal-label {
      color: #E4E4E7 !important;
    }
    .hrm-swal-input {
      width: 100% !important;
      margin: 0.5rem 0 0 0 !important;
      border-radius: 0.5rem !important;
      border: 1px solid #C6D9D3 !important;
      background-color: #FCFEFD !important;
      color: #11221E !important;
      font-size: 0.875rem !important;
      line-height: 1.25rem !important;
      padding: 0.5rem 0.75rem !important;
      box-shadow: none !important;
      outline: none !important;
      box-sizing: border-box !important;
    }
    .hrm-swal-input:focus {
      border-color: #0F766E !important;
      box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.18) !important;
    }
    html.dark .hrm-swal-input {
      border-color: #27272A !important;
      background-color: #18181B !important;
      color: #F4F4F5 !important;
    }
    html.dark .hrm-swal-input:focus {
      border-color: #2DD4BF !important;
      box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.25) !important;
    }
    textarea.hrm-swal-input {
      min-height: 5.5rem !important;
      resize: vertical !important;
    }
    .hrm-swal-validation {
      margin: 0.5rem 0 0 0 !important;
      padding: 0.5rem 0.75rem !important;
      border-radius: 0.5rem !important;
      background-color: rgba(220, 38, 38, 0.08) !important;
      color: #B91C1C !important;
      font-size: 0.8125rem !important;
      font-weight: 500 !important;
      justify-content: flex-start !important;
    }
    html.dark .hrm-swal-validation {
      background-color: rgba(239, 68, 68, 0.14) !important;
      color: #FCA5A5 !important;
    }
    .hrm-swal-actions {
      margin: 1.25rem 0 0 0 !important;
      padding: 0 !important;
      width: 100% !important;
      display: flex;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 0.5rem !important;
    }
    .hrm-swal-btn {
      display: inline-flex;
      height: 2.25rem !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 0.5rem !important;
      padding: 0 0.875rem !important;
      font-size: 0.875rem !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: background-color 150ms cubic-bezier(0.22, 1, 0.36, 1), border-color 150ms ease !important;
      outline: none !important;
    }
    .hrm-swal-btn[style*="display: none"],
    .hrm-swal-btn[style*="display:none"],
    .hrm-swal-actions[style*="display: none"],
    .hrm-swal-actions[style*="display:none"],
    .swal2-styled[style*="display: none"] {
      display: none !important;
    }
    .hrm-swal-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.28) !important;
    }
    .hrm-swal-btn-primary {
      background-color: #0F766E !important;
      color: #FCFEFD !important;
      border: 1px solid transparent !important;
    }
    .hrm-swal-btn-primary:hover {
      background-color: #0D5F58 !important;
    }
    html.dark .hrm-swal-btn-primary {
      background-color: #2DD4BF !important;
      color: #09090B !important;
    }
    html.dark .hrm-swal-btn-primary:hover {
      background-color: #5EEAD4 !important;
    }
    .hrm-swal-btn-danger {
      background-color: #DC2626 !important;
      color: #FCFEFD !important;
      border: 1px solid transparent !important;
    }
    .hrm-swal-btn-danger:hover {
      background-color: #B91C1C !important;
    }
    html.dark .hrm-swal-btn-danger {
      background-color: #EF4444 !important;
      color: #FFFFFF !important;
    }
    html.dark .hrm-swal-btn-danger:hover {
      background-color: #DC2626 !important;
    }
    .hrm-swal-btn-warning {
      background-color: #D97706 !important;
      color: #FFFFFF !important;
      border: 1px solid transparent !important;
    }
    .hrm-swal-btn-warning:hover {
      background-color: #B45309 !important;
    }
    html.dark .hrm-swal-btn-warning {
      background-color: #F59E0B !important;
      color: #09090B !important;
    }
    html.dark .hrm-swal-btn-warning:hover {
      background-color: #FBBF24 !important;
    }
    .hrm-swal-btn-cancel {
      background-color: #FCFEFD !important;
      color: #11221E !important;
      border: 1px solid #C6D9D3 !important;
    }
    .hrm-swal-btn-cancel:hover {
      background-color: #E8F3EF !important;
    }
    html.dark .hrm-swal-btn-cancel {
      background-color: #18181B !important;
      color: #E4E4E7 !important;
      border-color: #27272A !important;
    }
    html.dark .hrm-swal-btn-cancel:hover {
      background-color: #27272A !important;
    }
    .hrm-swal-popup .swal2-icon {
      margin: 0 0 0.875rem 0 !important;
      transform: scale(0.82);
      transform-origin: left center;
    }
    .hrm-swal-popup .swal2-icon.swal2-success {
      border-color: rgba(16, 185, 129, 0.3) !important;
      color: #10B981 !important;
    }
    .hrm-swal-popup .swal2-icon.swal2-success .swal2-success-circular-line-left,
    .hrm-swal-popup .swal2-icon.swal2-success .swal2-success-circular-line-right,
    .hrm-swal-popup .swal2-icon.swal2-success .swal2-success-fix {
      background-color: transparent !important;
    }
    .hrm-swal-popup .swal2-icon.swal2-success [class^='swal2-success-line'] {
      background-color: #10B981 !important;
    }
    .hrm-swal-popup .swal2-icon.swal2-success .swal2-success-ring {
      border-color: rgba(16, 185, 129, 0.3) !important;
    }
  `;
  document.head.appendChild(style);
}

function getBackdropColor(): string {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'rgba(9, 9, 11, 0.65)';
  }
  return 'rgba(17, 34, 30, 0.45)';
}

function getConfirmButtonClass(variant: SwalVariant = 'primary'): string {
  if (variant === 'danger') {
    return 'hrm-swal-btn hrm-swal-btn-danger rounded-lg bg-red-600 text-[#FCFEFD] hover:bg-red-700';
  }
  if (variant === 'warning') {
    return 'hrm-swal-btn hrm-swal-btn-warning rounded-lg bg-amber-600 text-white hover:bg-amber-700';
  }
  return 'hrm-swal-btn hrm-swal-btn-primary rounded-lg bg-[#0F766E] text-[#FCFEFD] hover:bg-[#0D5F58] dark:bg-teal-400 dark:text-zinc-950';
}

function buildFallbackPlainMessage(title: string, html?: string, text?: string): string {
  const body = text
    ? text
    : html
      ? html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|li)>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      : '';
  return body ? `${title}\n\n${body}` : title;
}

async function loadThemedSwal(variant: SwalVariant = 'primary') {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    ensureSwalThemeInjected();
    const mod = await import('sweetalert2');
    const Swal = mod.default;

    const baseOptions: SweetAlertOptions = {
      buttonsStyling: false,
      reverseButtons: true,
      backdrop: getBackdropColor(),
      customClass: {
        popup:
          'hrm-swal-popup rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 text-[#11221E] dark:border-zinc-800/80 dark:bg-[#121214] dark:text-zinc-100',
        title: 'hrm-swal-title text-base font-semibold text-[#11221E] dark:text-zinc-100',
        htmlContainer: 'hrm-swal-html text-sm text-[#415A54] dark:text-zinc-400',
        inputLabel: 'hrm-swal-label',
        input: 'hrm-swal-input',
        validationMessage: 'hrm-swal-validation',
        actions: 'hrm-swal-actions',
        confirmButton: getConfirmButtonClass(variant),
        denyButton:
          'hrm-swal-btn hrm-swal-btn-cancel rounded-lg border border-[#0F766E]/40 bg-[#E8F3EF] text-[#0B4F4A] hover:bg-[#CBE8E2] dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/60',
        cancelButton:
          'hrm-swal-btn hrm-swal-btn-cancel rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
      },
    };

    return Swal.mixin(baseOptions);
  } catch {
    return null;
  }
}

export async function choiceSwal({
  title,
  html,
  text,
  confirmText,
  denyText,
  cancelText = 'Hủy bỏ',
  variant = 'primary',
}: ChoiceSwalOptions): Promise<'confirm' | 'deny' | 'cancel'> {
  if (typeof window === 'undefined') return 'cancel';
  const swal = await loadThemedSwal(variant);
  if (!swal) {
    return window.confirm(buildFallbackPlainMessage(title, html, text))
      ? 'confirm'
      : 'cancel';
  }

  try {
    const result = await swal.fire({
      title,
      ...(html ? { html } : text ? { text } : {}),
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: confirmText,
      denyButtonText: denyText,
      cancelButtonText: cancelText,
      focusConfirm: true,
    });

    if (result.isConfirmed) return 'confirm';
    if (result.isDenied) return 'deny';
    return 'cancel';
  } catch {
    return window.confirm(buildFallbackPlainMessage(title, html, text))
      ? 'confirm'
      : 'cancel';
  }
}

export async function confirmSwal({
  title,
  html,
  text,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  variant = 'primary',
}: ConfirmSwalOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const swal = await loadThemedSwal(variant);
  if (!swal) {
    return window.confirm(buildFallbackPlainMessage(title, html, text));
  }

  try {
    const result = await swal.fire({
      title,
      ...(html ? { html } : { text }),
      showCancelButton: true,
      showDenyButton: false,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      focusConfirm: variant !== 'danger',
      focusCancel: variant === 'danger',
    });

    return Boolean(result.isConfirmed);
  } catch {
    return window.confirm(buildFallbackPlainMessage(title, html, text));
  }
}

export async function promptTextSwal({
  title,
  label,
  html,
  text,
  placeholder = 'Nhập nội dung...',
  defaultValue = '',
  required = true,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  inputType = 'textarea',
  variant = 'primary',
}: PromptTextSwalOptions): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const swal = await loadThemedSwal(variant);
  if (!swal) {
    const fallbackPrompt = buildFallbackPlainMessage(
      label ? `${title} — ${label}` : title,
      html,
      text
    );
    const val = window.prompt(fallbackPrompt, defaultValue);
    if (val === null) return null;
    const trimmed = val.trim();
    if (required && !trimmed) return null;
    return trimmed;
  }

  try {
    const result = await swal.fire({
      title,
      ...(html ? { html } : text ? { text } : {}),
      input: inputType,
      inputLabel: label,
      inputPlaceholder: placeholder,
      inputValue: defaultValue,
      showCancelButton: true,
      showDenyButton: false,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      inputValidator: (value: string) => {
        const trimmed = (value ?? '').trim();
        if (required && !trimmed) {
          return 'Vui lòng nhập thông tin bắt buộc trước khi xác nhận.';
        }
        return null;
      },
    });

    if (!result.isConfirmed) {
      return null;
    }

    return typeof result.value === 'string' ? result.value.trim() : '';
  } catch {
    const val = window.prompt(buildFallbackPlainMessage(title, html, text), defaultValue);
    if (val === null) return null;
    const trimmed = val.trim();
    if (required && !trimmed) return null;
    return trimmed;
  }
}

export async function alertSwal({
  title,
  html,
  text,
  confirmText = 'Đã hiểu',
  icon = 'info',
}: AlertSwalOptions): Promise<void> {
  if (typeof window === 'undefined') return;
  const variant: SwalVariant =
    icon === 'error' ? 'danger' : icon === 'warning' ? 'warning' : 'primary';
  const swal = await loadThemedSwal(variant);
  if (!swal) {
    window.alert(buildFallbackPlainMessage(title, html, text));
    return;
  }

  try {
    await swal.fire({
      title,
      ...(html ? { html } : { text }),
      icon: icon as SweetAlertIcon,
      showCancelButton: false,
      showDenyButton: false,
      confirmButtonText: confirmText,
    });
  } catch {
    window.alert(buildFallbackPlainMessage(title, html, text));
  }
}
