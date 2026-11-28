import {
  MOCK_SYSTEM_USERS,
} from '@/mock/admin';
import {
  MOCK_EMPLOYEES,
} from '@/mock/employees';
import type {
  BiometricCredentialRecord,
  WifiAttendancePolicy,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  ALL_RUNTIME_SYNC_KEYS,
  HRM_RUNTIME_EVENT,
  STORAGE_BIOMETRIC_CREDS_KEY,
  STORAGE_BOOT_EPOCH_KEY,
  STORAGE_WIFI_POLICY_KEY,
  emitRuntimeUpdated,
  lastLocalWriteAt,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Biometric Fingerprint Credentials & Same-WiFi Policy Stores
// ---------------------------------------------------------------------------
export const DEFAULT_WIFI_ATTENDANCE_POLICY: WifiAttendancePolicy = {
  id: 'wifi-policy-default',
  wifi_ssid_label: 'WiFi Nội bộ (Cùng mạng Máy chủ)',
  enforce_same_wifi: true,
  require_biometric_for_punch: true,
  allowed_public_ips: [],
  allowed_lan_cidrs: [],
  updated_by: 'Hệ thống HRM',
  updated_at: '2026-11-22T00:00:00Z',
};

export function getBiometricCredentials(
  employeeIdOrCode?: string,
  rpId?: string
): BiometricCredentialRecord[] {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  return all.filter((item) => {
    if (
      employeeIdOrCode &&
      item.employee_id !== employeeIdOrCode &&
      item.employee_code !== employeeIdOrCode
    ) {
      return false;
    }
    if (rpId && item.rp_id !== rpId) {
      return false;
    }
    return true;
  });
}

export function saveBiometricCredential(
  cred: BiometricCredentialRecord
): BiometricCredentialRecord {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  const idx = all.findIndex(
    (item) => item.id === cred.id || item.credential_id === cred.credential_id
  );
  const next =
    idx >= 0 ? all.map((item, i) => (i === idx ? cred : item)) : [cred, ...all];
  writeStorageArray(STORAGE_BIOMETRIC_CREDS_KEY, next);
  return cred;
}

export function removeBiometricCredential(
  idOrCredId: string,
  actorName = 'Nhân sự'
): void {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  const target = all.find(
    (item) => item.id === idOrCredId || item.credential_id === idOrCredId
  );
  if (!target) return;
  const next = all.filter(
    (item) => item.id !== idOrCredId && item.credential_id !== idOrCredId
  );
  writeStorageArray(STORAGE_BIOMETRIC_CREDS_KEY, next);
  recordAuditLog({
    actor_name: actorName,
    actor_code: target.employee_code,
    actor_role: 'EMPLOYEE',
    action: 'BIOMETRIC_REGISTER',
    target: `${target.employee_code} · ${target.device_label}`,
    detail: `Đã gỡ thiết bị vân tay "${target.device_label}" (${target.device_kind} · domain ${target.rp_id}).`,
  });
}

export function getWifiAttendancePolicy(): WifiAttendancePolicy {
  const stored = readStorageArray<WifiAttendancePolicy>(STORAGE_WIFI_POLICY_KEY);
  const first = stored?.[0];
  if (!first) {
    return {
      ...DEFAULT_WIFI_ATTENDANCE_POLICY,
      allowed_public_ips: [],
      allowed_lan_cidrs: [],
    };
  }
  return {
    ...DEFAULT_WIFI_ATTENDANCE_POLICY,
    ...first,
    allowed_public_ips: Array.isArray(first.allowed_public_ips)
      ? first.allowed_public_ips
      : [],
    allowed_lan_cidrs: Array.isArray(first.allowed_lan_cidrs)
      ? first.allowed_lan_cidrs
      : [],
  };
}

export function saveWifiAttendancePolicy(
  patch: Partial<WifiAttendancePolicy>,
  actorName = 'Quản trị hệ thống'
): WifiAttendancePolicy {
  const current = getWifiAttendancePolicy();
  const next: WifiAttendancePolicy = {
    ...current,
    ...patch,
    id: 'wifi-policy-default',
    allowed_public_ips: Array.isArray(patch.allowed_public_ips)
      ? patch.allowed_public_ips
      : current.allowed_public_ips,
    allowed_lan_cidrs: Array.isArray(patch.allowed_lan_cidrs)
      ? patch.allowed_lan_cidrs
      : current.allowed_lan_cidrs,
    updated_by: actorName,
    updated_at: new Date().toISOString(),
  };
  writeStorageArray(STORAGE_WIFI_POLICY_KEY, [next]);
  recordAuditLog({
    actor_name: actorName,
    actor_code: 'SYS-WIFI',
    actor_role: 'SUPER_ADMIN',
    action: 'UPDATE_PERMISSION',
    module: 'Chấm công & Ca làm',
    target: `Chính sách WiFi (${next.wifi_ssid_label})`,
    detail: `Cập nhật chính sách chấm công: Bắt buộc chung WiFi=${next.enforce_same_wifi ? 'BẬT' : 'TẮT'}, Bắt buộc vân tay=${next.require_biometric_for_punch ? 'BẬT' : 'TẮT'}, Public IP=${next.allowed_public_ips.join(', ') || 'Tự động khớp máy chủ'}.`,
  });
  return next;
}

function clearStaleRuntimeAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const savedRole = (window.localStorage.getItem('lacviet_hrm_role') || '').trim();
    const savedProfileRaw = window.localStorage.getItem('lacviet_hrm_profile');
    const savedEmail = (window.localStorage.getItem('lacviet_hrm_email') || '')
      .trim()
      .toLowerCase();
    const appliedCandidateEmail = window.localStorage.getItem('lacviet_applied_candidate_email');

    if (!savedRole && !savedProfileRaw && !savedEmail && !appliedCandidateEmail) {
      return;
    }

    let parsedProfile: { employee_code?: string; email?: string } | null = null;
    if (savedProfileRaw) {
      try {
        parsedProfile = JSON.parse(savedProfileRaw) as {
          employee_code?: string;
          email?: string;
        };
      } catch {
        parsedProfile = null;
      }
    }

    const empCode = (parsedProfile?.employee_code || '').trim().toUpperCase();
    const profileEmail = (parsedProfile?.email || savedEmail).trim().toLowerCase();

    const matchedMockEmp =
      empCode.length > 0 && profileEmail.length > 0
        ? MOCK_EMPLOYEES.find(
            (e) =>
              e.employee_code.trim().toUpperCase() === empCode &&
              e.email.trim().toLowerCase() === profileEmail &&
              e.employment_status === 'ACTIVE'
          )
        : undefined;

    const matchedMockUser =
      empCode.length > 0 && profileEmail.length > 0
        ? MOCK_SYSTEM_USERS.find(
            (u) =>
              u.employee_code.trim().toUpperCase() === empCode &&
              u.email.trim().toLowerCase() === profileEmail &&
              u.account_status === 'ACTIVE'
          )
        : undefined;

    const isLockedMockUser =
      (empCode.length > 0 || profileEmail.length > 0) &&
      MOCK_SYSTEM_USERS.some(
        (u) =>
          (empCode.length > 0 && u.employee_code.trim().toUpperCase() === empCode) ||
          (profileEmail.length > 0 && u.email.trim().toLowerCase() === profileEmail)
      ) &&
      !matchedMockUser;

    const isValidActiveMockSession =
      savedRole !== 'CANDIDATE' &&
      !isLockedMockUser &&
      Boolean(matchedMockEmp || matchedMockUser);

    if (!isValidActiveMockSession) {
      window.localStorage.removeItem('lacviet_hrm_role');
      window.localStorage.removeItem('lacviet_hrm_email');
      window.localStorage.removeItem('lacviet_hrm_profile');
      window.localStorage.removeItem('lacviet_applied_candidate_email');
      if (typeof document !== 'undefined') {
        document.cookie = 'hrm_role=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_token=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_active=; path=/; max-age=0; SameSite=Lax';
      }
    }
  } catch {
    // Ignore storage or cookie errors
  }
}

export function resetAllDemoRuntimeData(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const keysToRemove = [...ALL_RUNTIME_SYNC_KEYS, 'hrm_audit_logs_v1'];
    for (const key of keysToRemove) {
      lastLocalWriteAt[key] = now;
      window.localStorage.removeItem(key);
    }
    clearStaleRuntimeAuthSession();
    if (typeof fetch === 'function') {
      const resetPayload: Record<string, unknown[]> = Object.create(null);
      for (const key of ALL_RUNTIME_SYNC_KEYS) {
        if (/^hrm_runtime_[a-z0-9_]+$/.test(key)) {
          resetPayload[key] = [];
        }
      }
      fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: resetPayload, resetStore: true }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.bootEpoch === 'string' && data.bootEpoch.length > 0) {
            try {
              window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
            } catch {
              // Ignore storage errors
            }
          }
        })
        .catch(() => {});
    }
    window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
    window.dispatchEvent(new CustomEvent('hrm-audit-updated'));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Multi-Device Cross-Device Realtime Sync (PC <-> DevTunnels Mobile)
// ---------------------------------------------------------------------------
function extractSyncIdentity(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const obj = item as Record<string, unknown>;
  if (typeof obj.id === 'string' && obj.id.trim()) return `id:${obj.id.trim()}`;
  if (typeof obj.token === 'string' && obj.token.trim()) return `token:${obj.token.trim()}`;
  if (typeof obj.candidate_code === 'string' && obj.candidate_code.trim()) {
    return `cand:${obj.candidate_code.trim()}`;
  }
  if (typeof obj.employee_code === 'string' && obj.employee_code.trim()) {
    return `emp:${obj.employee_code.trim()}`;
  }
  return '';
}

function mergeServerWithUnsyncedLocal(
  serverItems: unknown[],
  localItems: unknown[] | null
): unknown[] {
  if (!localItems || localItems.length === 0) return serverItems;
  if (serverItems.length === 0) return localItems;

  const serverIdentities = new Set<string>();
  for (const item of serverItems) {
    const identity = extractSyncIdentity(item);
    if (identity) serverIdentities.add(identity);
  }

  const unsyncedLocal: unknown[] = [];
  for (const localItem of localItems) {
    const identity = extractSyncIdentity(localItem);
    if (identity && !serverIdentities.has(identity)) {
      serverIdentities.add(identity);
      unsyncedLocal.push(localItem);
    }
  }

  return unsyncedLocal.length > 0 ? [...unsyncedLocal, ...serverItems] : serverItems;
}

export function initRuntimeSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const ALL_SYNC_KEYS = ALL_RUNTIME_SYNC_KEYS;

  const doSync = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/hrm/sync');
      if (!res.ok) return false;
      const data = await res.json();
      const serverStores =
        data?.stores && typeof data.stores === 'object'
          ? (data.stores as Record<string, unknown>)
          : null;

      if (typeof data?.bootEpoch === 'string' && data.bootEpoch.length > 0) {
        const storedEpoch = window.localStorage.getItem(STORAGE_BOOT_EPOCH_KEY);
        if (storedEpoch !== data.bootEpoch) {
          const serverHasNonEmptyData =
            Boolean(serverStores) &&
            Object.values(serverStores as Record<string, unknown>).some(
              (v) => Array.isArray(v) && v.length > 0
            );
          const hasRecentLocalWrite = Object.values(lastLocalWriteAt).some(
            (ts) => Date.now() - ts < 5 * 60 * 1000
          );
          const shouldResetClientStore =
            Boolean(storedEpoch) || (!serverHasNonEmptyData && !hasRecentLocalWrite);

          if (!shouldResetClientStore) {
            window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
          } else {
            const keysToRemove = [...ALL_RUNTIME_SYNC_KEYS, 'hrm_audit_logs_v1'];
            for (const key of keysToRemove) {
              window.localStorage.removeItem(key);
            }
            for (const k of Object.keys(lastLocalWriteAt)) {
              delete lastLocalWriteAt[k];
            }
            clearStaleRuntimeAuthSession();
            window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
            if (serverStores) {
              for (const [key, items] of Object.entries(serverStores)) {
                if (Array.isArray(items) && items.length > 0) {
                  window.localStorage.setItem(key, JSON.stringify(items));
                }
              }
            }
            emitRuntimeUpdated();
            window.dispatchEvent(new CustomEvent('hrm-audit-updated'));
            return true;
          }
        }
      }

      if (serverStores) {
        let changed = false;
        for (const [key, items] of Object.entries(serverStores)) {
          if (Date.now() - (lastLocalWriteAt[key] || 0) < 4000) {
            continue;
          }
          if (items && Array.isArray(items)) {
            const localItems = readStorageArray<unknown>(key);
            const mergedItems = mergeServerWithUnsyncedLocal(items, localItems);
            const currentStr = window.localStorage.getItem(key);
            const newStr = JSON.stringify(mergedItems);
            if (currentStr !== newStr) {
              window.localStorage.setItem(key, newStr);
              changed = true;
            }
          }
        }
        if (changed) {
          emitRuntimeUpdated();
        }
      }
      return false;
    } catch {
      // Ignore network errors
      return false;
    }
  };

  // 1. Helper: push local items to server only when bootEpoch matches
  const pushIfServerEmpty = async () => {
    try {
      const res = await fetch('/api/hrm/sync');
      if (!res.ok) return;
      const data = await res.json();
      if (
        typeof data?.bootEpoch === 'string' &&
        data.bootEpoch.length > 0 &&
        !window.localStorage.getItem(STORAGE_BOOT_EPOCH_KEY)
      ) {
        window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
      }
      const serverStores = data?.stores || {};
      const pushPayload: Record<string, unknown> = {};
      for (const k of ALL_SYNC_KEYS) {
        if (!serverStores[k] || (Array.isArray(serverStores[k]) && serverStores[k].length === 0)) {
          const localVal = readStorageArray(k);
          if (localVal && localVal.length > 0) {
            pushPayload[k] = localVal;
          }
        }
      }
      if (Object.keys(pushPayload).length > 0) {
        fetch('/api/hrm/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: pushPayload }),
        })
          .then((postRes) => (postRes.ok ? postRes.json() : null))
          .then((postData) => {
            if (
              postData &&
              typeof postData.bootEpoch === 'string' &&
              postData.bootEpoch.length > 0
            ) {
              try {
                window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, postData.bootEpoch);
              } catch {
                // Ignore storage errors
              }
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore errors
    }
  };

  // 2. Initial pull sequentially before deciding whether to push local store
  void doSync().then((epochChanged) => {
    if (!epochChanged) {
      void pushIfServerEmpty();
    }
  });

  // 3. Periodic polling every 3s + sync on focus/visibilitychange
  const timer = setInterval(doSync, 3000);
  const handleFocus = () => doSync();
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleFocus);

  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleFocus);
  };
}
