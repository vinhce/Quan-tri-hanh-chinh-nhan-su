import { escapeHtml } from '../core/utils.js';
import { getIcon } from './icons.js';

const TOAST_CONTAINER_ID = 'toast-container';
const MAX_TOASTS = 4;
const TOAST_DURATION_MS = 4000;
const LEAVE_ANIMATION_MS = 180;

const CONTAINER_CLASSES =
  'fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-full max-w-sm pointer-events-none';

const VARIANT_MAP = {
  default: {
    cardClass:
      'border-zinc-200/80 bg-white text-zinc-900 dark:border-zinc-800/80 dark:bg-[#121214] dark:text-zinc-100',
    iconBoxClass:
      'border-teal-700/20 bg-teal-50/80 text-teal-700 dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-400',
    iconName: 'info',
    role: 'status',
  },
  success: {
    cardClass:
      'border-emerald-200/90 bg-white text-zinc-900 dark:border-emerald-800/60 dark:bg-[#121214] dark:text-zinc-100',
    iconBoxClass:
      'border-emerald-600/20 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-400',
    iconName: 'check-circle-2',
    role: 'status',
  },
  warning: {
    cardClass:
      'border-amber-200/90 bg-white text-zinc-900 dark:border-amber-800/60 dark:bg-[#121214] dark:text-zinc-100',
    iconBoxClass:
      'border-amber-600/20 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-400',
    iconName: 'alert-triangle',
    role: 'alert',
  },
  error: {
    cardClass:
      'border-rose-200/90 bg-white text-zinc-900 dark:border-rose-800/60 dark:bg-[#121214] dark:text-zinc-100',
    iconBoxClass:
      'border-rose-600/20 bg-rose-50/80 text-rose-700 dark:border-rose-400/20 dark:bg-rose-950/40 dark:text-rose-400',
    iconName: 'alert-triangle',
    role: 'alert',
  },
};

const activeTimers = new WeakMap();

function getOrCreateContainer() {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = CONTAINER_CLASSES;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

function removeToastImmediately(toastEl) {
  const timers = activeTimers.get(toastEl);
  if (timers) {
    clearTimeout(timers.autoDismissId);
    clearTimeout(timers.removeId);
    activeTimers.delete(toastEl);
  }
  if (toastEl.parentNode) {
    toastEl.parentNode.removeChild(toastEl);
  }
}

function dismissToastElement(toastEl) {
  if (!toastEl || toastEl.dataset.dismissing === 'true') return;
  toastEl.dataset.dismissing = 'true';

  const timers = activeTimers.get(toastEl) || {};
  clearTimeout(timers.autoDismissId);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    removeToastImmediately(toastEl);
    return;
  }

  toastEl.classList.remove('toast-item');
  toastEl.classList.add('toast-item-leaving');
  timers.removeId = setTimeout(() => {
    removeToastImmediately(toastEl);
  }, LEAVE_ANIMATION_MS);
  activeTimers.set(toastEl, timers);
}

/**
 * Hiển thị thông báo Toast ở góc dưới phải (tối đa 4 toast, tự đóng sau 4000ms).
 * @param {string} title
 * @param {string} [description='']
 * @param {'default'|'success'|'warning'|'error'} [variant='default']
 */
export function showToast(title, description = '', variant = 'default') {
  const container = getOrCreateContainer();
  if (!container) return null;

  const variantKey = Object.prototype.hasOwnProperty.call(VARIANT_MAP, variant)
    ? variant
    : 'default';
  const style = VARIANT_MAP[variantKey];

  // Giới hạn tối đa 4 toast cùng lúc
  while (container.children.length >= MAX_TOASTS) {
    const oldest = container.firstElementChild;
    if (!oldest) break;
    removeToastImmediately(oldest);
  }

  const safeTitle = escapeHtml(title == null ? '' : String(title));
  const rawDescription = description == null ? '' : String(description).trim();
  const safeDescription = rawDescription ? escapeHtml(rawDescription) : '';

  const toastEl = document.createElement('div');
  toastEl.setAttribute('role', style.role);
  toastEl.className = [
    'toast-item pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-sm dark:shadow-none transition-unslop',
    style.cardClass,
  ].join(' ');

  const descriptionHtml = safeDescription
    ? `<p class="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 break-words">${safeDescription}</p>`
    : '';

  toastEl.innerHTML =
    `<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${style.iconBoxClass}">` +
      `${getIcon(style.iconName, 'w-4 h-4 shrink-0')}` +
    `</div>` +
    `<div class="min-w-0 flex-1">` +
      `<p class="text-xs font-semibold leading-5 text-zinc-900 dark:text-zinc-100 break-words">${safeTitle}</p>` +
      `${descriptionHtml}` +
    `</div>` +
    `<button type="button" data-toast-close="true" aria-label="Đóng thông báo" ` +
      `class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-unslop hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">` +
      `${getIcon('x', 'w-4 h-4')}` +
    `</button>`;

  const closeBtn = toastEl.querySelector('[data-toast-close="true"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      dismissToastElement(toastEl);
    });
  }

  container.appendChild(toastEl);

  const autoDismissId = setTimeout(() => {
    dismissToastElement(toastEl);
  }, TOAST_DURATION_MS);
  activeTimers.set(toastEl, { autoDismissId, removeId: null });

  return toastEl;
}
