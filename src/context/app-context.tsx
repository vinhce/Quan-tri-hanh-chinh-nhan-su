'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type RoleCode = 'SUPER_ADMIN' | 'HR_MANAGER' | 'DEPT_MANAGER' | 'EMPLOYEE';

export type UiState = 'ready' | 'loading' | 'empty' | 'error';

export interface UserProfileOverride {
  fullName?: string;
  department?: string;
  employee_code?: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
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
  uiState: UiState;
  setUiState: (s: UiState) => void;
  showToast: (title: string, description?: string, variant?: ToastMessage['variant']) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
}

const STORAGE_ROLE_KEY = 'lacviet_hrm_role';
const STORAGE_EMAIL_KEY = 'lacviet_hrm_email';
const STORAGE_PROFILE_KEY = 'lacviet_hrm_profile';
const STORAGE_THEME_KEY = 'hrm_theme';
const STORAGE_NAV_KEY = 'hrm_active_nav';
const VALID_ROLES: RoleCode[] = ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'];

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<RoleCode>('HR_MANAGER');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfileOverride | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark');
  const [activeNav, setActiveNavState] = useState<string>('dashboard');
  const [uiState, setUiState] = useState<UiState>('ready');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);

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
    setActiveNav('dashboard');
    setIsCopilotOpen(false);
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
        uiState,
        setUiState,
        showToast,
        toasts,
        dismissToast,
        isCopilotOpen,
        setIsCopilotOpen,
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
