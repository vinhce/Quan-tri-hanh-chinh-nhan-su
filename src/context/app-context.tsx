'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type RoleCode = 'SUPER_ADMIN' | 'DIRECTOR' | 'HR_MANAGER' | 'DEPT_MANAGER' | 'EMPLOYEE';

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
};

export type UiState = 'ready' | 'loading' | 'empty' | 'error';

export interface UserProfileOverride {
  fullName?: string;
  department?: string;
  department_id?: string;
  employee_code?: string;
}

export interface NavIntent {
  navId: string;
  entityId?: string;
  subTab?: string;
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
  setAuthenticatedUser: (
    r: RoleCode,
    email?: string | null,
    profile?: UserProfileOverride | null
  ) => void;
  logout: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  activeNav: string;
  setActiveNav: (id: string) => void;
  navIntent: NavIntent | null;
  navigateWithIntent: (navId: string, intent?: { entityId?: string; subTab?: string }) => void;
  clearNavIntent: () => void;
  uiState: UiState;
  setUiState: (s: UiState) => void;
  showToast: (title: string, description?: string, variant?: ToastMessage['variant']) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

const STORAGE_ROLE_KEY = 'lacviet_hrm_role';
const STORAGE_EMAIL_KEY = 'lacviet_hrm_email';
const STORAGE_PROFILE_KEY = 'lacviet_hrm_profile';
const STORAGE_THEME_KEY = 'hrm_theme';
const STORAGE_NAV_KEY = 'hrm_active_nav';
const VALID_ROLES: RoleCode[] = ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'];

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<RoleCode>('HR_MANAGER');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfileOverride | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark');
  const [activeNav, setActiveNavState] = useState<string>('dashboard');
  const [navIntent, setNavIntent] = useState<NavIntent | null>(null);
  const [uiState, setUiState] = useState<UiState>('ready');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    try {
      const savedRole = window.localStorage.getItem(STORAGE_ROLE_KEY) as RoleCode | null;
      if (savedRole && VALID_ROLES.includes(savedRole)) {
        setRoleState(savedRole);
      }
      const savedEmail = window.localStorage.getItem(STORAGE_EMAIL_KEY);
      if (savedEmail) {
        setCurrentUserEmail(savedEmail);
      }
      const savedProfile = window.localStorage.getItem(STORAGE_PROFILE_KEY);
      if (savedProfile) {
        setCurrentUserProfile(JSON.parse(savedProfile) as UserProfileOverride);
      }
      const rawTheme = window.localStorage.getItem(STORAGE_THEME_KEY);
      const savedTheme: 'light' | 'dark' = rawTheme === 'light' ? 'light' : 'dark';
      setThemeState(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      const savedNav = window.localStorage.getItem(STORAGE_NAV_KEY);
      if (savedNav) {
        setActiveNavState(savedNav);
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }, []);

  const setActiveNav = useCallback((id: string) => {
    setActiveNavState(id);
    try {
      window.localStorage.setItem(STORAGE_NAV_KEY, id);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const navigateWithIntent = useCallback(
    (navId: string, intent?: { entityId?: string; subTab?: string }) => {
      setActiveNav(navId);
      setNavIntent({
        navId,
        entityId: intent?.entityId,
        subTab: intent?.subTab,
        ts: Date.now(),
      });
    },
    [setActiveNav]
  );

  const clearNavIntent = useCallback(() => {
    setNavIntent(null);
  }, []);

  const setRole = useCallback((nextRole: RoleCode) => {
    setRoleState(nextRole);
    try {
      window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setAuthenticatedUser = useCallback(
    (
      nextRole: RoleCode,
      email?: string | null,
      profile?: UserProfileOverride | null
    ) => {
      setRoleState(nextRole);
      const normalizedEmail = email?.trim() ? email.trim() : null;
      setCurrentUserEmail(normalizedEmail);
      setCurrentUserProfile(profile ?? null);
      setActiveNavState('dashboard');
      setNavIntent(null);

      try {
        window.localStorage.setItem(STORAGE_ROLE_KEY, nextRole);
        window.localStorage.setItem(STORAGE_NAV_KEY, 'dashboard');
        if (normalizedEmail) {
          window.localStorage.setItem(STORAGE_EMAIL_KEY, normalizedEmail);
        } else {
          window.localStorage.removeItem(STORAGE_EMAIL_KEY);
        }
        if (profile && (profile.fullName || profile.department)) {
          window.localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
        } else {
          window.localStorage.removeItem(STORAGE_PROFILE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
    },
    []
  );

  const logout = useCallback(() => {
    setCurrentUserEmail(null);
    setCurrentUserProfile(null);
    setNavIntent(null);
    setActiveNav('dashboard');
    try {
      window.localStorage.removeItem(STORAGE_EMAIL_KEY);
      window.localStorage.removeItem(STORAGE_PROFILE_KEY);
      window.localStorage.setItem(STORAGE_NAV_KEY, 'dashboard');
    } catch {
      // Ignore storage errors
    }
  }, [setActiveNav]);

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

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        currentUserEmail,
        currentUserProfile,
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
