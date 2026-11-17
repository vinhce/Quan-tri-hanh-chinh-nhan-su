import { toUrl } from './utils.js';
import { canAccessNav, getDefaultPageForRole } from './rbac.js';
import { getState, setActiveNav } from './state.js';

/**
 * Kiểm tra phiên đăng nhập và quyền RBAC cho trang hiện tại.
 * @param {string} navId
 * @returns {{ allowed: boolean, redirected: boolean, state: ReturnType<typeof getState> }}
 */
export function runPageGuard(navId) {
  const state = getState();

  if (state.isLoggedOut) {
    if (typeof window !== 'undefined' && window.location) {
      window.location.replace(toUrl('login.html'));
    }
    return { allowed: false, redirected: true, state };
  }

  if (!canAccessNav(state.role, navId)) {
    if (typeof window !== 'undefined' && window.location) {
      window.location.replace(toUrl(getDefaultPageForRole(state.role)));
    }
    return { allowed: false, redirected: true, state };
  }

  setActiveNav(navId);
  return { allowed: true, redirected: false, state: getState() };
}
