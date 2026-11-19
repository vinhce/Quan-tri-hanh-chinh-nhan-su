import { fetchEmployeesMock } from '../../core/api.js';
import { DEMO_ACCOUNTS, getDefaultPageForRole, getRoleMeta, normalizeRole } from '../../core/rbac.js';
import { getState, setAuthenticatedUser, toggleTheme } from '../../core/state.js';
import { escapeHtml, formatVND, toUrl } from '../../core/utils.js';
import { getIcon } from '../../components/icons.js';
import { showToast, setFlashToast } from '../../components/toast.js';
import {
  DEMO_PASSWORD,
  DEPT_HEADCOUNT_SHARES,
  FALLBACK_DEPARTMENTS,
  PREVIEW_PAYROLL_ROWS,
  resolveRoleFromEmail,
} from './data.js';

const TAB_ACTIVE_CLASS =
  'h-9 rounded-md bg-white px-3 text-xs font-medium text-zinc-900 shadow-sm dark:bg-[#121214] dark:text-zinc-100 transition-unslop';
const TAB_INACTIVE_CLASS =
  'h-9 rounded-md px-3 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-unslop';
const DEMO_CARD_ACTIVE_CLASS =
  'flex flex-col items-start gap-1 rounded-lg border border-teal-700 bg-teal-50/70 p-3 text-left dark:border-teal-400 dark:bg-teal-950/30 transition-unslop';
const DEMO_CARD_IDLE_CLASS =
  'flex flex-col items-start gap-1 rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-left hover:border-zinc-300 hover:bg-zinc-100/70 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 transition-unslop';
const PAYROLL_ROW_ACTIVE_CLASS = 'bg-teal-50/70 dark:bg-teal-950/30 transition-unslop';
const PAYROLL_ROW_IDLE_CLASS = 'hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-unslop';

let selectedRole = normalizeRole(getState().role || 'HR_MANAGER');
let activeTab = 'login';

const el = (id) => document.getElementById(id);

function setFieldError(inputEl, errorEl, message) {
  if (errorEl) {
    errorEl.textContent = message || '';
    errorEl.classList.toggle('hidden', !message);
  }
  if (!inputEl) return;
  if (message) {
    inputEl.setAttribute('aria-invalid', 'true');
    inputEl.classList.remove('border-zinc-200/90', 'dark:border-zinc-800');
    inputEl.classList.add('border-rose-500', 'dark:border-rose-500');
  } else {
    inputEl.removeAttribute('aria-invalid');
    inputEl.classList.remove('border-rose-500', 'dark:border-rose-500');
    inputEl.classList.add('border-zinc-200/90', 'dark:border-zinc-800');
  }
}

function clearLoginErrors() {
  setFieldError(el('login-email'), el('login-email-error'), '');
  setFieldError(el('login-password'), el('login-password-error'), '');
}

function syncThemeButton(theme) {
  const btn = el('theme-toggle-btn');
  const iconWrap = el('theme-toggle-icon');
  const labelWrap = el('theme-toggle-label');
  const isDark = theme !== 'light';
  if (iconWrap) iconWrap.innerHTML = getIcon(isDark ? 'sun' : 'moon', 'w-4 h-4');
  if (labelWrap) labelWrap.textContent = isDark ? 'Chế độ sáng' : 'Chế độ tối';
  if (btn) btn.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
}

function renderRoleIndicator() {
  const container = el('login-role-indicator');
  if (!container) return;
  const meta = getRoleMeta(selectedRole);
  container.innerHTML =
    `<span class="text-zinc-600 dark:text-zinc-400">Vai trò phiên dự kiến</span>` +
    `<span class="rounded-md border px-2 py-0.5 text-[11px] font-medium ${escapeHtml(meta.badgeClass)}">${escapeHtml(meta.shortLabel)}</span>`;
}

function renderDemoAccounts() {
  const listEl = el('demo-accounts-list');
  if (!listEl) return;
  listEl.innerHTML = DEMO_ACCOUNTS.map((acc) => {
    const isActive = acc.role === selectedRole;
    return (
      `<button type="button" data-demo-role="${escapeHtml(acc.role)}" aria-pressed="${isActive ? 'true' : 'false'}" class="${isActive ? DEMO_CARD_ACTIVE_CLASS : DEMO_CARD_IDLE_CLASS}">` +
        `<div class="flex w-full items-center justify-between gap-2">` +
          `<span class="rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${escapeHtml(acc.badgeClass)}">${escapeHtml(acc.shortLabel)}</span>` +
          `<span class="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">${escapeHtml(acc.empCode)}</span>` +
        `</div>` +
        `<span class="mt-0.5 text-xs font-medium text-zinc-900 dark:text-zinc-100">${escapeHtml(acc.empName)}</span>` +
        `<span class="text-[11px] text-zinc-600 dark:text-zinc-400">${escapeHtml(acc.department)}</span>` +
      `</button>`
    );
  }).join('');
}

function renderPayrollPreview() {
  const tbody = el('preview-payroll-body');
  const noteEl = el('preview-active-role-note');
  if (noteEl) {
    const meta = getRoleMeta(selectedRole);
    noteEl.textContent = `Đang đánh dấu hồ sơ ${meta.shortLabel} (${meta.empCode})`;
  }
  if (!tbody) return;
  tbody.innerHTML = PREVIEW_PAYROLL_ROWS.map((row) => {
    const isActive = row.role === selectedRole;
    const codeClass = isActive
      ? 'font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-400'
      : 'font-mono tabular-nums text-zinc-700 dark:text-zinc-300';
    return (
      `<tr class="${isActive ? PAYROLL_ROW_ACTIVE_CLASS : PAYROLL_ROW_IDLE_CLASS}">` +
        `<td class="whitespace-nowrap px-3 py-2.5 ${codeClass}">${escapeHtml(row.empCode)}</td>` +
        `<td class="px-3 py-2.5"><div class="font-medium text-zinc-900 dark:text-zinc-100">${escapeHtml(row.fullName)}</div><div class="text-[11px] text-zinc-500 dark:text-zinc-400">${escapeHtml(row.department)}</div></td>` +
        `<td class="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400"><div>${escapeHtml(row.shiftCode)}</div><div class="text-[11px] text-zinc-500">${escapeHtml(row.workDays)} công</div></td>` +
        `<td class="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">${escapeHtml(formatVND(row.grossVnd))}</td>` +
        `<td class="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">${escapeHtml(formatVND(row.insuranceVnd))}</td>` +
        `<td class="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">${escapeHtml(formatVND(row.pitTaxVnd))}</td>` +
        `<td class="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-400">${escapeHtml(formatVND(row.netVnd))}</td>` +
      `</tr>`
    );
  }).join('');
}

function renderDeptShares() {
  const container = el('dept-shares-list');
  if (!container) return;
  container.innerHTML = DEPT_HEADCOUNT_SHARES.map((item) => {
    const pct = Math.max(0, Math.min(100, Number(item.sharePercent) || 0));
    const nameClass = item.isPrimary
      ? 'text-xs font-medium text-teal-700 dark:text-teal-400'
      : 'text-xs font-medium text-zinc-800 dark:text-zinc-200';
    return (
      `<div class="space-y-1.5">` +
        `<div class="flex flex-wrap items-center justify-between gap-2">` +
          `<span class="${nameClass}">${escapeHtml(item.department)}</span>` +
          `<div class="flex items-center gap-3 font-mono tabular-nums text-[11px]">` +
            `<span class="text-zinc-600 dark:text-zinc-400">${escapeHtml(String(item.headcount))} NV (${escapeHtml(String(pct))}%)</span>` +
            `<span class="font-medium text-zinc-900 dark:text-zinc-100">${escapeHtml(formatVND(item.budgetVnd))}</span>` +
          `</div>` +
        `</div>` +
        `<div class="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">` +
          `<div class="h-full rounded-full ${escapeHtml(item.barClass)}" style="width: ${pct}%"></div>` +
        `</div>` +
      `</div>`
    );
  }).join('');
}

function syncRoleVisuals() {
  renderRoleIndicator();
  renderDemoAccounts();
  renderPayrollPreview();
}

function switchAuthTab(nextTab) {
  activeTab = nextTab === 'register' ? 'register' : 'login';
  const isLogin = activeTab === 'login';
  const tabLogin = el('tab-login');
  const tabRegister = el('tab-register');
  if (tabLogin) {
    tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    tabLogin.className = isLogin ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS;
  }
  if (tabRegister) {
    tabRegister.setAttribute('aria-selected', isLogin ? 'false' : 'true');
    tabRegister.className = isLogin ? TAB_INACTIVE_CLASS : TAB_ACTIVE_CLASS;
  }
  if (el('panel-login')) el('panel-login').hidden = !isLogin;
  if (el('panel-register')) el('panel-register').hidden = isLogin;
}

function fillDemoCredentials(role) {
  const normalized = normalizeRole(role);
  const account = DEMO_ACCOUNTS.find((item) => item.role === normalized) || DEMO_ACCOUNTS[1];
  selectedRole = account.role;
  if (el('login-email')) el('login-email').value = account.email;
  if (el('login-password')) el('login-password').value = DEMO_PASSWORD;
  clearLoginErrors();
  syncRoleVisuals();
}

function populateRegisterRoles() {
  const select = el('register-role');
  if (!select) return;
  select.innerHTML = '';
  for (const acc of DEMO_ACCOUNTS) {
    const opt = document.createElement('option');
    opt.value = acc.role;
    opt.textContent = acc.label;
    if (acc.role === 'EMPLOYEE') opt.selected = true;
    select.appendChild(opt);
  }
}

async function loadDepartments() {
  const select = el('register-dept');
  if (!select) return;
  let names = [];
  try {
    const data = await fetchEmployeesMock();
    const rawList = Array.isArray(data?.MOCK_DEPARTMENTS) ? data.MOCK_DEPARTMENTS : [];
    names = Array.from(new Set(rawList.map((d) => String(d?.department_name || '').trim()).filter(Boolean)));
  } catch {
    names = [];
  }
  if (names.length === 0) names = FALLBACK_DEPARTMENTS;
  select.innerHTML = '';
  for (const deptName of names) {
    const opt = document.createElement('option');
    opt.value = deptName;
    opt.textContent = deptName;
    select.appendChild(opt);
  }
}

function bindPasswordToggles() {
  for (const btn of document.querySelectorAll('[data-toggle-target]')) {
    btn.innerHTML = getIcon('eye', 'w-4 h-4');
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-target');
      const input = targetId ? el(targetId) : null;
      if (!input) return;
      const showText = input.type === 'password';
      input.type = showText ? 'text' : 'password';
      btn.setAttribute('aria-pressed', showText ? 'true' : 'false');
      btn.setAttribute('aria-label', showText ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      btn.innerHTML = getIcon(showText ? 'eye-off' : 'eye', 'w-4 h-4');
    });
  }
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = el('login-email');
  const passwordInput = el('login-password');
  const submitBtn = el('login-submit-btn');
  const email = String(emailInput?.value || '').trim();
  const password = String(passwordInput?.value || '');

  let firstInvalid = null;
  if (!email) {
    setFieldError(emailInput, el('login-email-error'), 'Vui lòng nhập email doanh nghiệp.');
    firstInvalid = firstInvalid || emailInput;
  } else setFieldError(emailInput, el('login-email-error'), '');

  if (!password.trim()) {
    setFieldError(passwordInput, el('login-password-error'), 'Vui lòng nhập mật khẩu đăng nhập.');
    firstInvalid = firstInvalid || passwordInput;
  } else setFieldError(passwordInput, el('login-password-error'), '');

  if (firstInvalid) {
    firstInvalid.focus();
    showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng điền đầy đủ email và mật khẩu.', 'warning');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  const role = resolveRoleFromEmail(email, selectedRole);
  const meta = getRoleMeta(role);
  const demoMatch = DEMO_ACCOUNTS.find((acc) => acc.email.toLowerCase() === email.toLowerCase());
  const profile = demoMatch ? { ...demoMatch } : { ...meta, email };
  setAuthenticatedUser({ role, email, profile });
  setFlashToast('Đăng nhập thành công!', `Đã kích hoạt phiên ${meta.shortLabel} (${email}).`, 'success');
  window.location.href = toUrl(getDefaultPageForRole(role));
}

function handleRegisterSubmit(event) {
  event.preventDefault();
  const fullNameInput = el('register-fullname');
  const emailInput = el('register-email');
  const deptSelect = el('register-dept');
  const roleSelect = el('register-role');
  const passwordInput = el('register-password');
  const confirmInput = el('register-confirm-password');

  const fullName = String(fullNameInput?.value || '').trim();
  const regEmail = String(emailInput?.value || '').trim();
  const department = String(deptSelect?.value || '').trim();
  const regRole = normalizeRole(roleSelect?.value || 'EMPLOYEE');
  const password = String(passwordInput?.value || '');
  const confirmPassword = String(confirmInput?.value || '');

  let firstInvalid = null;
  const check = (input, errId, condition, msg) => {
    setFieldError(input, el(errId), condition ? '' : msg);
    if (!condition && !firstInvalid) firstInvalid = input;
  };
  check(fullNameInput, 'register-fullname-error', Boolean(fullName), 'Vui lòng nhập họ và tên.');
  check(emailInput, 'register-email-error', Boolean(regEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)), 'Vui lòng nhập email doanh nghiệp hợp lệ.');
  check(deptSelect, 'register-dept-error', Boolean(department), 'Vui lòng chọn phòng ban công tác.');
  check(passwordInput, 'register-password-error', password.trim().length >= 6, 'Mật khẩu phải có tối thiểu 6 ký tự.');
  check(confirmInput, 'register-confirm-error', Boolean(confirmPassword && confirmPassword === password), 'Mật khẩu xác nhận chưa trùng khớp.');

  if (firstInvalid) {
    firstInvalid.focus();
    showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng kiểm tra lại các trường đã đánh dấu.', 'error');
    return;
  }

  if (el('register-submit-btn')) el('register-submit-btn').disabled = true;
  setAuthenticatedUser({ role: regRole, email: regEmail, profile: { fullName, empName: fullName, department } });
  setFlashToast('Tạo thành công!', `Đã tạo phiên làm việc cho ${fullName} tại ${department}.`, 'success');
  window.location.href = toUrl(getDefaultPageForRole(regRole));
}

function bindEvents() {
  el('theme-toggle-btn')?.addEventListener('click', () => syncThemeButton(toggleTheme()));
  el('tab-login')?.addEventListener('click', () => switchAuthTab('login'));
  el('tab-register')?.addEventListener('click', () => switchAuthTab('register'));

  for (const tabBtn of [el('tab-login'), el('tab-register')]) {
    tabBtn?.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const targetTab = activeTab === 'login' ? 'register' : 'login';
      switchAuthTab(targetTab);
      el(targetTab === 'login' ? 'tab-login' : 'tab-register')?.focus();
    });
  }

  el('forgot-password-btn')?.addEventListener('click', () => {
    showToast('Hỗ trợ khôi phục mật khẩu', 'Vui lòng liên hệ bộ phận CNTT qua email it-support@lacviethrm.vn để được cấp lại quyền truy cập.', 'default');
  });

  el('demo-accounts-list')?.addEventListener('click', (event) => {
    const role = event.target.closest('[data-demo-role]')?.getAttribute('data-demo-role');
    if (!role) return;
    switchAuthTab('login');
    fillDemoCredentials(role);
    const meta = getRoleMeta(role);
    showToast('Đã chọn tài khoản mẫu', `Tài khoản ${meta.shortLabel} (${meta.email}) đã sẵn sàng.`, 'default');
  });

  el('login-email')?.addEventListener('input', (event) => {
    setFieldError(el('login-email'), el('login-email-error'), '');
    const value = String(event.target.value || '').trim();
    if (!value) return;
    const inferred = resolveRoleFromEmail(value, selectedRole);
    if (inferred !== selectedRole) {
      selectedRole = inferred;
      syncRoleVisuals();
    }
  });
  el('login-password')?.addEventListener('input', () => setFieldError(el('login-password'), el('login-password-error'), ''));

  for (const [inputId, errorId, ev] of [
    ['register-fullname', 'register-fullname-error', 'input'],
    ['register-email', 'register-email-error', 'input'],
    ['register-dept', 'register-dept-error', 'change'],
    ['register-password', 'register-password-error', 'input'],
    ['register-confirm-password', 'register-confirm-error', 'input'],
  ]) {
    el(inputId)?.addEventListener(ev, () => setFieldError(el(inputId), el(errorId), ''));
  }

  el('login-form')?.addEventListener('submit', handleLoginSubmit);
  el('register-form')?.addEventListener('submit', handleRegisterSubmit);
}

function init() {
  syncThemeButton(getState().theme);
  if (el('login-email-icon')) el('login-email-icon').innerHTML = getIcon('mail', 'w-4 h-4');
  if (el('login-lock-icon')) el('login-lock-icon').innerHTML = getIcon('lock', 'w-4 h-4');
  if (el('login-submit-icon')) el('login-submit-icon').innerHTML = getIcon('arrow-right', 'w-4 h-4');
  if (el('register-submit-icon')) el('register-submit-icon').innerHTML = getIcon('user-plus', 'w-4 h-4');
  bindPasswordToggles();
  populateRegisterRoles();
  renderDeptShares();
  fillDemoCredentials(selectedRole);
  bindEvents();
  void loadDepartments();
}

init();
