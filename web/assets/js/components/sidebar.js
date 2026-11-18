import {
  NAV_ITEMS,
  NAV_SECTIONS,
  getRoleMeta,
  getVisibleNavItems,
} from '../core/rbac.js';
import { getState } from '../core/state.js';
import { escapeHtml, toUrl } from '../core/utils.js';
import { getIcon } from './icons.js';

const ACTIVE_ITEM_CLASS =
  'bg-teal-50/90 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 font-medium';
const INACTIVE_ITEM_CLASS =
  'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100 font-normal';
const ACTIVE_ICON_CLASS = 'w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400';
const INACTIVE_ICON_CLASS = 'w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400';
const ACTIVE_BADGE_CLASS =
  'bg-teal-100/80 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200';
const INACTIVE_BADGE_CLASS =
  'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';

let sidebarEventsBound = false;
let lastFocusedBeforeDrawer = null;

function resolveItemBadgeCount(item, role) {
  if (item.id === 'core-hr') {
    return role === 'DEPT_MANAGER' ? 6 : 27;
  }
  if (item.id === 'leaves') {
    return role === 'EMPLOYEE' ? 0 : 5;
  }
  return Number(item.badgeCount) || 0;
}

function buildNavItemMarkup(item, state) {
  const isActive = state.activeNav === item.id;
  const href = toUrl(item.path);
  const badgeCount = resolveItemBadgeCount(item, state.role);
  const itemClasses = isActive ? ACTIVE_ITEM_CLASS : INACTIVE_ITEM_CLASS;
  const iconClasses = isActive ? ACTIVE_ICON_CLASS : INACTIVE_ICON_CLASS;
  const badgeClasses = isActive ? ACTIVE_BADGE_CLASS : INACTIVE_BADGE_CLASS;
  const currentAttr = isActive ? ' aria-current="page"' : '';

  const badgeMarkup =
    badgeCount > 0
      ? `<span class="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-mono tabular-nums font-medium ${badgeClasses}">${escapeHtml(badgeCount)}</span>`
      : '';

  return (
    `<a href="${escapeHtml(href)}" data-nav-id="${escapeHtml(item.id)}"${currentAttr} ` +
      `class="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-unslop ${itemClasses}">` +
      `${getIcon(item.icon, iconClasses)}` +
      `<span class="min-w-0 flex-1 truncate">${escapeHtml(item.label)}</span>` +
      `${badgeMarkup}` +
    `</a>`
  );
}

function buildSidebarNavHtml(state) {
  const visibleIds = new Set(getVisibleNavItems(state.role).map((item) => item.id));
  const visibleItems = NAV_ITEMS.filter((item) => visibleIds.has(item.id));
  let renderedSections = 0;
  const chunks = [];

  for (const sectionTitle of NAV_SECTIONS) {
    const sectionItems = visibleItems.filter((item) => item.section === sectionTitle);
    if (sectionItems.length === 0) {
      continue;
    }

    const headingMargin = renderedSections === 0 ? 'mt-0 mb-2' : 'mt-6 mb-2';
    renderedSections += 1;

    const linksHtml = sectionItems.map((item) => buildNavItemMarkup(item, state)).join('');
    chunks.push(
      `<div class="sidebar-section">` +
        `<p class="${headingMargin} px-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">${escapeHtml(sectionTitle)}</p>` +
        `<div class="space-y-0.5">${linksHtml}</div>` +
      `</div>`,
    );
  }

  return chunks.join('');
}

function syncFooterMeta(state) {
  if (typeof document === 'undefined') return;

  const roleMeta = getRoleMeta(state.role);
  const loginHref = toUrl('login.html');

  document.querySelectorAll('[data-sidebar-role-badge]').forEach((el) => {
    el.textContent = roleMeta.shortLabel;
    el.className = `inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${roleMeta.badgeClass}`;
  });

  document.querySelectorAll('[data-sidebar-role-scope]').forEach((el) => {
    el.textContent = roleMeta.scopeNote;
  });

  document.querySelectorAll('[data-sidebar-login-link]').forEach((el) => {
    el.setAttribute('href', loginHref);
  });
}

function getMobileDrawerEl() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('app-mobile-drawer');
}

function syncMobileTriggerExpanded(isOpen) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-header-mobile-btn]').forEach((btn) => {
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

/**
 * Mở ngăn kéo Sidebar trên thiết bị di động và chuyển focus vào nút đóng.
 */
export function openMobileSidebar() {
  const drawer = getMobileDrawerEl();
  if (!drawer) return;

  lastFocusedBeforeDrawer =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  drawer.hidden = false;
  drawer.setAttribute('data-open', 'true');
  syncMobileTriggerExpanded(true);

  const closeBtn = drawer.querySelector('[data-sidebar-close]');
  if (closeBtn instanceof HTMLElement) {
    closeBtn.focus();
  }
}

/**
 * Đóng ngăn kéo Sidebar trên thiết bị di động và trả focus về nút mở menu.
 */
export function closeMobileSidebar() {
  const drawer = getMobileDrawerEl();
  if (!drawer) return;

  const wasOpen = !drawer.hidden && drawer.getAttribute('data-open') === 'true';
  drawer.setAttribute('data-open', 'false');
  drawer.hidden = true;
  syncMobileTriggerExpanded(false);

  if (wasOpen) {
    const mobileBtn = document.querySelector('[data-header-mobile-btn]');
    if (lastFocusedBeforeDrawer && lastFocusedBeforeDrawer.isConnected) {
      lastFocusedBeforeDrawer.focus();
    } else if (mobileBtn instanceof HTMLElement) {
      mobileBtn.focus();
    }
    lastFocusedBeforeDrawer = null;
  }
}

/**
 * Render lại danh sách điều hướng Sidebar theo vai trò và mục đang kích hoạt.
 */
export function renderSidebar() {
  if (typeof document === 'undefined') return;
  const state = getState();
  const navHtml = buildSidebarNavHtml(state);

  const navContainers = document.querySelectorAll('[data-sidebar-nav], #sidebar-nav');
  navContainers.forEach((container) => {
    container.innerHTML = navHtml;
  });

  syncFooterMeta(state);
}

function bindSidebarEvents() {
  if (typeof document === 'undefined' || sidebarEventsBound) return;
  sidebarEventsBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-sidebar-close]') || target.closest('[data-sidebar-backdrop]')) {
      closeMobileSidebar();
      return;
    }

    const mobileDrawer = getMobileDrawerEl();
    if (
      mobileDrawer &&
      !mobileDrawer.hidden &&
      mobileDrawer.contains(target) &&
      target.closest('[data-sidebar-nav] a')
    ) {
      closeMobileSidebar();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const mobileDrawer = getMobileDrawerEl();
    if (mobileDrawer && !mobileDrawer.hidden && mobileDrawer.getAttribute('data-open') === 'true') {
      closeMobileSidebar();
    }
  });
}

/**
 * Khởi tạo sự kiện và render Sidebar lần đầu.
 */
export function initSidebar() {
  bindSidebarEvents();
  renderSidebar();
}
