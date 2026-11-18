import { getIcon } from '../components/icons.js';
import { initHeader, renderHeader } from '../components/header.js';
import { initSidebar, renderSidebar } from '../components/sidebar.js';
import { showToast } from '../components/toast.js';
import { buildErrorStateHtml, renderAppUiState } from '../components/ui-states.js';
import { runPageGuard } from './guard.js';
import { canAccessNav, getNavItem, getRoleMeta } from './rbac.js';
import {
  getCurrentDisplayProfile,
  getState,
  setCopilotOpen,
  setUiState,
  subscribe,
} from './state.js';
import { toUrl } from './utils.js';

const UI_STATE_LABELS = {
  ready: 'Ready · Sẵn sàng dữ liệu',
  loading: 'Loading · Đang nạp dữ liệu',
  empty: 'Empty · Chưa có dữ liệu kỳ',
  error: 'Error · Gián đoạn kết nối',
};

const QUICK_STATE_ACTIVE_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50/90 px-3 text-xs font-medium text-teal-800 transition-unslop dark:border-teal-400/30 dark:bg-teal-950/50 dark:text-teal-300';
const QUICK_STATE_IDLE_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-3 text-xs font-medium text-zinc-700 transition-unslop hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800/80 dark:bg-[#121214] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

let appEventsBound = false;
let unsubscribeState = null;

function syncDeclarativeBindings(state) {
  const profile = getCurrentDisplayProfile();
  const roleMeta = getRoleMeta(state.role);
  const navItem = getNavItem(state.activeNav);

  const values = {
    roleCode: state.role,
    roleLabel: roleMeta.label,
    roleShort: roleMeta.shortLabel,
    userName: profile.empName || profile.fullName || roleMeta.empName,
    empCode: profile.empCode || roleMeta.empCode,
    email: profile.email || roleMeta.email,
    department: profile.department || roleMeta.department,
    shiftCode: profile.shiftCode || roleMeta.shiftCode,
    scopeNote: roleMeta.scopeNote,
    uiState: state.uiState,
    uiStateLabel: UI_STATE_LABELS[state.uiState] || UI_STATE_LABELS.ready,
    activeNavLabel: navItem ? navItem.label : state.activeNav,
    themeLabel: state.theme === 'dark' ? 'Dark Mode' : 'Light Mode',
  };

  document.querySelectorAll('[data-shell-bind]').forEach((el) => {
    const key = el.getAttribute('data-shell-bind');
    if (key && Object.prototype.hasOwnProperty.call(values, key)) {
      el.textContent = String(values[key]);
    }
  });

  document.querySelectorAll('[data-shell-role-badge]').forEach((el) => {
    el.textContent = roleMeta.shortLabel;
    el.className = `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${roleMeta.badgeClass}`;
  });

  document.querySelectorAll('[data-quick-ui-state]').forEach((btn) => {
    const key = btn.getAttribute('data-quick-ui-state');
    const isActive = key === state.uiState;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.className = isActive ? QUICK_STATE_ACTIVE_CLASS : QUICK_STATE_IDLE_CLASS;
  });

  document.querySelectorAll('[data-shell-nav-link]').forEach((link) => {
    const targetNav = link.getAttribute('data-shell-nav-link');
    const item = targetNav ? getNavItem(targetNav) : null;
    if (!item) return;

    link.setAttribute('href', toUrl(item.path));
    const allowed = canAccessNav(state.role, item.id);
    link.hidden = !allowed;
    link.classList.toggle('hidden', !allowed);
    link.classList.toggle('inline-flex', allowed);
  });
}

function ensureMobileDrawerContainer() {
  let drawer = document.getElementById('app-mobile-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'app-mobile-drawer';
    drawer.className = 'mobile-drawer-overlay lg:hidden';
    drawer.setAttribute('data-open', 'false');
    drawer.hidden = true;
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Menu điều hướng');
    drawer.innerHTML =
      '<div class="mobile-drawer-backdrop" data-sidebar-backdrop="true"></div>' +
      '<div id="app-mobile-sidebar" class="mobile-drawer-panel"></div>';
    document.body.appendChild(drawer);
  }
  return document.getElementById('app-mobile-sidebar');
}

function mountFloatingCopilotButton() {
  if (typeof document === 'undefined' || document.getElementById('app-copilot-fab')) {
    return;
  }

  const fab = document.createElement('button');
  fab.id = 'app-copilot-fab';
  fab.type = 'button';
  fab.setAttribute('data-copilot-fab', 'true');
  fab.setAttribute('aria-label', 'Mở AI HR Copilot NLP');
  fab.className =
    'fixed bottom-5 right-5 z-40 inline-flex h-11 max-w-[calc(100vw-2.5rem)] items-center gap-2 rounded-xl border border-teal-700/20 bg-teal-700 px-3.5 text-xs font-medium text-white shadow-sm transition-unslop hover:bg-teal-800 dark:border-teal-400/25 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300';
  fab.innerHTML =
    `${getIcon('sparkles', 'w-4 h-4 shrink-0')}` +
    '<span class="truncate">AI HR Copilot · NLP</span>';

  document.body.appendChild(fab);
}

function bindAppEvents() {
  if (typeof document === 'undefined' || appEventsBound) return;
  appEventsBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-app-reset-ready]')) {
      setUiState('ready');
      showToast('Đã nạp dữ liệu mẫu kỳ 11/2026', 'Màn hình đã trở về trạng thái sẵn sàng.', 'success');
      return;
    }

    if (target.closest('[data-app-retry-ready]')) {
      setUiState('ready');
      showToast('Đã khôi phục kết nối', 'Dữ liệu kỳ 11/2026 đã sẵn sàng hiển thị.', 'success');
      return;
    }

    const quickStateBtn = target.closest('[data-quick-ui-state]');
    if (quickStateBtn) {
      const nextState = quickStateBtn.getAttribute('data-quick-ui-state') || 'ready';
      setUiState(nextState);
      return;
    }

    if (target.closest('[data-copilot-fab]')) {
      const current = getState();
      setCopilotOpen(!current.copilotOpen);
      showToast(
        'AI HR Copilot',
        'Panel trợ lý AI đầy đủ sẽ được kích hoạt ở Bước 6.',
        'default',
      );
    }
  });
}

async function fetchShellPartial(relativePath) {
  const response = await fetch(toUrl(relativePath), {
    method: 'GET',
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) {
    throw new Error(`Không thể nạp khung giao diện "${relativePath}" (HTTP ${response.status}).`);
  }
  return response.text();
}

/**
 * Khởi tạo AppShell dùng chung: kiểm tra guard, nạp partials, kích hoạt Sidebar/Header và trạng thái UI.
 * @param {{ navId?: string, onReady?: (state: ReturnType<typeof getState>) => void | Promise<void> }} [options={}]
 */
export async function bootstrapApp(options = {}) {
  const { navId, onReady } = options || {};
  const resolvedNavId =
    String(navId || document.body?.dataset?.navId || 'dashboard').trim() || 'dashboard';

  const guardResult = runPageGuard(resolvedNavId);
  if (!guardResult.allowed || guardResult.redirected) {
    return guardResult;
  }

  try {
    const [sidebarHtml, headerHtml] = await Promise.all([
      fetchShellPartial('partials/sidebar.html'),
      fetchShellPartial('partials/header.html'),
    ]);

    const desktopSidebarEl = document.getElementById('app-sidebar');
    if (desktopSidebarEl) {
      desktopSidebarEl.innerHTML = sidebarHtml;
    }

    const mobileSidebarEl = ensureMobileDrawerContainer();
    if (mobileSidebarEl) {
      mobileSidebarEl.innerHTML = sidebarHtml.replace('id="sidebar-nav"', 'id="sidebar-nav-mobile"');
    }

    const headerEl = document.getElementById('app-header');
    if (headerEl) {
      headerEl.innerHTML = headerHtml;
    }

    initSidebar();
    initHeader();
    mountFloatingCopilotButton();
    bindAppEvents();

    const initialState = getState();
    renderAppUiState(initialState);
    syncDeclarativeBindings(initialState);

    if (unsubscribeState) {
      unsubscribeState();
    }
    unsubscribeState = subscribe((nextState) => {
      renderAppUiState(nextState);
      syncDeclarativeBindings(nextState);
      renderHeader();
      renderSidebar();
    });

    if (typeof onReady === 'function') {
      await onReady(initialState);
    }
  } catch (error) {
    const stateContainer = document.getElementById('app-state-container');
    const pageContent = document.getElementById('app-page-content');
    if (pageContent) {
      pageContent.hidden = true;
      pageContent.classList.add('hidden');
    }
    if (stateContainer) {
      stateContainer.hidden = false;
      stateContainer.classList.remove('hidden');
      stateContainer.innerHTML = buildErrorStateHtml(
        error instanceof Error ? error.message : 'Vui lòng tải lại trang.',
      );
    }
    showToast(
      'Không thể khởi tạo khung ứng dụng',
      error instanceof Error ? error.message : 'Vui lòng tải lại trang.',
      'error',
    );
  }

  return guardResult;
}

if (typeof document !== 'undefined') {
  const autoBoot = () => {
    const body = document.body;
    if (body && body.dataset.autoBoot === 'true') {
      bootstrapApp({ navId: body.dataset.navId || 'dashboard' });
    }
  };

  if (document.readyState === 'complete') {
    autoBoot();
  } else {
    document.addEventListener('DOMContentLoaded', autoBoot, { once: true });
  }
}
