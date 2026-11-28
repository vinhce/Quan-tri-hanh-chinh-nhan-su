'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  HRM_RUNTIME_EVENT,
  findSystemUserForLogin,
  initRuntimeSync,
} from '@/lib/runtime-store';
import type { NaturalLanguageLeaveDraft } from '@/mock/types';

export type RoleCode =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_MANAGER'
  | 'DEPT_MANAGER'
  | 'EMPLOYEE'
  | 'CANDIDATE';

export const ROLE_DEFAULT_PROFILES: Record<
  RoleCode,
  {
    fullName: string;
    employee_code: string;
    title: string;
    department: string;
    email: string;
  }
> = {
  SUPER_ADMIN: {
    fullName: 'Nguyễn Văn An',
    employee_code: 'NV-2024-001',
    title: 'Giám đốc Công nghệ & Hệ thống',
    department: 'Ban Điều hành',
    email: 'an.nguyen@lacviethrm.vn',
  },
  DIRECTOR: {
    fullName: 'Trần Quốc Việt',
    employee_code: 'NV-2024-000',
    title: 'Giám đốc Điều hành',
    department: 'Ban Điều hành',
    email: 'viet.tran@hrm-enterprise.vn',
  },
  HR_MANAGER: {
    fullName: 'Trần Thị Bích Ngọc',
    employee_code: 'NV-2024-002',
    title: 'Trưởng phòng Nhân sự & Hành chính',
    department: 'Phòng Nhân sự & Hành chính',
    email: 'ngoc.tran@lacviethrm.vn',
  },
  DEPT_MANAGER: {
    fullName: 'Lê Hoàng Nam',
    employee_code: 'NV-2024-003',
    title: 'Trưởng phòng Kỹ thuật Phần mềm',
    department: 'Khối Công nghệ',
    email: 'nam.le@lacviethrm.vn',
  },
  EMPLOYEE: {
    fullName: 'Phạm Minh Tuấn',
    employee_code: 'NV-2024-004',
    title: 'Chuyên viên Phát triển Sản phẩm',
    department: 'Khối Công nghệ',
    email: 'tuan.pham@lacviethrm.vn',
  },
  CANDIDATE: {
    fullName: 'Hoàng Vũ Minh',
    employee_code: 'UV-2026-001',
    title: 'Ứng viên tìm việc',
    department: 'Ứng viên dự tuyển',
    email: 'minh.hoang@gmail.com',
  },
};

export type UiState = 'ready' | 'loading' | 'empty' | 'error';

export interface UserProfileOverride {
  fullName?: string;
  department?: string;
  department_id?: string;
  employee_code?: string;
  title?: string;
  email?: string;
}

export interface NavIntent {
  navId: string;
  entityId?: string;
  subTab?: string;
  leaveDraft?: NaturalLanguageLeaveDraft;
  ts: number;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export interface AppContextValue {
  role: RoleCode;
  setRole: (r: RoleCode) => void;
  currentUserEmail: string | null;
  currentUserProfile: UserProfileOverride | null;
  isAuthenticated: boolean;
  setAuthenticatedUser: (
    r: RoleCode,
    email?: string | null,
    profile?: UserProfileOverride | null,
    options?: { skipServerDemoSync?: boolean }
  ) => void;
  logout: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  activeNav: string;
  setActiveNav: (id: string) => void;
  navIntent: NavIntent | null;
  navigateWithIntent: (
    navId: string,
    intent?: {
      entityId?: string;
      subTab?: string;
      leaveDraft?: NaturalLanguageLeaveDraft;
    }
  ) => void;
  clearNavIntent: () => void;
  uiState: UiState;
  setUiState: (s: UiState) => void;
  showToast: (title: string, description?: string, variant?: ToastMessage['variant']) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

export const HRM_SESSION_SYNCED_EVENT = 'hrm-session-synced';

const STORAGE_ROLE_KEY = 'lacviet_hrm_role';
const LEGACY_DEMO_ROLE_KEY = 'hrm_demo_role';
const STORAGE_EMAIL_KEY = 'lacviet_hrm_email';
const STORAGE_PROFILE_KEY = 'lacviet_hrm_profile';
const STORAGE_THEME_KEY = 'hrm_theme';
const STORAGE_NAV_KEY = 'hrm_active_nav';
const VALID_ROLES: RoleCode[] = ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE', 'CANDIDATE'];

const EMPLOYEE_RESTRICTED_NAVS = new Set([
  'ats',
  'recruitment',
  'onboarding',
  'assets',
  'core-hr',
  'employees',
  'contracts',
  'payroll',
  'performance',
  'kpi',
  'rbac',
  'roles',
  'settings',
  'audit-logs',
  'admin-roles',
  'admin-settings',
  'admin-audit',
]);

const DEPT_MANAGER_RESTRICTED_NAVS = new Set([
  'payroll',
  'rbac',
  'roles',
  'settings',
  'audit-logs',
  'admin-roles',
  'admin-settings',
  'admin-audit',
]);

function resolveAllowedNav(navId: string, currentRole: RoleCode): string {
  const normalized = navId.trim();
  if (!normalized) return 'dashboard';
  if (currentRole === 'CANDIDATE') {
    return 'dashboard';
  }
  if (currentRole === 'EMPLOYEE') {
    if (EMPLOYEE_RESTRICTED_NAVS.has(normalized) || normalized.startsWith('admin-')) {
      return 'dashboard';
    }
  }
  if (currentRole === 'DEPT_MANAGER') {
    if (DEPT_MANAGER_RESTRICTED_NAVS.has(normalized) || normalized.startsWith('admin-')) {
      return 'dashboard';
    }
  }
  return normalized;
}

export interface ServerSessionActionResult {
  ok: boolean;
  status: number;
  networkError?: boolean;
  data?: {
    authenticated?: boolean;
    role?: RoleCode;
    employeeCode?: string;
    email?: string;
    fullName?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

async function postHrmSessionAction(
  body: Record<string, unknown>
): Promise<ServerSessionActionResult> {
  if (typeof window === 'undefined') {
    return { ok: false, status: 0, networkError: true };
  }
  try {
    const res = await fetch('/api/hrm/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404 || res.status === 405) {
      return { ok: false, status: res.status, networkError: true };
    }
    let json: {
      success?: boolean;
      data?: ServerSessionActionResult['data'];
      error?: ServerSessionActionResult['error'];
    } | null = null;
    try {
      json = await res.json();
    } catch {
      return { ok: false, status: res.status, networkError: true };
    }
    return {
      ok: res.ok && Boolean(json?.success),
      status: res.status,
      data: json?.data,
      error: json?.error,
    };
  } catch {
    return { ok: false, status: 0, networkError: true };
  }
}

export async function syncServerHrmSession(
  roleOrInput: RoleCode | { role: RoleCode }
): Promise<boolean> {
  const targetRole =
    typeof roleOrInput === 'string' ? roleOrInput : roleOrInput.role;
  if (typeof window === 'undefined') {
    return false;
  }
  const result = await postHrmSessionAction({
    mode: 'demo_switch',
    role: targetRole,
  });
  if (result.ok) {
    window.dispatchEvent(new Event(HRM_SESSION_SYNCED_EVENT));
  }
  return result.ok;
}

export async function loginServerHrmSession(params: {
  email: string;
  password: string;
}): Promise<ServerSessionActionResult> {
  return postHrmSessionAction({
    mode: 'login',
    email: params.email.trim(),
    password: params.password,
  });
}

export async function registerServerHrmSession(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<ServerSessionActionResult> {
  return postHrmSessionAction({
    mode: 'register',
    email: params.email.trim(),
    password: params.password,
    fullName: params.fullName.trim(),
  });
}

export async function clearServerHrmSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/hrm/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // Ignore network or static-export errors
  }
}

function isStandardDemoAccountIdentity(
  targetRole: RoleCode,
  email?: string | null,
  employeeCode?: string | null
): boolean {
  if (targetRole === 'CANDIDATE') return false;
  const defProfile = ROLE_DEFAULT_PROFILES[targetRole];
  if (!defProfile) return false;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanCode = (employeeCode || '').trim().toLowerCase();
  const demoEmail = defProfile.email.trim().toLowerCase();
  const demoCode = defProfile.employee_code.trim().toLowerCase();
  if (cleanCode && cleanCode !== demoCode) return false;
  if (!cleanEmail) return false;
  if (cleanEmail === demoEmail) return true;
  const demoLocal = demoEmail.split('@')[0];
  const emailLocal = cleanEmail.split('@')[0];
  return (
    Boolean(demoLocal) &&
    emailLocal === demoLocal &&
    (cleanEmail.endsWith('@lacviethrm.vn') ||
      cleanEmail.endsWith('@hrm-enterprise.vn'))
  );
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<RoleCode>('EMPLOYEE');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfileOverride | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [activeNav, setActiveNavState] = useState<string>('dashboard');
  const [navIntent, setNavIntent] = useState<NavIntent | null>(null);
  const [uiState, setUiState] = useState<UiState>('ready');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem(STORAGE_EMAIL_KEY);
      const savedProfileRaw = window.localStorage.getItem(STORAGE_PROFILE_KEY);
      const parsedProfile = savedProfileRaw
        ? (JSON.parse(savedProfileRaw) as UserProfileOverride)
        : null;
      const savedRole = window.localStorage.getItem(STORAGE_ROLE_KEY) as RoleCode | null;
      let effectiveInitialRole: RoleCode = 'EMPLOYEE';

      if (savedEmail) {
        const authCheck = findSystemUserForLogin(
          parsedProfile?.employee_code || savedEmail
        );
        const isMissingRuntimeEmployee =
          savedRole !== 'CANDIDATE' && !authCheck.user && !authCheck.employee;
        if (!authCheck.canLogin || isMissingRuntimeEmployee) {
          window.localStorage.removeItem(STORAGE_ROLE_KEY);
          window.localStorage.removeItem(LEGACY_DEMO_ROLE_KEY);
          window.localStorage.removeItem(STORAGE_EMAIL_KEY);
          window.localStorage.removeItem(STORAGE_PROFILE_KEY);
          window.localStorage.removeItem('lacviet_applied_candidate_email');
          if (typeof document !== 'undefined') {
            document.cookie = 'hrm_role=; path=/; max-age=0; SameSite=Lax';
            document.cookie = 'hrm_token=; path=/; max-age=0; SameSite=Lax';
            document.cookie = isMissingRuntimeEmployee
              ? 'hrm_active=; path=/; max-age=0; SameSite=Lax'
              : 'hrm_active=0; path=/; max-age=60; SameSite=Lax';
          }
          void clearServerHrmSession();
          if (isMissingRuntimeEmployee && window.location.pathname.startsWith('/app')) {
            window.location.assign('/login');
            return;
          }
        } else {
          setCurrentUserEmail(savedEmail);
          if (parsedProfile) {
            const normalizedProfile: UserProfileOverride =
              parsedProfile.department &&
              parsedProfile.department.includes('Cổng Ứng viên')
                ? { ...parsedProfile, department: 'Ứng viên dự tuyển' }
                : parsedProfile;
            setCurrentUserProfile(normalizedProfile);
          }
          const resolvedSavedRole: RoleCode =
            authCheck.user?.role_code && VALID_ROLES.includes(authCheck.user.role_code)
              ? authCheck.user.role_code
              : authCheck.employee?.role_code && VALID_ROLES.includes(authCheck.employee.role_code)
                ? authCheck.employee.role_code
                : savedRole && VALID_ROLES.includes(savedRole)
                  ? savedRole
                  : 'EMPLOYEE';
          effectiveInitialRole = resolvedSavedRole;
          setRoleState(resolvedSavedRole);
          if (typeof document !== 'undefined') {
            document.cookie = `hrm_role=${resolvedSavedRole}; path=/; max-age=86400; SameSite=Lax`;
            document.cookie = 'hrm_active=1; path=/; max-age=86400; SameSite=Lax';
          }
          if (
            resolvedSavedRole !== 'CANDIDATE' &&
            isStandardDemoAccountIdentity(
              resolvedSavedRole,
              savedEmail,
              parsedProfile?.employee_code ||
                authCheck.employee?.employee_code ||
                authCheck.user?.employee_code
            )
          ) {
            void syncServerHrmSession(resolvedSavedRole);
          }
        }
      } else {
        setRoleState('EMPLOYEE');
        window.localStorage.removeItem(STORAGE_ROLE_KEY);
        window.localStorage.removeItem(LEGACY_DEMO_ROLE_KEY);
        if (typeof document !== 'undefined') {
          document.cookie = 'hrm_role=; path=/; max-age=0; SameSite=Lax';
          document.cookie = 'hrm_token=; path=/; max-age=0; SameSite=Lax';
          document.cookie = 'hrm_active=; path=/; max-age=0; SameSite=Lax';
        }
      }

      const rawTheme = window.localStorage.getItem(STORAGE_THEME_KEY);
      const savedTheme: 'light' | 'dark' = rawTheme === 'dark' ? 'dark' : 'light';
      setThemeState(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      const savedNav = window.localStorage.getItem(STORAGE_NAV_KEY);
      if (savedNav) {
        setActiveNavState(resolveAllowedNav(savedNav, effectiveInitialRole));
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }

    // Initialize cross-device realtime sync (PC <-> Phone DevTunnel)
    const cleanupSync = initRuntimeSync();
    return () => {
      cleanupSync();
    };
  }, []);

  const setActiveNav = useCallback(
    (id: string) => {
      const safeNav = resolveAllowedNav(id, role);
      setActiveNavState(safeNav);
      try {
        window.localStorage.setItem(STORAGE_NAV_KEY, safeNav);
      } catch {
        // Ignore storage errors
      }
    },
    [role]
  );

  const navigateWithIntent = useCallback(
    (
      navId: string,
      intent?: {
        entityId?: string;
        subTab?: string;
        leaveDraft?: NaturalLanguageLeaveDraft;
      }
    ) => {
      const safeNav = resolveAllowedNav(navId, role);
      setActiveNavState(safeNav);
      try {
        window.localStorage.setItem(STORAGE_NAV_KEY, safeNav);
      } catch {
        // Ignore storage errors
      }
      if (safeNav !== navId.trim()) {
        setNavIntent(null);
        return;
      }
      setNavIntent({
        navId: safeNav,
        entityId: intent?.entityId,
        subTab: intent?.subTab,
        leaveDraft: intent?.leaveDraft,
        ts: Date.now(),
      });
    },
    [role]
  );

  const clearNavIntent = useCallback(() => {
    setNavIntent(null);
  }, []);

  const setRole = useCallback((nextRole: RoleCode) => {
    setRoleState(nextRole);
    setActiveNavState((prev) => resolveAllowedNav(prev, nextRole));
    if (nextRole === 'CANDIDATE') {
      try {
        window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
      } catch {
        // Ignore storage errors
      }
      void clearServerHrmSession();
      return;
    }

    const defProfile = ROLE_DEFAULT_PROFILES[nextRole];
    const nextProfile: UserProfileOverride = {
      fullName: defProfile.fullName,
      department: defProfile.department,
      employee_code: defProfile.employee_code,
      title: defProfile.title,
      email: defProfile.email,
    };
    setCurrentUserEmail(defProfile.email);
    setCurrentUserProfile(nextProfile);
    try {
      if (typeof document !== 'undefined') {
        document.cookie = `hrm_role=${nextRole}; path=/; max-age=86400; SameSite=Lax`;
        document.cookie = 'hrm_active=1; path=/; max-age=86400; SameSite=Lax';
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
        window.localStorage.setItem(STORAGE_EMAIL_KEY, defProfile.email);
        window.localStorage.setItem(
          STORAGE_PROFILE_KEY,
          JSON.stringify(nextProfile)
        );
      }
    } catch {
      // Ignore storage errors
    }
    void syncServerHrmSession(nextRole);
  }, []);

  const setAuthenticatedUser = useCallback(
    (
      nextRole: RoleCode,
      email?: string | null,
      profile?: UserProfileOverride | null,
      options?: { skipServerDemoSync?: boolean }
    ) => {
      setRoleState(nextRole);
      const normalizedEmail = email?.trim() ? email.trim() : null;
      const sanitizedProfile: UserProfileOverride | null = profile
        ? profile.department?.includes('Cổng Ứng viên')
          ? { ...profile, department: 'Ứng viên dự tuyển' }
          : profile
        : null;
      setCurrentUserEmail(normalizedEmail);
      setCurrentUserProfile(sanitizedProfile);
      setActiveNavState('dashboard');
      setNavIntent(null);

      try {
        if (typeof document !== 'undefined') {
          document.cookie = `hrm_role=${nextRole}; path=/; max-age=86400; SameSite=Lax`;
          document.cookie = 'hrm_active=1; path=/; max-age=86400; SameSite=Lax';
        }
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('lacviet_applied_candidate_email');
          window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
          window.localStorage.setItem(STORAGE_NAV_KEY, 'dashboard');
          if (normalizedEmail) {
            window.localStorage.setItem(STORAGE_EMAIL_KEY, normalizedEmail);
          } else {
            window.localStorage.removeItem(STORAGE_EMAIL_KEY);
          }
          if (sanitizedProfile && (sanitizedProfile.fullName || sanitizedProfile.department)) {
            window.localStorage.setItem(
              STORAGE_PROFILE_KEY,
              JSON.stringify(sanitizedProfile)
            );
          } else {
            window.localStorage.removeItem(STORAGE_PROFILE_KEY);
          }
        }
      } catch {
        // Ignore storage errors
      }

      if (nextRole === 'CANDIDATE') {
        void clearServerHrmSession();
      } else if (
        !options?.skipServerDemoSync &&
        isStandardDemoAccountIdentity(
          nextRole,
          normalizedEmail,
          sanitizedProfile?.employee_code
        )
      ) {
        void syncServerHrmSession(nextRole);
      }
    },
    []
  );

  const logout = useCallback(() => {
    setRoleState('EMPLOYEE');
    setCurrentUserEmail(null);
    setCurrentUserProfile(null);
    setNavIntent(null);
    setActiveNavState('dashboard');
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'hrm_role=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_token=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_active=; path=/; max-age=0; SameSite=Lax';
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_ROLE_KEY);
        window.localStorage.removeItem(LEGACY_DEMO_ROLE_KEY);
        window.localStorage.removeItem('lacviet_applied_candidate_email');
        window.localStorage.removeItem(STORAGE_EMAIL_KEY);
        window.localStorage.removeItem(STORAGE_PROFILE_KEY);
        window.localStorage.setItem(STORAGE_NAV_KEY, 'dashboard');
        window.sessionStorage?.clear();
      }
    } catch {
      // Ignore storage errors
    }
    void clearServerHrmSession();
  }, []);

  const applyTheme = useCallback((nextTheme: 'light' | 'dark') => {
    setThemeState(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    try {
      window.localStorage.setItem(STORAGE_THEME_KEY, nextTheme);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setTheme = useCallback(
    (nextTheme: 'light' | 'dark') => {
      applyTheme(nextTheme);
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
  }, [theme, applyTheme]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, description?: string, variant: ToastMessage['variant'] = 'default') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4000);
    },
    []
  );

  // Live runtime listener: auto-logout if current user is locked (is_active === false),
  // or live-upgrade role & profile if promoted (e.g. EMPLOYEE -> DEPT_MANAGER)
  useEffect(() => {
    if (!currentUserEmail) return;

    const handleRuntimeAuthSync = () => {
      if (typeof window !== 'undefined') {
        const persistedProfile = window.localStorage.getItem(STORAGE_PROFILE_KEY);
        const persistedEmail = window.localStorage.getItem(STORAGE_EMAIL_KEY);
        if ((!persistedProfile && !persistedEmail) || (currentUserProfile && !persistedProfile)) {
          logout();
          if (
            window.location.pathname.startsWith('/app') ||
            window.location.pathname.startsWith('/candidate')
          ) {
            window.location.assign('/login');
          }
          return;
        }
      }

      const lookupKey = currentUserProfile?.employee_code || currentUserEmail;
      if (!lookupKey) return;

      const check = findSystemUserForLogin(lookupKey);
      const isMissingRuntimeEmployee =
        role !== 'CANDIDATE' && !check.user && !check.employee;
      if (!check.canLogin || isMissingRuntimeEmployee) {
        logout();
        if (isMissingRuntimeEmployee) {
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
            window.location.assign('/login');
          }
          return;
        }
        if (typeof document !== 'undefined') {
          document.cookie = 'hrm_active=0; path=/; max-age=30; SameSite=Lax';
        }
        showToast(
          'Phiên làm việc đã bị khóa',
          check.blockReason || 'Tài khoản của bạn đã bị thu hồi quyền truy cập.',
          'error'
        );
        if (
          typeof window !== 'undefined' &&
          (window.location.pathname.startsWith('/app') ||
            window.location.pathname.startsWith('/candidate'))
        ) {
          window.location.assign('/login?locked=1');
        }
        return;
      }

      const nextRole = check.user?.role_code ?? check.employee?.role_code;
      const resolvedSyncedRole =
        nextRole && VALID_ROLES.includes(nextRole) ? nextRole : role;
      let shouldSyncServerSession = false;

      if (nextRole && VALID_ROLES.includes(nextRole) && nextRole !== role) {
        shouldSyncServerSession = true;
        setRoleState(nextRole);
        setActiveNavState((prev) => resolveAllowedNav(prev, nextRole));
        try {
          window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
          if (typeof document !== 'undefined') {
            document.cookie = `hrm_role=${nextRole}; path=/; max-age=86400; SameSite=Lax`;
          }
        } catch {
          // Ignore storage errors
        }
      }

      if (check.employee) {
        const emp = check.employee;
        const nextProfile: UserProfileOverride = {
          ...currentUserProfile,
          fullName: emp.full_name,
          department: emp.department_name,
          department_id: emp.department_id,
          employee_code: emp.employee_code,
          title: emp.position_name,
          email: currentUserEmail,
        };
        const changed =
          currentUserProfile?.fullName !== nextProfile.fullName ||
          currentUserProfile?.department !== nextProfile.department ||
          currentUserProfile?.department_id !== nextProfile.department_id ||
          currentUserProfile?.employee_code !== nextProfile.employee_code ||
          currentUserProfile?.title !== nextProfile.title;
        if (changed) {
          shouldSyncServerSession = true;
          setCurrentUserProfile(nextProfile);
          try {
            window.localStorage.setItem(
              STORAGE_PROFILE_KEY,
              JSON.stringify(nextProfile)
            );
          } catch {
            // Ignore storage errors
          }
        }
      }

      if (
        shouldSyncServerSession &&
        resolvedSyncedRole !== 'CANDIDATE' &&
        isStandardDemoAccountIdentity(
          resolvedSyncedRole,
          currentUserEmail,
          check.employee?.employee_code ?? currentUserProfile?.employee_code
        )
      ) {
        void syncServerHrmSession(resolvedSyncedRole);
      }
    };

    window.addEventListener(HRM_RUNTIME_EVENT, handleRuntimeAuthSync);
    window.addEventListener('storage', handleRuntimeAuthSync);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, handleRuntimeAuthSync);
      window.removeEventListener('storage', handleRuntimeAuthSync);
    };
  }, [currentUserEmail, currentUserProfile, role, logout, showToast]);

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        currentUserEmail,
        currentUserProfile,
        isAuthenticated: Boolean(currentUserEmail),
        setAuthenticatedUser,
        logout,
        theme,
        setTheme,
        toggleTheme,
        activeNav,
        setActiveNav,
        navIntent,
        navigateWithIntent,
        clearNavIntent,
        uiState,
        setUiState,
        showToast,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
