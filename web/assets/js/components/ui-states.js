import { getNavItem } from '../core/rbac.js';
import { escapeHtml } from '../core/utils.js';
import { getIcon } from './icons.js';

function buildLoadingSkeletonHtml() {
  const kpiCards = Array.from({ length: 4 })
    .map(
      () =>
        '<div class="surface-card space-y-3 p-5">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<div class="skeleton-pulse h-3.5 w-28"></div>' +
            '<div class="skeleton-pulse h-7 w-7 rounded-lg"></div>' +
          '</div>' +
          '<div class="skeleton-pulse h-7 w-24"></div>' +
          '<div class="skeleton-pulse h-3 w-36"></div>' +
        '</div>',
    )
    .join('');

  const tableRows = Array.from({ length: 5 })
    .map(
      () =>
        '<div class="flex items-center justify-between gap-4 border-t border-zinc-200/80 py-3 dark:border-zinc-800/80">' +
          '<div class="flex min-w-0 flex-1 items-center gap-3">' +
            '<div class="skeleton-pulse h-8 w-8 shrink-0 rounded-lg"></div>' +
            '<div class="min-w-0 flex-1 space-y-1.5">' +
              '<div class="skeleton-pulse h-3.5 w-44 max-w-full"></div>' +
              '<div class="skeleton-pulse h-3 w-28"></div>' +
            '</div>' +
          '</div>' +
          '<div class="skeleton-pulse h-6 w-20 shrink-0 rounded-md"></div>' +
        '</div>',
    )
    .join('');

  const sideLines = Array.from({ length: 4 })
    .map(
      () =>
        '<div class="space-y-2 rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">' +
          '<div class="skeleton-pulse h-3.5 w-32"></div>' +
          '<div class="skeleton-pulse h-3 w-full"></div>' +
        '</div>',
    )
    .join('');

  return (
    '<div class="space-y-6" aria-busy="true" aria-label="Đang tải dữ liệu">' +
      `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">${kpiCards}</div>` +
      '<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">' +
        '<div class="surface-card p-5 lg:col-span-2">' +
          '<div class="mb-4 flex items-center justify-between gap-3">' +
            '<div class="skeleton-pulse h-5 w-48"></div>' +
            '<div class="skeleton-pulse h-8 w-28 rounded-lg"></div>' +
          '</div>' +
          `<div>${tableRows}</div>` +
        '</div>' +
        '<div class="surface-card space-y-3 p-5">' +
          '<div class="skeleton-pulse h-5 w-36"></div>' +
          `<div class="space-y-2.5">${sideLines}</div>` +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function buildEmptyStateHtml(navLabel) {
  return (
    '<section class="surface-card mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center">' +
      '<div class="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-100/80 text-zinc-600 dark:border-zinc-800/80 dark:bg-zinc-800/70 dark:text-zinc-300">' +
        `${getIcon('inbox', 'w-5 h-5')}` +
      '</div>' +
      `<h2 class="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">Chưa có dữ liệu cho phân hệ ${escapeHtml(navLabel)}</h2>` +
      '<p class="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">' +
        'Hệ thống chưa ghi nhận bản ghi phát sinh hoặc bộ lọc hiện tại không khớp chứng từ nào trong kỳ 11/2026.' +
      '</p>' +
      '<div class="mt-6 flex flex-wrap items-center justify-center gap-2">' +
        '<button type="button" data-app-reset-ready="true" class="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-medium text-white transition-unslop hover:bg-teal-800 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300">' +
          `${getIcon('rotate-ccw', 'w-4 h-4 shrink-0')}` +
          '<span>Nạp dữ liệu mẫu kỳ 11/2026</span>' +
        '</button>' +
      '</div>' +
    '</section>'
  );
}

export function buildErrorStateHtml(detailMessage = '') {
  const safeDetail = detailMessage
    ? escapeHtml(detailMessage)
    : 'Phiên kết nối tới nguồn dữ liệu tạm thời bị gián đoạn. Vui lòng thử kết nối lại để tiếp tục thao tác.';

  return (
    '<section role="alert" class="surface-card mx-auto flex max-w-xl flex-col items-center border-rose-200/80 px-6 py-12 text-center dark:border-rose-900/50">' +
      '<div class="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400">' +
        `${getIcon('alert-triangle', 'w-5 h-5')}` +
      '</div>' +
      '<span class="mt-4 inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">' +
        'ERR_SYNC_LEDGER_504 · Kỳ 11/2026' +
      '</span>' +
      '<h2 class="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Không thể đồng bộ dữ liệu sổ cái nhân sự</h2>' +
      `<p class="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">${safeDetail}</p>` +
      '<div class="mt-6 flex flex-wrap items-center justify-center gap-2">' +
        '<button type="button" data-app-retry-ready="true" class="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-medium text-white transition-unslop hover:bg-teal-800 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300">' +
          `${getIcon('refresh-cw', 'w-4 h-4 shrink-0')}` +
          '<span>Thử kết nối lại ngay</span>' +
        '</button>' +
      '</div>' +
    '</section>'
  );
}

/**
 * Hiển thị một trong 4 trạng thái Ready / Loading / Empty / Error vào #app-state-container.
 * @param {{ uiState: string, activeNav: string }} state
 */
export function renderAppUiState(state) {
  if (typeof document === 'undefined') return;

  const container = document.getElementById('app-state-container');
  const pageContent = document.getElementById('app-page-content');
  if (!container || !pageContent) return;

  if (state.uiState === 'ready') {
    container.hidden = true;
    container.classList.add('hidden');
    container.innerHTML = '';
    pageContent.hidden = false;
    pageContent.classList.remove('hidden');
    return;
  }

  pageContent.hidden = true;
  pageContent.classList.add('hidden');
  container.hidden = false;
  container.classList.remove('hidden');

  if (state.uiState === 'loading') {
    container.innerHTML = buildLoadingSkeletonHtml();
    return;
  }

  if (state.uiState === 'empty') {
    const navItem = getNavItem(state.activeNav);
    container.innerHTML = buildEmptyStateHtml(navItem ? navItem.label : 'hiện tại');
    return;
  }

  container.innerHTML = buildErrorStateHtml();
}
