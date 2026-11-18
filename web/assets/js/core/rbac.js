export const ROLES = ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'];

const SUPER_ADMIN_META = {
  role: 'SUPER_ADMIN',
  label: 'Quản trị Hệ thống (Super Admin)',
  shortLabel: 'Admin',
  roleTitle: 'Quản trị hệ thống',
  empCode: 'NV-2024-001',
  empName: 'Nguyễn Văn An',
  email: 'an.nguyen@lacviethrm.vn',
  department: 'Ban Điều hành',
  shiftCode: 'HC-08:00',
  scopeNote: 'Toàn quyền hệ thống & bảo mật',
  badgeClass:
    'border-teal-700/20 bg-teal-50/80 text-teal-800 dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-300',
};

export const ROLE_META = {
  SUPER_ADMIN: SUPER_ADMIN_META,
  HR_MANAGER: {
    role: 'HR_MANAGER',
    label: 'Trưởng phòng Nhân sự (HR Manager)',
    shortLabel: 'HR Manager',
    roleTitle: 'Trưởng phòng Nhân sự',
    empCode: 'NV-2024-002',
    empName: 'Trần Thị Bích Ngọc',
    email: 'ngoc.tran@lacviethrm.vn',
    department: 'Phòng Nhân sự & Hành chính',
    shiftCode: 'HC-08:00',
    scopeNote: 'Toàn bộ nghiệp vụ HR, công, lương & tuyển dụng',
    badgeClass:
      'border-emerald-600/20 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  DEPT_MANAGER: {
    role: 'DEPT_MANAGER',
    label: 'Trưởng Bộ phận (Dept Manager)',
    shortLabel: 'Trưởng phòng',
    roleTitle: 'Trưởng bộ phận',
    empCode: 'NV-2024-003',
    empName: 'Lê Hoàng Nam',
    email: 'nam.le@lacviethrm.vn',
    department: 'Khối Công nghệ',
    shiftCode: 'HC-08:30',
    scopeNote: 'Quản lý nhân sự, công & duyệt đơn Khối Công nghệ',
    badgeClass:
      'border-amber-600/20 bg-amber-50/80 text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-300',
  },
  EMPLOYEE: {
    role: 'EMPLOYEE',
    label: 'Nhân viên (Employee)',
    shortLabel: 'Nhân viên',
    roleTitle: 'Chuyên viên Kỹ thuật',
    empCode: 'NV-2024-008',
    empName: 'Phạm Minh Tuấn',
    email: 'tuan.pham@lacviethrm.vn',
    department: 'Khối Công nghệ',
    shiftCode: 'HC-08:30',
    scopeNote: 'Cổng tự phục vụ (ESS): công, đơn từ & phiếu lương',
    badgeClass:
      'border-zinc-200/80 bg-zinc-100 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-800/80 dark:text-zinc-300',
  },
  DIRECTOR: {
    ...SUPER_ADMIN_META,
  },
};

export const DEMO_ACCOUNTS = ROLES.map((roleKey) => {
  const meta = ROLE_META[roleKey];
  return {
    ...meta,
    fullName: meta.empName,
  };
});

export const NAV_SECTIONS = ['Quản trị cốt lõi', 'Vận hành', 'Hệ thống'];

export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Tổng quan điều hành',
    section: 'Quản trị cốt lõi',
    icon: 'layout-grid',
    path: 'index.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'],
    badgeCount: 0,
    deliverableStep: 'Bước 2',
    summary: 'Bảng điều khiển KPI nhân sự, chấm công & tác vụ điều hành',
  },
  {
    id: 'core-hr',
    label: 'Hồ sơ & Tổ chức',
    section: 'Quản trị cốt lõi',
    icon: 'users',
    path: 'pages/core-hr.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER'],
    badgeCount: 27,
    deliverableStep: 'Bước 3',
    summary: 'Danh bạ nhân sự 360°, sơ đồ tổ chức & biến động nhân lực',
  },
  {
    id: 'contracts',
    label: 'Hợp đồng & Phụ lục',
    section: 'Quản trị cốt lõi',
    icon: 'file-text',
    path: 'pages/core-hr.html?tab=contracts',
    roles: ['SUPER_ADMIN', 'HR_MANAGER'],
    badgeCount: 3,
    deliverableStep: 'Bước 3',
    summary: 'Quản lý hợp đồng lao động, phụ lục & cảnh báo hết hạn',
  },
  {
    id: 'ats',
    label: 'Tuyển dụng & AI CV',
    section: 'Quản trị cốt lõi',
    icon: 'user-check',
    path: 'pages/ats.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER'],
    badgeCount: 8,
    deliverableStep: 'Bước 3',
    summary: 'Pipeline ứng viên Kanban & chấm điểm khớp JD bằng AI',
  },
  {
    id: 'attendance',
    label: 'Chấm công & Ca làm',
    section: 'Vận hành',
    icon: 'clock',
    path: 'pages/attendance.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'],
    badgeCount: 0,
    deliverableStep: 'Bước 4',
    summary: 'Bảng công chi tiết, ca làm việc & dữ liệu tăng ca',
  },
  {
    id: 'leaves',
    label: 'Đơn từ & Phê duyệt',
    section: 'Vận hành',
    icon: 'calendar-check',
    path: 'pages/requests.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'],
    badgeCount: 5,
    deliverableStep: 'Bước 4',
    summary: 'Nghỉ phép, công tác, giải trình công & luồng phê duyệt',
  },
  {
    id: 'payroll',
    label: 'Bảng lương & Thuế',
    section: 'Vận hành',
    icon: 'wallet',
    path: 'pages/payroll.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER'],
    badgeCount: 0,
    deliverableStep: 'Bước 4',
    summary: 'Tính lương, BHXH, thuế TNCN & phê duyệt chi trả',
  },
  {
    id: 'payslip',
    label: 'Phiếu lương cá nhân',
    section: 'Vận hành',
    icon: 'receipt',
    path: 'pages/payslip.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE'],
    badgeCount: 0,
    deliverableStep: 'Bước 4',
    summary: 'Tra cứu thu nhập, khấu trừ & bảo hiểm hàng tháng',
  },
  {
    id: 'kpi',
    label: 'Đánh giá & Cảnh báo AI',
    section: 'Vận hành',
    icon: 'activity',
    path: 'pages/performance.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER', 'DEPT_MANAGER'],
    badgeCount: 2,
    deliverableStep: 'Bước 5',
    summary: 'Chu kỳ OKR/KPI & dự báo rủi ro nghỉ việc bằng AI',
  },
  {
    id: 'rbac',
    label: 'Phân quyền vai trò',
    section: 'Hệ thống',
    icon: 'shield',
    path: 'pages/admin-roles.html',
    roles: ['SUPER_ADMIN'],
    badgeCount: 0,
    deliverableStep: 'Bước 5',
    summary: 'Ma trận vai trò, phạm vi dữ liệu & quyền thao tác',
  },
  {
    id: 'settings',
    label: 'Tham số & Chính sách',
    section: 'Hệ thống',
    icon: 'sliders',
    path: 'pages/admin-settings.html',
    roles: ['SUPER_ADMIN', 'HR_MANAGER'],
    badgeCount: 0,
    deliverableStep: 'Bước 5',
    summary: 'Cấu hình lương tối thiểu, thuế, BHXH & quy tắc chấm công',
  },
  {
    id: 'audit-logs',
    label: 'Nhật ký bảo mật',
    section: 'Hệ thống',
    icon: 'terminal',
    path: 'pages/admin-audit.html',
    roles: ['SUPER_ADMIN'],
    badgeCount: 0,
    deliverableStep: 'Bước 5',
    summary: 'Truy vết thao tác nhạy cảm & giám sát truy cập hệ thống',
  },
];

export const NAV_ALIAS_TO_ID = {
  employees: 'core-hr',
  recruitment: 'ats',
  requests: 'leaves',
  performance: 'kpi',
  roles: 'rbac',
};

/**
 * Chuẩn hóa mã vai trò (ánh xạ DIRECTOR -> SUPER_ADMIN, fallback về HR_MANAGER).
 * @param {string} role
 * @returns {string}
 */
export function normalizeRole(role) {
  const key = String(role ?? '')
    .trim()
    .toUpperCase();
  if (key === 'DIRECTOR') return 'SUPER_ADMIN';
  if (ROLES.includes(key)) return key;
  return 'HR_MANAGER';
}

/**
 * Lấy metadata hiển thị của vai trò; fallback an toàn về HR_MANAGER nếu không khớp.
 * @param {string} role
 * @returns {typeof ROLE_META.HR_MANAGER}
 */
export function getRoleMeta(role) {
  const rawKey = String(role ?? '')
    .trim()
    .toUpperCase();
  if (rawKey === 'DIRECTOR') return ROLE_META.DIRECTOR;
  const normalized = normalizeRole(rawKey);
  return ROLE_META[normalized] || ROLE_META.HR_MANAGER;
}

/**
 * Tìm mục điều hướng theo id hoặc alias.
 * @param {string} navId
 * @returns {typeof NAV_ITEMS[number] | null}
 */
export function getNavItem(navId) {
  const rawId = String(navId ?? '').trim();
  if (!rawId) return null;
  const resolvedId = NAV_ALIAS_TO_ID[rawId] || rawId;
  return NAV_ITEMS.find((item) => item.id === resolvedId) || null;
}

/**
 * Kiểm tra vai trò có quyền truy cập trang/mục điều hướng hay không.
 * @param {string} role
 * @param {string} navId
 * @returns {boolean}
 */
export function canAccessNav(role, navId) {
  const item = getNavItem(navId);
  if (!item) return false;
  const normalized = normalizeRole(role);
  return item.roles.includes(normalized);
}

/**
 * Trả về danh sách các mục điều hướng được phép hiển thị với vai trò.
 * @param {string} role
 * @returns {typeof NAV_ITEMS}
 */
export function getVisibleNavItems(role) {
  const normalized = normalizeRole(role);
  return NAV_ITEMS.filter((item) => item.roles.includes(normalized));
}

/**
 * Trả về navId mặc định sau đăng nhập hoặc khi bị từ chối quyền.
 * @param {string} role
 * @returns {string}
 */
export function getDefaultNavForRole(role) {
  return normalizeRole(role) === 'EMPLOYEE' ? 'payslip' : 'dashboard';
}

/**
 * Trả về đường dẫn trang mặc định tương ứng với vai trò.
 * @param {string} role
 * @returns {string}
 */
export function getDefaultPageForRole(role) {
  return normalizeRole(role) === 'EMPLOYEE' ? 'pages/payslip.html' : 'index.html';
}
