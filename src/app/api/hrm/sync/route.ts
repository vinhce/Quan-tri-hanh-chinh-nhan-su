import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');
const MAX_SYNC_BODY_BYTES = 5 * 1024 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
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

function getStore(): Record<string, unknown> {
  if (globalThis._hrmSyncStore && Object.keys(globalThis._hrmSyncStore).length > 0) {
    if (!globalThis._hrmBootEpoch) {
      globalThis._hrmBootEpoch = createBootEpoch();
    }
    return globalThis._hrmSyncStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rawEpoch = (parsed as Record<string, unknown>)._bootEpoch;
        if (typeof rawEpoch === 'string' && rawEpoch.trim().length > 0) {
          globalThis._hrmBootEpoch = rawEpoch.trim();
        }
      }
      globalThis._hrmSyncStore = createNullProtoStore(parsed);
      if (!globalThis._hrmBootEpoch) {
        globalThis._hrmBootEpoch = createBootEpoch();
      }
      return globalThis._hrmSyncStore;
    }
  } catch {
    // fallback
  }
  if (!globalThis._hrmSyncStore) {
    globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
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

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = {
      _bootEpoch: getBootEpoch(),
      ...(globalThis._hrmSyncStore || {}),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
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
  return NextResponse.json({ ok: true, success: true, bootEpoch: getBootEpoch(), stores });
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
      globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
      if (fullSync && typeof fullSync === 'object' && !Array.isArray(fullSync)) {
        for (const [syncKey, syncVal] of Object.entries(fullSync as Record<string, unknown>)) {
          if (!isAllowedSyncKey(syncKey) || !Array.isArray(syncVal)) {
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
      globalThis._hrmBootEpoch = createBootEpoch();
      persistStore();
      return NextResponse.json({ ok: true, success: true, bootEpoch: getBootEpoch() });
    }

    if (fullSync && typeof fullSync === 'object' && !Array.isArray(fullSync)) {
      for (const [syncKey, syncVal] of Object.entries(fullSync as Record<string, unknown>)) {
        if (!isAllowedSyncKey(syncKey) || !Array.isArray(syncVal)) {
          continue;
        }
        const prevArr = Array.isArray(store[syncKey]) ? (store[syncKey] as unknown[]) : [];
        store[syncKey] = mergeArrayById(prevArr, syncVal, syncKey, allowRollback, allowReset);
      }
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
