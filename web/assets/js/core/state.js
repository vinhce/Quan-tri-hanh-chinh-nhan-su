import { ROLES, getRoleMeta, normalizeRole } from './rbac.js';

const STORAGE_KEYS = {
  ROLE: 'lacviet_hrm_role',
  EMAIL: 'lacviet_hrm_email',
  PROFILE: 'lacviet_hrm_profile',
  LOGGED_OUT: 'lacviet_hrm_logged_out',
  THEME: 'hrm_theme',
  ACTIVE_NAV: 'hrm_active_nav',
  UI_STATE: 'hrm_ui_state',
  COPILOT_MESSAGES: 'hrm_copilot_messages',
};

const VALID_UI_STATES = ['ready', 'loading', 'empty', 'error'];
const MAX_COPILOT_MESSAGES = 50;
let messageSeq = 0;

function getStorageSafe(type) {
  try {
    return typeof window !== 'undefined' && window[type] ? window[type] : null;
  } catch {
    return null;
  }
}

function readStorage(storage, key, fallback = null) {
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStorage(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // Bỏ qua lỗi quota hoặc chế độ trình duyệt riêng tư
  }
}

function removeStorage(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
}

function readJsonStorage(storage, key, fallback) {
  const raw = readStorage(storage, key, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function applyThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
}

function generateMessageId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `msg_${globalThis.crypto.randomUUID()}`;
  }
  messageSeq += 1;
  return `msg_${Date.now()}_${messageSeq}`;
}

const localStoreInit = getStorageSafe('localStorage');
const sessionStoreInit = getStorageSafe('sessionStorage');
const savedRole = normalizeRole(readStorage(localStoreInit, STORAGE_KEYS.ROLE, 'HR_MANAGER'));
const savedTheme = readStorage(localStoreInit, STORAGE_KEYS.THEME, 'dark');
const savedUiState = readStorage(sessionStoreInit, STORAGE_KEYS.UI_STATE, 'ready');
const initialProfileRaw = readJsonStorage(localStoreInit, STORAGE_KEYS.PROFILE, null);

const state = {
  role: ROLES.includes(savedRole) ? savedRole : 'HR_MANAGER',
  email: readStorage(localStoreInit, STORAGE_KEYS.EMAIL, '') || '',
  profile: initialProfileRaw && typeof initialProfileRaw === 'object' ? initialProfileRaw : null,
  isLoggedOut: readStorage(localStoreInit, STORAGE_KEYS.LOGGED_OUT, 'false') === 'true',
  theme: savedTheme === 'light' ? 'light' : 'dark',
  activeNav: readStorage(localStoreInit, STORAGE_KEYS.ACTIVE_NAV, 'dashboard') || 'dashboard',
  uiState: VALID_UI_STATES.includes(savedUiState) ? savedUiState : 'ready',
  copilotOpen: false,
};

const listeners = new Set();

function notify() {
  const snapshot = getState();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Cô lập lỗi subscriber để không ảnh hưởng luồng cập nhật UI khác
    }
  }
}

/** Lấy bản sao trạng thái ứng dụng hiện tại. */
export function getState() {
  return {
    ...state,
    profile: state.profile ? { ...state.profile } : null,
  };
}

/** Đăng ký lắng nghe thay đổi trạng thái; trả về hàm hủy đăng ký. */
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chuyển vai trò demo hiện tại và đồng bộ hồ sơ mặc định theo vai trò. */
export function setRole(nextRole) {
  const normalized = normalizeRole(nextRole);
  const meta = getRoleMeta(normalized);
  const local = getStorageSafe('localStorage');

  state.role = normalized;
  state.email = meta.email;
  state.profile = { ...meta, fullName: meta.empName };

  writeStorage(local, STORAGE_KEYS.ROLE, normalized);
  writeStorage(local, STORAGE_KEYS.EMAIL, meta.email);
  writeStorage(local, STORAGE_KEYS.PROFILE, JSON.stringify(state.profile));

  notify();
  return getState();
}

/** Thiết lập phiên người dùng sau khi đăng nhập thành công. */
export function setAuthenticatedUser(payload = {}) {
  const normalizedRole = normalizeRole(payload?.role || state.role);
  const meta = getRoleMeta(normalizedRole);
  const resolvedEmail = String(payload?.email || payload?.profile?.email || meta.email).trim();
  const extraProfile = payload?.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const mergedProfile = {
    ...meta,
    ...extraProfile,
    role: normalizedRole,
    email: resolvedEmail,
  };
  mergedProfile.fullName = mergedProfile.fullName || mergedProfile.empName || meta.empName;
  mergedProfile.empName = mergedProfile.empName || mergedProfile.fullName;

  const local = getStorageSafe('localStorage');
  state.role = normalizedRole;
  state.email = resolvedEmail;
  state.profile = mergedProfile;
  state.isLoggedOut = false;

  writeStorage(local, STORAGE_KEYS.ROLE, normalizedRole);
  writeStorage(local, STORAGE_KEYS.EMAIL, resolvedEmail);
  writeStorage(local, STORAGE_KEYS.PROFILE, JSON.stringify(mergedProfile));
  writeStorage(local, STORAGE_KEYS.LOGGED_OUT, 'false');

  notify();
  return getState();
}

/** Đăng xuất phiên hiện tại và đánh dấu trạng thái đã đăng xuất. */
export function logout() {
  const local = getStorageSafe('localStorage');
  state.isLoggedOut = true;
  state.email = '';
  state.profile = null;
  state.copilotOpen = false;

  writeStorage(local, STORAGE_KEYS.LOGGED_OUT, 'true');
  removeStorage(local, STORAGE_KEYS.EMAIL);
  removeStorage(local, STORAGE_KEYS.PROFILE);

  notify();
  return getState();
}

/** Thiết lập chủ đề giao diện ('dark' | 'light') và đồng bộ lớp CSS gốc. */
export function setTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  state.theme = nextTheme;
  writeStorage(getStorageSafe('localStorage'), STORAGE_KEYS.THEME, nextTheme);
  applyThemeToDocument(nextTheme);
  notify();
  return nextTheme;
}

/** Đảo qua lại giữa chế độ tối và chế độ sáng. */
export function toggleTheme() {
  return setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

/** Lưu mã mục điều hướng đang kích hoạt. */
export function setActiveNav(navId) {
  const cleanNav = String(navId ?? '').trim();
  if (!cleanNav || cleanNav === state.activeNav) return state.activeNav;
  state.activeNav = cleanNav;
  writeStorage(getStorageSafe('localStorage'), STORAGE_KEYS.ACTIVE_NAV, cleanNav);
  notify();
  return state.activeNav;
}

/** Thiết lập trạng thái hiển thị UI cho màn hình ('ready' | 'loading' | 'empty' | 'error'). */
export function setUiState(uiState) {
  const nextUiState = VALID_UI_STATES.includes(uiState) ? uiState : 'ready';
  state.uiState = nextUiState;
  writeStorage(getStorageSafe('sessionStorage'), STORAGE_KEYS.UI_STATE, nextUiState);
  notify();
  return nextUiState;
}

/** Mở hoặc đóng ngăn kéo Trợ lý AI Copilot. */
export function setCopilotOpen(isOpen) {
  const nextOpen = Boolean(isOpen);
  if (nextOpen === state.copilotOpen) return state.copilotOpen;
  state.copilotOpen = nextOpen;
  notify();
  return state.copilotOpen;
}

/** Lấy lịch sử hội thoại AI Copilot trong phiên (tối đa 50 tin nhắn gần nhất). */
export function getCopilotMessages() {
  const parsed = readJsonStorage(getStorageSafe('sessionStorage'), STORAGE_KEYS.COPILOT_MESSAGES, []);
  return Array.isArray(parsed) ? parsed.slice(-MAX_COPILOT_MESSAGES) : [];
}

/** Thêm một tin nhắn vào lịch sử AI Copilot (giới hạn tối đa 50 tin nhắn gần nhất). */
export function addCopilotMessage(message) {
  if (!message || typeof message !== 'object') return getCopilotMessages();
  const entry = {
    id: message.id || generateMessageId(),
    createdAt: message.createdAt || new Date().toISOString(),
    ...message,
  };
  const nextMessages = [...getCopilotMessages(), entry].slice(-MAX_COPILOT_MESSAGES);
  writeStorage(
    getStorageSafe('sessionStorage'),
    STORAGE_KEYS.COPILOT_MESSAGES,
    JSON.stringify(nextMessages),
  );
  notify();
  return nextMessages;
}

/** Xóa toàn bộ lịch sử hội thoại AI Copilot trong phiên. */
export function clearCopilotMessages() {
  removeStorage(getStorageSafe('sessionStorage'), STORAGE_KEYS.COPILOT_MESSAGES);
  notify();
  return [];
}

/** Trả về hồ sơ hiển thị hoàn chỉnh cho vai trò / người dùng hiện tại. */
export function getCurrentDisplayProfile() {
  const meta = getRoleMeta(state.role);
  const hasMatchingProfile =
    state.profile &&
    typeof state.profile === 'object' &&
    (!state.profile.role || normalizeRole(state.profile.role) === state.role);

  const merged = {
    ...meta,
    ...(hasMatchingProfile ? state.profile : {}),
    role: meta.role,
    badgeClass: meta.badgeClass,
  };
  merged.empName = merged.empName || merged.fullName || meta.empName;
  merged.fullName = merged.fullName || merged.empName;
  merged.email = merged.email || state.email || meta.email;
  return merged;
}
