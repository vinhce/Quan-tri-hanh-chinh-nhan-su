import { escapeHtml } from '../core/utils.js';
import { getIcon } from './icons.js';

const TOAST_CONTAINER_ID = 'toast-container';
const MAX_TOASTS = 4;
const TOAST_DURATION_MS = 3000;
const LEAVE_ANIMATION_MS = 180;
const FLASH_TOAST_KEY = 'hrm_flash_toast';

const CONTAINER_CLASSES =
  'fixed top-4 right-4 sm:top-5 sm:right-5 z-[9999] flex flex-col gap-2.5 w-[calc(100vw-2rem)] sm:w-96 max-w-sm pointer-events-none';

const VARIANT_MAP = {
  default: {
    cardClass:
      'border-l-4 border-l-teal-600 dark:border-l-teal-400 border-zinc-200/80 bg-white/95 text-zinc-900 shadow-[0_8px_24px_rgba(17,34,30,0.08)] dark:border-zinc-800/80 dark:bg-[#121214]/95 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md',
    iconBoxClass:
      'border-teal-700/20 bg-teal-50/80 text-teal-700 dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-400',
    iconName: 'info',
    role: 'status',
  },
  success: {
    cardClass:
      'border-l-4 border-l-emerald-600 dark:border-l-emerald-400 border-emerald-200/90 bg-white/95 text-zinc-900 shadow-[0_8px_24px_rgba(5,150,105,0.12)] dark:border-emerald-800/60 dark:bg-[#121214]/95 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md',
    iconBoxClass:
      'border-emerald-600/20 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-400',
    iconName: 'check-circle-2',
    role: 'status',
  },
  warning: {
    cardClass:
      'border-l-4 border-l-amber-500 dark:border-l-amber-400 border-amber-200/90 bg-white/95 text-zinc-900 shadow-[0_8px_24px_rgba(217,119,6,0.12)] dark:border-amber-800/60 dark:bg-[#121214]/95 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md',
    iconBoxClass:
      'border-amber-600/20 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-400',
    iconName: 'alert-triangle',
    role: 'alert',
  },
  error: {
    cardClass:
      'border-l-4 border-l-red-600 dark:border-l-red-400 border-rose-200/90 bg-white/95 text-zinc-900 shadow-[0_8px_24px_rgba(220,38,38,0.12)] dark:border-rose-800/60 dark:bg-[#121214]/95 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md',
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
 * Lưu flash toast vào sessionStorage để hiển thị sau khi reload / redirect.
 */
export function setFlashToast(title, description = '', variant = 'success') {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      FLASH_TOAST_KEY,
      JSON.stringify({ title, description, variant })
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Kiểm tra và hiển thị flash toast từ sessionStorage.
 */
export function checkFlashToast() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(FLASH_TOAST_KEY);
    if (raw) {
      window.sessionStorage.removeItem(FLASH_TOAST_KEY);
      const parsed = JSON.parse(raw);
      if (parsed && parsed.title) {
        setTimeout(() => {
          showToast(parsed.title, parsed.description || '', parsed.variant || 'success');
        }, 120);
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Hiển thị thông báo Toast ở góc trên phải (tối đa 4 toast, tự đóng sau 3000ms).
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
    'toast-item pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 transition-unslop',
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

export const notify = {
  addSuccess: (desc, title = 'Thêm mới thành công!') => showToast(title, desc, 'success'),
  createSuccess: (desc, title = 'Tạo thành công!') => showToast(title, desc, 'success'),
  updateSuccess: (desc, title = 'Cập nhật thành công!') => showToast(title, desc, 'success'),
  deleteSuccess: (desc, title = 'Xóa thành công!') => showToast(title, desc, 'success'),
  error: (desc, title = 'Đã xảy ra lỗi, vui lòng thử lại!') => showToast(title, desc, 'error'),
  missingInfo: (desc, title = 'Vui lòng nhập đầy đủ thông tin!') => showToast(title, desc, 'warning'),
  success: (title, desc) => showToast(title, desc, 'success'),
  warning: (title, desc) => showToast(title, desc, 'warning'),
  info: (title, desc) => showToast(title, desc, 'default'),
  setFlash: setFlashToast,
};

// Tự động kiểm tra Flash Toast khi script được nạp
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkFlashToast);
  } else {
    checkFlashToast();
  }
}
