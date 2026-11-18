import { DEMO_ACCOUNTS, normalizeRole } from '../../core/rbac.js';

export const DEMO_PASSWORD = 'LacVietHRM@2026';

export const PREVIEW_PAYROLL_ROWS = [
  {
    role: 'SUPER_ADMIN',
    empCode: 'NV-2024-001',
    fullName: 'Nguyễn Văn An',
    department: 'Ban Điều hành',
    shiftCode: 'HC-08:00',
    workDays: '22/22',
    grossVnd: 52000000,
    insuranceVnd: 5460000,
    pitTaxVnd: 5965000,
    netVnd: 40575000,
  },
  {
    role: 'HR_MANAGER',
    empCode: 'NV-2024-002',
    fullName: 'Trần Thị Bích Ngọc',
    department: 'Phòng Nhân sự & HC',
    shiftCode: 'HC-08:00',
    workDays: '22/22',
    grossVnd: 36400000,
    insuranceVnd: 3822000,
    pitTaxVnd: 2545000,
    netVnd: 30033000,
  },
  {
    role: 'DEPT_MANAGER',
    empCode: 'NV-2024-003',
    fullName: 'Lê Hoàng Nam',
    department: 'Khối Công nghệ',
    shiftCode: 'HC-08:30',
    workDays: '21/22',
    grossVnd: 44800000,
    insuranceVnd: 4704000,
    pitTaxVnd: 4110000,
    netVnd: 35986000,
  },
  {
    role: 'EMPLOYEE',
    empCode: 'NV-2024-008',
    fullName: 'Phạm Minh Tuấn',
    department: 'Khối Công nghệ',
    shiftCode: 'HC-08:30',
    workDays: '22/22',
    grossVnd: 28500000,
    insuranceVnd: 2992500,
    pitTaxVnd: 1350000,
    netVnd: 24157500,
  },
];

export const DEPT_HEADCOUNT_SHARES = [
  {
    department: 'Khối Công nghệ',
    headcount: 42,
    sharePercent: 28,
    budgetVnd: 1155000000,
    isPrimary: true,
    barClass: 'bg-teal-700 dark:bg-teal-400',
  },
  {
    department: 'Khối Kinh doanh',
    headcount: 36,
    sharePercent: 24,
    budgetVnd: 686000000,
    isPrimary: false,
    barClass: 'bg-zinc-400 dark:bg-zinc-600',
  },
  {
    department: 'Phòng Nhân sự & HC',
    headcount: 12,
    sharePercent: 8,
    budgetVnd: 238000000,
    isPrimary: false,
    barClass: 'bg-zinc-400 dark:bg-zinc-600',
  },
  {
    department: 'Khối Vận hành & Khác',
    headcount: 58,
    sharePercent: 40,
    budgetVnd: 896000000,
    isPrimary: false,
    barClass: 'bg-zinc-500 dark:bg-zinc-500',
  },
];

export const FALLBACK_DEPARTMENTS = [
  'Ban Điều hành',
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
  'Phòng Nhân sự & Hành chính',
  'Phòng Tài chính - Kế toán',
  'Khối Kinh doanh',
];

/**
 * Suy diễn mã vai trò từ email đăng nhập (khớp DEMO_ACCOUNTS hoặc từ khóa phổ biến).
 * @param {string} email
 * @param {string} [fallbackRole='HR_MANAGER']
 * @returns {'SUPER_ADMIN'|'HR_MANAGER'|'DEPT_MANAGER'|'EMPLOYEE'}
 */
export function resolveRoleFromEmail(email, fallbackRole = 'HR_MANAGER') {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!normalizedEmail) {
    return normalizeRole(fallbackRole);
  }

  const demoMatch = DEMO_ACCOUNTS.find((acc) => acc.email.toLowerCase() === normalizedEmail);
  if (demoMatch) {
    return demoMatch.role;
  }

  if (normalizedEmail.includes('admin')) return 'SUPER_ADMIN';
  if (normalizedEmail.includes('hr')) return 'HR_MANAGER';
  if (normalizedEmail.includes('manager') || normalizedEmail.includes('truongphong')) {
    return 'DEPT_MANAGER';
  }
  if (normalizedEmail.includes('nv')) return 'EMPLOYEE';

  return normalizeRole(fallbackRole);
}
