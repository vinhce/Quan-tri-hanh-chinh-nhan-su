import {
  canAccessNav,
  getDefaultPageForRole,
  getNavItem,
  getRoleMeta,
} from '../core/rbac.js';
import {
  getCurrentDisplayProfile,
  getState,
  logout,
  setCopilotOpen,
  setRole,
  setUiState,
  toggleTheme,
} from '../core/state.js';
import { getInitials, toUrl } from '../core/utils.js';
import { getIcon } from './icons.js';
import { openMobileSidebar, renderSidebar } from './sidebar.js';
import { showToast } from './toast.js';

const UI_STATE_BASE_CLASS =
  'h-7 rounded-md px-2 text-xs font-medium transition-unslop';
const UI_STATE_ACTIVE_TEAL =
  `${UI_STATE_BASE_CLASS} bg-white text-teal-700 shadow-sm dark:bg-[#121214] dark:text-teal-400`;
const UI_STATE_ACTIVE_ERROR =
  `${UI_STATE_BASE_CLASS} bg-white text-rose-700 shadow-sm dark:bg-[#121214] dark:text-rose-400`;
const UI_STATE_INACTIVE =
  `${UI_STATE_BASE_CLASS} text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100`;

const COPILOT_BTN_BASE =
  'hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-unslop sm:inline-flex';
const COPILOT_BTN_IDLE =
  `${COPILOT_BTN_BASE} border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800/80 dark:bg-[#121214] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`;
const COPILOT_BTN_ACTIVE =
  `${COPILOT_BTN_BASE} border-teal-700/30 bg-teal-50/90 text-teal-800 dark:border-teal-400/30 dark:bg-teal-950/50 dark:text-teal-300`;

let headerEventsBound = false;

function syncHeaderTitle(state, roleMeta) {
  const navItem = getNavItem(state.activeNav);
  const titleEl = document.querySelector('[data-header-title]');
  const summaryEl = document.querySelector('[data-header-summary]');

  if (titleEl) {
    titleEl.textContent = navItem ? navItem.label : 'Tổng quan điều hành';
  }
  if (summaryEl) {
    summaryEl.textContent = navItem ? navItem.summary : roleMeta.scopeNote;
  }
}

function syncUiStateButtons(activeUiState) {
  document.querySelectorAll('[data-ui-state-btn]').forEach((btn) => {
    const key = btn.getAttribute('data-ui-state-btn');
    const isActive = key === activeUiState;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (!isActive) {
      btn.className = UI_STATE_INACTIVE;
      return;
    }
    btn.className = key === 'error' ? UI_STATE_ACTIVE_ERROR : UI_STATE_ACTIVE_TEAL;
  });
}

function syncRoleSwitcher(role) {
  const selectEl = document.querySelector('[data-role-switcher]');
  if (selectEl instanceof HTMLSelectElement && selectEl.value !== role) {
    selectEl.value = role;
  }
}

function syncThemeButton(theme) {
  const themeBtn = document.querySelector('[data-header-theme-btn]');
  if (!themeBtn) return;

  const isDark = theme !== 'light';
  themeBtn.innerHTML = getIcon(isDark ? 'sun' : 'moon', 'w-4 h-4 shrink-0');
  const nextLabel = isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  themeBtn.setAttribute('aria-label', nextLabel);
  themeBtn.setAttribute('title', nextLabel);
}

function syncCopilotButton(isOpen) {
  const copilotBtn = document.querySelector('[data-header-copilot-btn]');
  if (!copilotBtn) return;

  copilotBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  copilotBtn.className = isOpen ? COPILOT_BTN_ACTIVE : COPILOT_BTN_IDLE;

  const iconSlot = copilotBtn.querySelector('[data-header-copilot-icon]');
  if (iconSlot) {
    iconSlot.innerHTML = getIcon('bot', 'w-4 h-4 shrink-0');
  }
}

function syncUserBadge(state, roleMeta) {
  const badge = document.querySelector('[data-header-user-badge]');
  if (!badge) return;

  const profile = getCurrentDisplayProfile();
  const displayName = profile.empName || profile.fullName || roleMeta.empName;
  const empCode = profile.empCode || roleMeta.empCode;
  const initials = getInitials(displayName) || 'NV';

  const initialsEl = badge.querySelector('[data-user-initials]');
  const nameEl = badge.querySelector('[data-user-name]');
  const codeEl = badge.querySelector('[data-user-code]');
  const roleEl = badge.querySelector('[data-user-role]');

  if (initialsEl) initialsEl.textContent = initials;
  if (nameEl) nameEl.textContent = displayName;
  if (codeEl) codeEl.textContent = empCode;
  if (roleEl) {
    roleEl.textContent = roleMeta.shortLabel;
    roleEl.className = `inline-flex items-center rounded border px-1 py-0 text-[10px] font-medium ${roleMeta.badgeClass}`;
  }

  badge.setAttribute('data-role', state.role);
}

function syncStaticIcons() {
  const mobileBtn = document.querySelector('[data-header-mobile-btn]');
  if (mobileBtn) {
    mobileBtn.innerHTML = getIcon('menu', 'w-4 h-4 shrink-0');
  }

  const logoutIconSlot = document.querySelector('[data-header-logout-icon]');
  if (logoutIconSlot) {
    logoutIconSlot.innerHTML = getIcon('log-out', 'w-4 h-4 shrink-0');
  }
}

/**
 * Cập nhật toàn bộ trạng thái hiển thị trên Header theo state hiện tại.
 */
export function renderHeader() {
  if (typeof document === 'undefined') return;

  const state = getState();
  const roleMeta = getRoleMeta(state.role);

  syncHeaderTitle(state, roleMeta);
  syncUiStateButtons(state.uiState);
  syncRoleSwitcher(state.role);
  syncThemeButton(state.theme);
  syncCopilotButton(state.copilotOpen);
  syncUserBadge(state, roleMeta);
  syncStaticIcons();
}

function handleRoleChange(nextRole) {
  const current = getState();
  const nextState = setRole(nextRole);
  const nextMeta = getRoleMeta(nextState.role);

  showToast(
    'Đã chuyển vai trò xem thử',
    `Đang mô phỏng quyền hạn: ${nextMeta.label}.`,
    'default',
  );

  if (!canAccessNav(nextState.role, current.activeNav)) {
    window.location.href = toUrl(getDefaultPageForRole(nextState.role));
    return;
  }

  renderSidebar();
  renderHeader();
}

function bindHeaderEvents() {
  if (typeof document === 'undefined' || headerEventsBound) return;
  headerEventsBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-header-mobile-btn]')) {
      openMobileSidebar();
      return;
    }

    const uiStateBtn = target.closest('[data-ui-state-btn]');
    if (uiStateBtn) {
      const nextUiState = uiStateBtn.getAttribute('data-ui-state-btn') || 'ready';
      setUiState(nextUiState);
      renderHeader();
      return;
    }

    if (target.closest('[data-header-theme-btn]')) {
      const nextTheme = toggleTheme();
      renderHeader();
      showToast(
        nextTheme === 'dark' ? 'Đã bật giao diện tối' : 'Đã bật giao diện sáng',
        'Thiết lập chủ đề đã được lưu cho phiên làm việc hiện tại.',
        'default',
      );
      return;
    }

    if (target.closest('[data-header-copilot-btn]')) {
      const current = getState();
      setCopilotOpen(!current.copilotOpen);
      renderHeader();
      showToast(
        'AI HR Copilot',
        'Panel trợ lý AI đầy đủ sẽ được kích hoạt ở Bước 6.',
        'default',
      );
      return;
    }

    if (target.closest('[data-header-logout-btn]')) {
      logout();
      window.location.href = toUrl('login.html');
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.matches('[data-role-switcher]')) {
      handleRoleChange(target.value);
    }
  });
}

/**
 * Khởi tạo sự kiện Header và đồng bộ dữ liệu hiển thị ban đầu.
 */
export function initHeader() {
  bindHeaderEvents();
  renderHeader();
}
