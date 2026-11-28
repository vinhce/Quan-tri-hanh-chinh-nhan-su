import {
  MOCK_ONBOARDING_RECORDS,
} from '@/mock/onboarding';
import type {
  OnboardingRecord,
  PreboardingInvite,
} from '@/mock/types';
import {
  STORAGE_ONBOARDING_KEY,
  STORAGE_PREBOARDING_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Onboarding Records
// ---------------------------------------------------------------------------
export function getOnboardingRecords(): OnboardingRecord[] {
  const stored = readStorageArray<OnboardingRecord>(STORAGE_ONBOARDING_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_ONBOARDING_RECORDS);
}

export function saveOnboardingRecord(record: OnboardingRecord): void {
  const current = getOnboardingRecords();
  const idx = current.findIndex((item) => item.id === record.id);
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? record : item))
      : [record, ...current];
  writeStorageArray(STORAGE_ONBOARDING_KEY, updated);
}

export function generateNextOnboardingId(existingRecords: OnboardingRecord[]): string {
  let maxSeq = 3;
  for (const rec of existingRecords) {
    const match = /^ONB-\d{4}-(\d+)$/i.exec(rec.id.trim());
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  return `ONB-2026-${String(maxSeq + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Stage 1C: Pre-boarding Invite Store & Department Task Auto Side-Effects
// ---------------------------------------------------------------------------
const SEED_PREBOARDING_INVITES: PreboardingInvite[] = [
  {
    id: 'pb-2026-001',
    token: 'pb-demo-2026-hrm01',
    preboarding_url: '/preboarding?token=pb-demo-2026-hrm01',
    candidate_id: 'cand-001',
    candidate_code: 'UV-2026-101',
    employee_id: 'emp-pb-030',
    employee_code: 'NV-2026-030',
    full_name: 'Lê Minh Khôi',
    personal_email: 'khoi.le.dev@gmail.com',
    phone: '0909334455',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_id: 'pos-04',
    position_name: 'Senior Backend Engineer (Go / Node.js)',
    manager_id: 'emp-003',
    manager_name: 'Lê Hoàng Nam',
    expected_start_date: '2026-12-01',
    official_salary_vnd: 32000000,
    probation_salary_percent: 85,
    probation_salary_vnd: 27200000,
    status: 'PENDING',
    expires_at: '2026-12-15T23:59:59+07:00',
    created_at: '2026-11-20T09:00:00+07:00',
  },
];

export function getPreboardingInvites(): PreboardingInvite[] {
  const stored = readStorageArray<PreboardingInvite>(STORAGE_PREBOARDING_KEY);
  if (stored) return stored;
  return cloneJson(SEED_PREBOARDING_INVITES);
}

export function getPreboardingByToken(token: string): PreboardingInvite | null {
  const clean = token.trim();
  if (!clean) return null;
  const all = getPreboardingInvites();
  return all.find((item) => item.token === clean || item.id === clean) ?? null;
}

export function generateSecurePreboardingToken(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `pb-${hex}`;
  }
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `pb-${cryptoObj.randomUUID().replace(/-/g, '')}`;
  }
  throw new Error('CSPRNG không khả dụng để tạo token Pre-boarding an toàn.');
}
