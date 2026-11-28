import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { RouterStateStore } from '@/lib/hrm/copilot-router';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreDiskSig: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmCopilotRouterStore: RouterStateStore | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');
const MAX_SYNC_BODY_BYTES = 5 * 1024 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SERVER_ONLY_KEYS = new Set(['hrm_runtime_face_profiles_v1']);
const BIOMETRIC_PRESERVE_IF_MISSING_KEYS = [
  'hrm_runtime_biometric_creds_v1',
  'hrm_runtime_wifi_policy_v1',
] as const;
const ALLOWED_SYNC_KEY_REGEX = /^hrm_(?:runtime_[a-z0-9_]+|sync_integration_check)$/;

function isAllowedSyncKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  if (key.length > 80 || FORBIDDEN_KEYS.has(key)) return false;
  return ALLOWED_SYNC_KEY_REGEX.test(key);
}

function sanitizePlainRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    if (!FORBIDDEN_KEYS.has(k)) {
      safe[k] = v;
    }
  }
  return safe;
}

function createNullProtoStore(source?: unknown): Record<string, unknown> {
  const target: Record<string, unknown> = Object.create(null);
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
      if (!isAllowedSyncKey(k)) continue;
      if (Array.isArray(v)) {
        target[k] = v;
      } else if (
        k === 'hrm_sync_integration_check' &&
        v &&
        typeof v === 'object' &&
        !Array.isArray(v)
      ) {
        target[k] = sanitizePlainRecord(v as Record<string, unknown>);
      }
    }
  }
  return target;
}

function createBootEpoch(): string {
  return `boot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getDiskSignature(): string {
  try {
    const stat = fs.statSync(DATA_FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'MISSING';
  }
}

function clearCopilotRouterStoreIfPresent(): void {
  if (globalThis._hrmCopilotRouterStore) {
    const maybeClearable = globalThis._hrmCopilotRouterStore as RouterStateStore & {
      clear?: () => void;
    };
    if (typeof maybeClearable.clear === 'function') {
      maybeClearable.clear();
    }
    globalThis._hrmCopilotRouterStore = undefined;
  }
}

function getStore(): Record<string, unknown> {
  const diskSig = getDiskSignature();
  if (globalThis._hrmSyncStore && globalThis._hrmSyncStoreDiskSig === diskSig) {
    if (!globalThis._hrmBootEpoch) {
      globalThis._hrmBootEpoch = createBootEpoch();
    }
    return globalThis._hrmSyncStore;
  }
  if (diskSig !== 'MISSING') {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rawEpoch = (parsed as Record<string, unknown>)._bootEpoch;
        const parsedBootEpoch =
          typeof rawEpoch === 'string' && rawEpoch.trim().length > 0
            ? rawEpoch.trim()
            : undefined;
        if (parsedBootEpoch) {
          if (parsedBootEpoch !== globalThis._hrmSyncStoreBootEpoch) {
            globalThis._hrmSyncStoreBootEpoch = parsedBootEpoch;
            clearCopilotRouterStoreIfPresent();
          }
          globalThis._hrmBootEpoch = parsedBootEpoch;
        } else if (!globalThis._hrmBootEpoch) {
          globalThis._hrmBootEpoch = createBootEpoch();
          globalThis._hrmSyncStoreBootEpoch = globalThis._hrmBootEpoch;
        }
        globalThis._hrmSyncStore = createNullProtoStore(parsed);
        globalThis._hrmSyncStoreDiskSig = diskSig;
        return globalThis._hrmSyncStore;
      }
    } catch {
      // fallback
    }
  }
  if (globalThis._hrmSyncStoreBootEpoch !== undefined) {
    globalThis._hrmSyncStoreBootEpoch = undefined;
    clearCopilotRouterStoreIfPresent();
  }
  globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
  if (diskSig === 'MISSING') {
    globalThis._hrmSyncStoreDiskSig = diskSig;
  }
  if (!globalThis._hrmBootEpoch) {
    globalThis._hrmBootEpoch = createBootEpoch();
  }
  return globalThis._hrmSyncStore;
}

function getBootEpoch(): string {
  if (!globalThis._hrmBootEpoch) {
    getStore();
  }
  if (!globalThis._hrmBootEpoch) {
    globalThis._hrmBootEpoch = createBootEpoch();
  }
  return globalThis._hrmBootEpoch;
}

function readDiskBiometricPreserveSnapshot(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const ramStore = globalThis._hrmSyncStore || {};
    const diskSnapshot = readDiskBiometricPreserveSnapshot();
    const payload: Record<string, unknown> = {
      _bootEpoch: getBootEpoch(),
      ...ramStore,
    };

    if (diskSnapshot) {
      for (const serverKey of Array.from(SERVER_ONLY_KEYS)) {
        if (Array.isArray(diskSnapshot[serverKey])) {
          payload[serverKey] = diskSnapshot[serverKey];
          if (globalThis._hrmSyncStore) {
            globalThis._hrmSyncStore[serverKey] = diskSnapshot[serverKey];
          }
        }
      }
      for (const preserveKey of BIOMETRIC_PRESERVE_IF_MISSING_KEYS) {
        const ramVal = payload[preserveKey];
        const ramMissingOrEmpty = !Array.isArray(ramVal) || ramVal.length === 0;
        if (
          ramMissingOrEmpty &&
          Array.isArray(diskSnapshot[preserveKey]) &&
          (diskSnapshot[preserveKey] as unknown[]).length > 0
        ) {
          payload[preserveKey] = diskSnapshot[preserveKey];
          if (globalThis._hrmSyncStore) {
            globalThis._hrmSyncStore[preserveKey] = diskSnapshot[preserveKey];
          }
        }
      }
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    globalThis._hrmSyncStoreBootEpoch =
      typeof payload._bootEpoch === 'string'
        ? payload._bootEpoch
        : globalThis._hrmSyncStoreBootEpoch;
    globalThis._hrmSyncStoreDiskSig = getDiskSignature();
  } catch {
    // ignore file write errors in restricted environments
  }
}

const CANDIDATE_STAGE_RANK: Record<string, number> = {
  APPLIED: 1,
  AI_SCREENED: 2,
  INTERVIEW: 3,
  OFFER: 4,
  ONBOARDED: 5,
};

function getSyncItemIdentity(item: Record<string, unknown>, key: string): string {
  if (typeof item.id === 'string' && item.id.trim()) return `id:${item.id.trim()}`;
  if (key === 'hrm_runtime_preboarding_v1' && typeof item.token === 'string' && item.token.trim()) {
    return `token:${item.token.trim()}`;
  }
  if (typeof item.token === 'string' && item.token.trim()) return `token:${item.token.trim()}`;
  if (typeof item.candidate_code === 'string' && item.candidate_code.trim()) {
    return `cand:${item.candidate_code.trim()}`;
  }
  if (typeof item.employee_code === 'string' && item.employee_code.trim()) {
    return `emp:${item.employee_code.trim()}`;
  }
  return '';
}

function mergeCandidateRecord(
  existingItem: Record<string, unknown>,
  incomingItem: Record<string, unknown>,
  forceStageRollback = false
): Record<string, unknown> {
  const safeExisting = sanitizePlainRecord(existingItem);
  const safeIncoming = sanitizePlainRecord(incomingItem);
  const merged: Record<string, unknown> = Object.assign(
    Object.create(null) as Record<string, unknown>,
    safeExisting,
    safeIncoming
  );

  const existingStage = typeof safeExisting.stage === 'string' ? safeExisting.stage : '';
  const incomingStage = typeof safeIncoming.stage === 'string' ? safeIncoming.stage : '';
  const allowRollback = Boolean(forceStageRollback || safeIncoming.forceStageRollback);

  if (
    !allowRollback &&
    incomingStage !== 'REJECTED' &&
    existingStage !== 'REJECTED'
  ) {
    const existingRank = CANDIDATE_STAGE_RANK[existingStage] ?? 0;
    const incomingRank = CANDIDATE_STAGE_RANK[incomingStage] ?? 0;
    if (existingRank > incomingRank) {
      merged.stage = existingStage;
      if (safeExisting.interview_schedule && !safeIncoming.interview_schedule) {
        merged.interview_schedule = safeExisting.interview_schedule;
      }
    }
  }

  if (
    safeExisting.offered_salary_vnd !== undefined &&
    (safeIncoming.offered_salary_vnd === undefined ||
      safeIncoming.offered_salary_vnd === null)
  ) {
    merged.offered_salary_vnd = safeExisting.offered_salary_vnd;
  }

  if (safeExisting.preboarding_token && !safeIncoming.preboarding_token) {
    merged.preboarding_token = safeExisting.preboarding_token;
  }

  return merged;
}

function mergeArrayById(
  existing: unknown[],
  incoming: unknown[],
  key: string,
  forceStageRollback = false,
  allowReset = false
): unknown[] {
  if (incoming.length === 0) {
    return allowReset ? [] : existing;
  }

  const existingMap = new Map<string, Record<string, unknown>>();
  for (const raw of existing) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = sanitizePlainRecord(raw as Record<string, unknown>);
      const identity = getSyncItemIdentity(obj, key);
      if (identity) {
        existingMap.set(identity, obj);
      }
    }
  }

  const seenIdentities = new Set<string>();
  const result: unknown[] = [];

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const incomingObj = sanitizePlainRecord(raw as Record<string, unknown>);
    const identity = getSyncItemIdentity(incomingObj, key);
    if (!identity) {
      result.push(incomingObj);
      continue;
    }
    seenIdentities.add(identity);
    const prevObj = existingMap.get(identity);
    if (!prevObj) {
      result.push(incomingObj);
      continue;
    }
    if (key === 'hrm_runtime_candidates_v1') {
      result.push(mergeCandidateRecord(prevObj, incomingObj, forceStageRollback));
    } else {
      result.push(
        Object.assign(Object.create(null) as Record<string, unknown>, prevObj, incomingObj)
      );
    }
  }

  for (const raw of existing) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const prevObj = sanitizePlainRecord(raw as Record<string, unknown>);
    const identity = getSyncItemIdentity(prevObj, key);
    if (identity && !seenIdentities.has(identity)) {
      seenIdentities.add(identity);
      result.push(prevObj);
    }
  }

  return result;
}

export async function GET() {
  const stores = getStore();
  const safeStores: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(stores)) {
    if (!SERVER_ONLY_KEYS.has(k)) {
      safeStores[k] = v;
    }
  }
  return NextResponse.json({
    ok: true,
    success: true,
    bootEpoch: getBootEpoch(),
    stores: safeStores,
  });
}

export async function POST(req: Request) {
  try {
    const contentLengthHeader = Number(req.headers.get('content-length') || '0');
    if (Number.isFinite(contentLengthHeader) && contentLengthHeader > MAX_SYNC_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, success: false, error: 'Payload quá lớn' },
        { status: 413 }
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_SYNC_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, success: false, error: 'Payload quá lớn' },
        { status: 413 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, success: false, error: 'Lỗi đồng bộ dữ liệu nội bộ' },
        { status: 400 }
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { ok: false, success: false, error: 'Lỗi đồng bộ dữ liệu nội bộ' },
        { status: 400 }
      );
    }

    const body = parsed as Record<string, unknown>;
    const { key, items, fullSync, forceStageRollback, resetStore } = body;
    const allowRollback = Boolean(forceStageRollback);
    const allowReset = body.resetStore === true || resetStore === true;
    const store = getStore();

    if (allowReset) {
      const preservedServerData: Record<string, unknown> = Object.create(null);
      const diskSnapshot = readDiskBiometricPreserveSnapshot();
      for (const serverKey of Array.from(SERVER_ONLY_KEYS)) {
        if (diskSnapshot && Array.isArray(diskSnapshot[serverKey])) {
          preservedServerData[serverKey] = diskSnapshot[serverKey];
        } else if (Array.isArray(store[serverKey])) {
          preservedServerData[serverKey] = store[serverKey];
        }
      }

      globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
      if (fullSync && typeof fullSync === 'object' && !Array.isArray(fullSync)) {
        for (const [syncKey, syncVal] of Object.entries(fullSync as Record<string, unknown>)) {
          if (
            SERVER_ONLY_KEYS.has(syncKey) ||
            !isAllowedSyncKey(syncKey) ||
            !Array.isArray(syncVal)
          ) {
            continue;
          }
          globalThis._hrmSyncStore[syncKey] = mergeArrayById(
            [],
            syncVal,
            syncKey,
            allowRollback,
            true
          );
        }
      }
      for (const [serverKey, serverVal] of Object.entries(preservedServerData)) {
        globalThis._hrmSyncStore[serverKey] = serverVal;
      }
      globalThis._hrmBootEpoch = createBootEpoch();
      globalThis._hrmSyncStoreBootEpoch = globalThis._hrmBootEpoch;
      clearCopilotRouterStoreIfPresent();
      persistStore();
      return NextResponse.json({ ok: true, success: true, bootEpoch: getBootEpoch() });
    }

    if (fullSync && typeof fullSync === 'object' && !Array.isArray(fullSync)) {
      for (const [syncKey, syncVal] of Object.entries(fullSync as Record<string, unknown>)) {
        if (
          SERVER_ONLY_KEYS.has(syncKey) ||
          !isAllowedSyncKey(syncKey) ||
          !Array.isArray(syncVal)
        ) {
          continue;
        }
        const prevArr = Array.isArray(store[syncKey]) ? (store[syncKey] as unknown[]) : [];
        store[syncKey] = mergeArrayById(prevArr, syncVal, syncKey, allowRollback, allowReset);
      }
    } else if (typeof key === 'string' && SERVER_ONLY_KEYS.has(key)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: 'FORBIDDEN_SYNC_KEY',
          error: 'Không được phép ghi đè khóa dữ liệu sinh trắc học máy chủ qua /api/hrm/sync.',
        },
        { status: 403 }
      );
    } else if (isAllowedSyncKey(key) && Array.isArray(items)) {
      const prevArr = Array.isArray(store[key]) ? (store[key] as unknown[]) : [];
      store[key] = mergeArrayById(prevArr, items, key, allowRollback, allowReset);
    } else if (
      key === 'hrm_sync_integration_check' &&
      items &&
      typeof items === 'object' &&
      !Array.isArray(items)
    ) {
      store[key] = sanitizePlainRecord(items as Record<string, unknown>);
    } else {
      return NextResponse.json(
        { ok: false, success: false, error: 'Lỗi đồng bộ dữ liệu nội bộ' },
        { status: 400 }
      );
    }

    persistStore();
    return NextResponse.json({ ok: true, success: true, bootEpoch: getBootEpoch() });
  } catch {
    return NextResponse.json(
      { ok: false, success: false, error: 'Lỗi đồng bộ dữ liệu nội bộ' },
      { status: 500 }
    );
  }
}
