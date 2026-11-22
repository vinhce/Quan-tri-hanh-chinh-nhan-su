'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileUp,
  HeartHandshake,
  KeyRound,
  Mail,
  Moon,
  Pencil,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useApp, type UserProfileOverride } from '@/context/app-context';
import { alertSwal, confirmSwal, escapeSwalHtml } from '@/lib/swal';
import {
  activateEmployeeAccountIfPreboardingVerified,
  getAllRuntimeEmployees,
  getPreboardingByToken,
  getPreboardingInvites,
  getSystemUsers,
  HRM_RUNTIME_EVENT,
  submitPreboardingInfo,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatVND } from '@/lib/utils';
import {
  isOfficialEmployeeStatus,
  type Employee,
  type PreboardingInvite,
  type PreboardingStatus,
  type PreboardingSubmissionData,
  type SystemUserAccount,
} from '@/mock/types';
import { Badge, BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const SEED_DEMO_TOKEN = 'pb-demo-2026-hrm01';

const PREBOARDING_STATUS_META: Record<
  PreboardingStatus,
  { label: string; variant: BadgeVariant; desc: string }
> = {
  PENDING: {
    label: 'Chờ khai báo thông tin',
    variant: 'warning',
    desc: 'Vui lòng hoàn thiện thông tin định danh pháp lý, thuế, bảo hiểm và tài khoản nhận lương trước ngày nhận việc.',
  },
  SUBMITTED: {
    label: 'Đã gửi hồ sơ · Chờ HR xác minh',
    variant: 'teal',
    desc: 'Hồ sơ Pre-boarding đã được chuyển về Phòng Nhân sự. Bạn vẫn có thể cập nhật bổ sung trước khi HR khóa xác minh.',
  },
  VERIFIED: {
    label: 'HR đã xác minh hợp lệ',
    variant: 'success',
    desc: 'Phòng Nhân sự đã đối chiếu và xác nhận hợp lệ toàn bộ hồ sơ nhận việc của bạn.',
  },
  EXPIRED: {
    label: 'Liên kết đã hết hạn',
    variant: 'danger',
    desc: 'Thời hạn khai báo trực tuyến đã kết thúc. Vui lòng liên hệ Chuyên viên Tuyển dụng để được cấp lại liên kết.',
  },
};

const BANK_OPTIONS = [
  { label: 'Vietcombank — Ngân hàng TMCP Ngoại thương Việt Nam', value: 'Vietcombank' },
  { label: 'Techcombank — Ngân hàng TMCP Kỹ thương Việt Nam', value: 'Techcombank' },
  { label: 'MB Bank — Ngân hàng TMCP Quân đội', value: 'MB Bank' },
  { label: 'VietinBank — Ngân hàng TMCP Công thương Việt Nam', value: 'VietinBank' },
  { label: 'BIDV — Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', value: 'BIDV' },
  { label: 'ACB — Ngân hàng TMCP Á Châu', value: 'ACB' },
  { label: 'VPBank — Ngân hàng TMCP Việt Nam Thịnh Vượng', value: 'VPBank' },
  { label: 'TPBank — Ngân hàng TMCP Tiên Phong', value: 'TPBank' },
];

const RELATION_OPTIONS = [
  { label: 'Vợ / Chồng', value: 'Vợ/Chồng' },
  { label: 'Cha / Mẹ', value: 'Cha/Mẹ' },
  { label: 'Anh / Chị / Em ruột', value: 'Anh/Chị/Em' },
  { label: 'Người thân khác', value: 'Người thân khác' },
];

type FormFieldKey =
  | 'national_id'
  | 'national_id_issue_date'
  | 'national_id_issue_place'
  | 'tax_code'
  | 'bank_name'
  | 'bank_account_no'
  | 'address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone';

function PreboardingSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-[#EFF5F3] px-4 py-8 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function resolvePreferredToken(
  allInvites: PreboardingInvite[],
  currentUserEmail: string | null,
  currentUserProfile: UserProfileOverride | null
): string {
  if (allInvites.length === 0) return '';

  const sortedInvites = [...allInvites].sort((a, b) => {
    const tA = Date.parse(a.created_at || '') || 0;
    const tB = Date.parse(b.created_at || '') || 0;
    return tB - tA;
  });

  const loggedInEmail = (currentUserEmail ?? '').trim().toLowerCase();
  if (!loggedInEmail) {
    return '';
  }

  const matchedByAuthEmail = sortedInvites.find(
    (inv) =>
      inv.personal_email?.trim().toLowerCase() === loggedInEmail ||
      inv.submitted_data?.personal_email?.trim().toLowerCase() === loggedInEmail
  );
  if (matchedByAuthEmail) return matchedByAuthEmail.token;

  const matchedOwnEmp = getAllRuntimeEmployees().find(
    (emp) => emp.email?.trim().toLowerCase() === loggedInEmail
  );
  if (matchedOwnEmp) {
    const ownPersonalEmail =
      matchedOwnEmp.personal_email?.trim().toLowerCase() || '';
    const ownEmpCode = matchedOwnEmp.employee_code.trim().toLowerCase();
    const matchedByOwnEmp = sortedInvites.find(
      (inv) =>
        (ownPersonalEmail &&
          (inv.personal_email?.trim().toLowerCase() === ownPersonalEmail ||
            inv.submitted_data?.personal_email?.trim().toLowerCase() ===
              ownPersonalEmail)) ||
        inv.employee_code.trim().toLowerCase() === ownEmpCode
    );
    if (matchedByOwnEmp) return matchedByOwnEmp.token;
  }

  return '';
}

function PreboardingPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    role,
    theme,
    toggleTheme,
    showToast,
    currentUserEmail,
    currentUserProfile,
    setAuthenticatedUser,
    logout,
  } = useApp();

  const urlToken = (searchParams.get('token') ?? '').trim();
  const [manualTokenInput, setManualTokenInput] = useState<string>(urlToken);
  const [activeToken, setActiveToken] = useState<string>(urlToken);
  const [runtimeEmployees, setRuntimeEmployees] = useState<Employee[]>([]);
  const [runtimeSystemUsers, setRuntimeSystemUsers] = useState<SystemUserAccount[]>([]);
  const [invite, setInvite] = useState<PreboardingInvite | null>(null);
  const [isManualUnlocked, setIsManualUnlocked] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isEnteringWorkspace, setIsEnteringWorkspace] = useState<boolean>(false);

  // Form fields
  const [personalEmail, setPersonalEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [dateOfBirth, setDateOfBirth] = useState<string>('1997-06-15');
  const [nationalId, setNationalId] = useState<string>('');
  const [nationalIdIssueDate, setNationalIdIssueDate] = useState<string>('2022-04-18');
  const [nationalIdIssuePlace, setNationalIdIssuePlace] = useState<string>(
    'Cục Cảnh sát QLHC về TTXH'
  );
  const [taxCode, setTaxCode] = useState<string>('');
  const [socialInsuranceNo, setSocialInsuranceNo] = useState<string>('');
  const [dependentsCount, setDependentsCount] = useState<string>('0');
  const [address, setAddress] = useState<string>('');
  const [bankName, setBankName] = useState<string>('Vietcombank');
  const [bankAccountNo, setBankAccountNo] = useState<string>('');
  const [emergencyContactName, setEmergencyContactName] = useState<string>('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState<string>('');
  const [emergencyContactRelation, setEmergencyContactRelation] =
    useState<string>('Vợ/Chồng');
  const [idCardFileName, setIdCardFileName] = useState<string>('');
  const [degreeFileName, setDegreeFileName] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormFieldKey, string>>>({});
  const firstErrorRef = useRef<HTMLInputElement | null>(null);

  const hydrateFormFromInvite = useCallback((found: PreboardingInvite | null) => {
    if (!found) return;
    const sub = found.submitted_data;
    setPersonalEmail(sub?.personal_email ?? found.personal_email ?? '');
    setPhone(sub?.phone ?? found.phone ?? '');
    setGender(sub?.gender ?? 'Nam');
    setDateOfBirth(sub?.date_of_birth ?? '1997-06-15');
    setNationalId(sub?.national_id ?? '');
    setNationalIdIssueDate(sub?.national_id_issue_date ?? '2022-04-18');
    setNationalIdIssuePlace(
      sub?.national_id_issue_place ?? 'Cục Cảnh sát QLHC về TTXH'
    );
    setTaxCode(sub?.tax_code ?? '');
    setSocialInsuranceNo(sub?.social_insurance_no ?? '');
    setDependentsCount(String(sub?.dependents_count ?? 0));
    setAddress(sub?.address ?? '');
    setBankName(sub?.bank_name ?? 'Vietcombank');
    setBankAccountNo(sub?.bank_account_no ?? '');
    setEmergencyContactName(sub?.emergency_contact_name ?? '');
    setEmergencyContactPhone(sub?.emergency_contact_phone ?? '');
    setEmergencyContactRelation(sub?.emergency_contact_relation ?? 'Vợ/Chồng');
    setIdCardFileName(sub?.id_card_file_name ?? '');
    setDegreeFileName(sub?.degree_file_name ?? '');
    setFieldErrors({});
  }, []);

  useEffect(() => {
    setIsManualUnlocked(false);
  }, [activeToken]);

  useEffect(() => {
    const tokenToLoad = urlToken
      ? urlToken
      : currentUserEmail
        ? resolvePreferredToken(
            getPreboardingInvites(),
            currentUserEmail,
            currentUserProfile
          )
        : '';
    setActiveToken((prev) => (prev === tokenToLoad ? prev : tokenToLoad));
    setManualTokenInput((prev) => (prev === tokenToLoad ? prev : tokenToLoad));
  }, [urlToken, currentUserEmail, currentUserProfile]);

  const reloadStore = useCallback(
    (preserveInputs = false) => {
      setRuntimeEmployees(getAllRuntimeEmployees());
      setRuntimeSystemUsers(getSystemUsers());
      const found = activeToken ? getPreboardingByToken(activeToken) : null;
      setInvite(found);
      if (found && !preserveInputs) {
        hydrateFormFromInvite(found);
      }
      setIsHydrated(true);
    },
    [activeToken, hydrateFormFromInvite]
  );

  useEffect(() => {
    reloadStore(false);
  }, [reloadStore]);

  useEffect(() => {
    const onRuntimeChange = () => {
      if (!urlToken) {
        const preferred = currentUserEmail
          ? resolvePreferredToken(
              getPreboardingInvites(),
              currentUserEmail,
              currentUserProfile
            )
          : '';
        if (preferred !== activeToken) {
          setActiveToken(preferred);
          setManualTokenInput(preferred);
          return;
        }
      }
      reloadStore(true);
    };
    window.addEventListener(HRM_RUNTIME_EVENT, onRuntimeChange);
    window.addEventListener('storage', onRuntimeChange);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, onRuntimeChange);
      window.removeEventListener('storage', onRuntimeChange);
    };
  }, [urlToken, currentUserEmail, currentUserProfile, activeToken, reloadStore]);

  const switchToken = (nextToken: string) => {
    const trimmed = nextToken.trim();
    if (!trimmed) return;
    setIsManualUnlocked(false);
    setActiveToken(trimmed);
    setManualTokenInput(trimmed);
    const found = getPreboardingByToken(trimmed);
    setInvite(found);
    hydrateFormFromInvite(found);
    router.replace(`/preboarding?token=${encodeURIComponent(trimmed)}`);
  };

  const linkedEmployee = useMemo(() => {
    if (!invite) return null;
    return (
      runtimeEmployees.find(
        (emp) =>
          emp.id === invite.employee_id ||
          emp.employee_code.toLowerCase() === invite.employee_code.toLowerCase()
      ) ?? null
    );
  }, [invite, runtimeEmployees]);

  const linkedSystemUser = useMemo(() => {
    if (!invite) return null;
    const inviteEmpCode = invite.employee_code?.trim().toLowerCase();
    const empEmail = (linkedEmployee?.email || invite.email || '').trim().toLowerCase();
    const personalEmailLower = invite.personal_email?.trim().toLowerCase();
    return (
      runtimeSystemUsers.find(
        (u) =>
          (invite.employee_id && u.employee_id === invite.employee_id) ||
          (inviteEmpCode && u.employee_code.toLowerCase() === inviteEmpCode) ||
          (empEmail && u.email.toLowerCase() === empEmail) ||
          (personalEmailLower && u.email.toLowerCase() === personalEmailLower)
      ) ?? null
    );
  }, [invite, linkedEmployee, runtimeSystemUsers]);

  const isSystemUserLocked = linkedSystemUser?.account_status === 'LOCKED';

  const isEmployeeActivated = Boolean(
    invite &&
      linkedEmployee &&
      invite.status === 'VERIFIED' &&
      linkedEmployee.employment_status !== 'RESIGNED' &&
      !isSystemUserLocked
  );

  const employeeCodeDisplay = linkedEmployee?.employee_code || invite?.employee_code || '';
  const companyEmail =
    linkedEmployee?.email ||
    invite?.email ||
    linkedSystemUser?.email ||
    invite?.personal_email ||
    '';

  const canManualUnlockVerified = useMemo(() => {
    if (!invite || invite.status !== 'VERIFIED') return false;
    if (isEmployeeActivated || isSystemUserLocked) return false;
    if (!linkedEmployee) return false;
    if (
      isOfficialEmployeeStatus(linkedEmployee.employment_status) ||
      linkedEmployee.employment_status === 'RESIGNED'
    ) {
      return false;
    }
    return true;
  }, [invite, isEmployeeActivated, isSystemUserLocked, linkedEmployee]);

  const effectiveManualUnlocked = isManualUnlocked && canManualUnlockVerified;

  const handleEnterEmployeeWorkspace = () => {
    if (!invite || !linkedEmployee || !isEmployeeActivated || isEnteringWorkspace) return;
    const normalizedSessionEmail = (currentUserEmail || '').trim().toLowerCase();
    const ownerEmails = [
      invite.personal_email,
      invite.email,
      linkedEmployee.email,
      linkedEmployee.personal_email,
    ]
      .filter((val): val is string => Boolean(val && val.trim()))
      .map((val) => val.trim().toLowerCase());
    const isAdminSession = role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';
    if (
      normalizedSessionEmail &&
      !isAdminSession &&
      ownerEmails.length > 0 &&
      !ownerEmails.includes(normalizedSessionEmail)
    ) {
      showToast(
        'Tài khoản phiên hiện tại không khớp hồ sơ',
        'Vui lòng đăng xuất tài khoản hiện tại trước khi mở không gian Nhân viên của hồ sơ này.',
        'error'
      );
      return;
    }

    setIsEnteringWorkspace(true);
    try {
      const identifier =
        linkedEmployee.employee_code ||
        invite.employee_code ||
        companyEmail;
      const activatedUser = activateEmployeeAccountIfPreboardingVerified(identifier);
      if (
        !activatedUser ||
        activatedUser.account_status !== 'ACTIVE' ||
        activatedUser.is_active === false
      ) {
        showToast(
          'Không thể kích hoạt tài khoản Nhân viên',
          'Tài khoản nhân sự chưa được xác thực hoặc đang ở trạng thái khóa/nghỉ việc. Vui lòng liên hệ Phòng Nhân sự.',
          'error'
        );
        setIsEnteringWorkspace(false);
        return;
      }

      const resolvedEmail = activatedUser.email || companyEmail;
      const resolvedEmployeeCode =
        linkedEmployee.employee_code ||
        activatedUser.employee_code ||
        invite.employee_code ||
        '';

      setAuthenticatedUser('EMPLOYEE', resolvedEmail, {
        fullName: linkedEmployee.full_name || invite.full_name,
        employee_code: resolvedEmployeeCode,
        email: resolvedEmail,
        department: linkedEmployee.department_name || invite.department_name || '',
        department_id: linkedEmployee.department_id || invite.department_id || '',
        title:
          linkedEmployee.position_name ||
          invite.position_title ||
          invite.position_name ||
          'Nhân viên',
      });
      showToast(
        'Đã kích hoạt không gian Nhân viên',
        `Chào mừng ${linkedEmployee.full_name || invite.full_name} (${resolvedEmployeeCode}) vào hệ thống Lạc Việt HRM.`,
        'success'
      );
      router.push('/app');
    } catch {
      setIsEnteringWorkspace(false);
    }
  };

  const handlePrefillSample = () => {
    if (
      !invite ||
      invite.status === 'EXPIRED' ||
      (invite.status === 'VERIFIED' && !effectiveManualUnlocked)
    ) {
      return;
    }
    setGender('Nam');
    setDateOfBirth('1997-08-22');
    setNationalId('079097014582');
    setNationalIdIssueDate('2022-05-12');
    setNationalIdIssuePlace('Cục Cảnh sát QLHC về TTXH');
    setTaxCode('8462910384');
    setSocialInsuranceNo('7924819205');
    setDependentsCount('1');
    setAddress('Số 128 Nguyễn Đình Chiểu, Phường Võ Thị Sáu, Quận 3, TP.HCM');
    setBankName('Vietcombank');
    setBankAccountNo('0071001298456');
    setEmergencyContactName('Trần Thu Trang');
    setEmergencyContactPhone('0908667788');
    setEmergencyContactRelation('Vợ/Chồng');
    setIdCardFileName('CCCD_2Mat_CongChung_2026.pdf');
    setDegreeFileName('Bang_DaiHoc_CNTT_ChinhQuy.pdf');
    setFieldErrors({});
    showToast(
      'Đã điền mẫu hồ sơ hợp lệ',
      'Bạn có thể kiểm tra từng trường dữ liệu và nhấn Gửi hồ sơ nhận việc.',
      'info'
    );
  };

  const validateSubmission = (): Partial<Record<FormFieldKey, string>> => {
    const errs: Partial<Record<FormFieldKey, string>> = {};
    const cleanCccd = nationalId.replace(/\s+/g, '');
    if (!/^\d{9}(\d{3})?$/.test(cleanCccd)) {
      errs.national_id = 'Số CCCD/CMND phải gồm đúng 12 chữ số (hoặc 9 chữ số cũ).';
    }
    if (!nationalIdIssueDate) {
      errs.national_id_issue_date = 'Vui lòng chọn ngày cấp CCCD.';
    }
    if (!nationalIdIssuePlace.trim()) {
      errs.national_id_issue_place = 'Vui lòng nhập nơi cấp CCCD.';
    }
    const cleanTax = taxCode.replace(/\s+/g, '');
    if (!/^\d{10}(-\d{3})?$/.test(cleanTax)) {
      errs.tax_code = 'Mã số thuế TNCN phải gồm 10 chữ số (hoặc định dạng 10-3 chữ số).';
    }
    if (!bankName.trim()) {
      errs.bank_name = 'Vui lòng chọn ngân hàng nhận lương.';
    }
    const cleanBankAcc = bankAccountNo.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9]{6,22}$/.test(cleanBankAcc)) {
      errs.bank_account_no = 'Số tài khoản ngân hàng cần từ 6 đến 22 ký tự chữ/số.';
    }
    if (!address.trim() || address.trim().length < 8) {
      errs.address = 'Vui lòng nhập địa chỉ liên hệ cụ thể (tối thiểu 8 ký tự).';
    }
    if (!emergencyContactName.trim()) {
      errs.emergency_contact_name = 'Vui lòng nhập họ tên người liên hệ khẩn cấp.';
    }
    const cleanEmgPhone = emergencyContactPhone.replace(/\s+/g, '');
    if (!/^0\d{8,10}$/.test(cleanEmgPhone)) {
      errs.emergency_contact_phone = 'Số điện thoại khẩn cấp phải bắt đầu bằng số 0 (9–11 chữ số).';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !invite ||
      invite.status === 'EXPIRED' ||
      (invite.status === 'VERIFIED' && !effectiveManualUnlocked)
    ) {
      return;
    }

    const errs = validateSubmission();
    setFieldErrors(errs);
    const errorKeys = Object.keys(errs) as FormFieldKey[];
    if (errorKeys.length > 0) {
      await alertSwal({
        title: 'Thông tin khai báo chưa hợp lệ',
        text: errs[errorKeys[0]] ?? 'Vui lòng kiểm tra các trường đánh dấu đỏ trước khi gửi.',
        icon: 'warning',
      });
      firstErrorRef.current?.focus();
      return;
    }

    const parsedDependents = Math.max(0, Math.min(10, Number.parseInt(dependentsCount, 10) || 0));

    const confirmed = await confirmSwal({
      title: 'Xác nhận nộp hồ sơ Pre-boarding',
      html: `Hồ sơ của <strong>${escapeSwalHtml(invite.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(invite.employee_code)}</span>) sẽ được đồng bộ trực tiếp vào phân hệ Core HR &amp; Onboarding để chuẩn bị Hợp đồng thử việc và tài khoản SSO.<br/><br/>Cam kết các thông tin CCCD (<span class="font-mono">${escapeSwalHtml(nationalId.trim())}</span>), MST (<span class="font-mono">${escapeSwalHtml(taxCode.trim())}</span>) và Ngân hàng (<strong>${escapeSwalHtml(bankName)}</strong> · <span class="font-mono">${escapeSwalHtml(bankAccountNo.trim())}</span>) là chính xác?`,
      confirmText: 'Xác nhận gửi hồ sơ',
      cancelText: 'Kiểm tra lại',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const payload: PreboardingSubmissionData = {
        personal_email: personalEmail.trim() || invite.personal_email,
        phone: phone.trim() || invite.phone,
        gender,
        date_of_birth: dateOfBirth,
        national_id: nationalId.trim(),
        national_id_issue_date: nationalIdIssueDate,
        national_id_issue_place: nationalIdIssuePlace.trim(),
        tax_code: taxCode.trim(),
        social_insurance_no: socialInsuranceNo.trim() || undefined,
        bank_name: bankName.trim(),
        bank_account_no: bankAccountNo.trim(),
        dependents_count: parsedDependents,
        address: address.trim(),
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_phone: emergencyContactPhone.trim(),
        emergency_contact_relation: emergencyContactRelation.trim(),
        id_card_file_name: idCardFileName.trim() || undefined,
        degree_file_name: degreeFileName.trim() || undefined,
      };

      const { invite: updatedInvite } = submitPreboardingInfo(activeToken, payload);
      setIsManualUnlocked(false);
      setInvite(updatedInvite);
      setRuntimeEmployees(getAllRuntimeEmployees());

      if (typeof fetch === 'function') {
        fetch('/api/hrm/lifecycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'submit_preboarding_info',
            token: activeToken,
            submission: payload,
          }),
        }).catch(() => {});
      }

      showToast(
        'Đã nộp hồ sơ Pre-boarding',
        `${updatedInvite.full_name} (${updatedInvite.employee_code}) — Chờ Phòng Nhân sự xác minh.`,
        'success'
      );

      const submittedTimeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      await alertSwal({
        title: 'Hoàn tất khai báo Pre-boarding',
        html: `Cảm ơn <strong>${escapeSwalHtml(updatedInvite.full_name)}</strong>! Hồ sơ nhận việc mã <span class="font-mono">${escapeSwalHtml(updatedInvite.employee_code)}</span> đã được ghi nhận lúc <span class="font-mono">${escapeSwalHtml(submittedTimeStr)}</span>.<br/><br/>Bộ phận CNTT &amp; Nhân sự đang chuẩn bị thẻ nhân viên, thiết bị và Hợp đồng thử việc cho ngày nhận việc <span class="font-mono">${escapeSwalHtml(formatDateVN(updatedInvite.expected_start_date))}</span>.`,
        confirmText: 'Hoàn tất',
        icon: 'success',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Không thể lưu thông tin Pre-boarding.';
      await alertSwal({
        title: 'Không thể gửi hồ sơ',
        text: msg,
        icon: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLocked =
    invite?.status === 'EXPIRED' ||
    (invite?.status === 'VERIFIED' && !effectiveManualUnlocked);
  const errorEntries = useMemo(
    () => Object.entries(fieldErrors).filter(([, msg]) => Boolean(msg)),
    [fieldErrors]
  );

  const handleManualUnlock = () => {
    if (!canManualUnlockVerified) return;
    setIsManualUnlocked(true);
    showToast(
      'Đã mở khóa chỉnh sửa thông tin',
      'Bạn có thể cập nhật lại hồ sơ và gửi Phòng Nhân sự xác minh lại.',
      'info'
    );
  };

  if (!isHydrated) {
    return <PreboardingSkeleton />;
  }

  return (
    <div
      className={cn(
        'min-h-[100dvh] font-sans transition-colors',
        theme === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-[#EFF5F3] text-[#11221E]'
      )}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800/80 dark:bg-[#121214]/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E] text-[#FCFEFD] dark:bg-teal-400 dark:text-zinc-950">
              <ClipboardCheck className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                  Lạc Việt HRM
                </span>
                <Badge variant="teal">Pre-boarding Portal</Badge>
              </div>
              <p className="text-xs text-[#415A54] dark:text-zinc-400">
                Cổng tự khai báo hồ sơ pháp lý dành cho ứng viên trúng tuyển
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Đổi giao diện sáng hoặc tối"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#415A54] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
            <Link
              href="/candidate"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-medium text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#11221E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Theo dõi ứng tuyển</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Active Session Verification Banner */}
        {invite && (
          <Card className="border-l-4 border-l-[#0F766E] bg-[#FCFEFD] dark:border-l-teal-400 dark:bg-[#121214]">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                  <KeyRound className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>
                    {urlToken
                      ? 'Đang mở liên kết xác thực Pre-boarding'
                      : `Hồ sơ Pre-boarding của ${invite.full_name}`}
                  </span>
                  {activeToken && (
                    <span className="rounded border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
                      {activeToken}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  Dữ liệu định danh chỉ hiển thị theo đúng liên kết xác thực hoặc tài khoản đang đăng nhập.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty or Invalid Token State */}
        {!invite ? (
          <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
            <CardContent
              className="space-y-4 p-8 text-center"
              role={activeToken ? 'alert' : 'status'}
            >
              {activeToken ? (
                <AlertCircle
                  className="mx-auto h-9 w-9 text-red-600 dark:text-red-400"
                  strokeWidth={1.5}
                />
              ) : (
                <ClipboardCheck
                  className="mx-auto h-9 w-9 text-[#0F766E] dark:text-teal-400"
                  strokeWidth={1.5}
                />
              )}
              <div className="space-y-1">
                <h1 className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                  {activeToken
                    ? 'Không tìm thấy liên kết Pre-boarding hợp lệ'
                    : 'Chưa có hồ sơ Pre-boarding gắn với phiên hiện tại'}
                </h1>
                <p className="mx-auto max-w-lg text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                  {activeToken ? (
                    <>
                      Mã xác thực{' '}
                      <span className="font-mono tabular-nums">{activeToken}</span> không tồn tại
                      hoặc đã hết hạn. Vui lòng kiểm tra lại liên kết trong email Thư mời nhận việc
                      hoặc quay lại trang Theo dõi ứng tuyển.
                    </>
                  ) : (
                    'Để bảo mật thông tin định danh cá nhân, hệ thống chỉ mở biểu mẫu khi tài khoản của bạn đã được Phòng Nhân sự phát hành liên kết nhận việc. Vui lòng quay lại trang Theo dõi ứng tuyển hoặc nhập mã xác thực được cấp qua email.'
                  )}
                </p>
              </div>

              <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
                <Input
                  value={manualTokenInput}
                  onChange={(e) => setManualTokenInput(e.target.value)}
                  placeholder="Nhập mã xác thực từ email thư mời..."
                  className="font-mono text-xs tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => switchToken(manualTokenInput)}
                >
                  Mở liên kết
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <Link href="/candidate">
                  <Button type="button" variant="primary" size="sm">
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Quay lại Theo dõi ứng tuyển
                  </Button>
                </Link>
                <Link href={`/preboarding?token=${encodeURIComponent(SEED_DEMO_TOKEN)}`}>
                  <Button type="button" variant="outline" size="sm">
                    Xem biểu mẫu mẫu (Demo)
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Offer & Onboarding Summary Card */}
            <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
              <CardContent className="space-y-5 p-6">
                <div className="flex flex-col gap-4 border-b border-[#D5E3DF] pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        Mã NV dự kiến: {invite.employee_code}
                      </span>
                      {invite.candidate_code && (
                        <span className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                          · Hồ sơ UV: {invite.candidate_code}
                        </span>
                      )}
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                      Chào mừng gia nhập, {invite.full_name}
                    </h1>
                    <p className="text-sm text-[#415A54] dark:text-zinc-400">
                      {invite.position_name} · {invite.department_name}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Badge variant={PREBOARDING_STATUS_META[invite.status].variant}>
                      {PREBOARDING_STATUS_META[invite.status].label}
                    </Badge>
                    <span className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                      Hạn hoàn tất: {formatDateVN(invite.expires_at)}
                    </span>
                  </div>
                </div>

                {/* Key Offer Metadata */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="flex items-center gap-1.5 text-xs text-[#5C7871] dark:text-zinc-400">
                      <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Ngày dự kiến nhận việc</span>
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatDateVN(invite.expected_start_date)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="flex items-center gap-1.5 text-xs text-[#5C7871] dark:text-zinc-400">
                      <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Quản lý trực tiếp</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      {invite.manager_name}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="flex items-center gap-1.5 text-xs text-[#5C7871] dark:text-zinc-400">
                      <CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Mức lương chính thức (100%)</span>
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVND(invite.official_salary_vnd)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="flex items-center gap-1.5 text-xs text-[#5C7871] dark:text-zinc-400">
                      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Lương thử việc ({invite.probation_salary_percent}%)</span>
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      {formatVND(invite.probation_salary_vnd)}
                    </div>
                  </div>
                </div>

                {/* Status Callout */}
                <div
                  role="status"
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border p-4 text-xs sm:flex-row sm:items-center sm:justify-between',
                    invite.status === 'VERIFIED'
                      ? 'border-[#6EE7B7] bg-[#D1FAE5]/60 text-[#065F46] dark:border-emerald-400/25 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : invite.status === 'SUBMITTED'
                        ? 'border-[#0F766E]/30 bg-[#CBE8E2]/55 text-[#0B4F4A] dark:border-teal-400/25 dark:bg-teal-950/30 dark:text-teal-300'
                        : 'border-amber-600/30 bg-amber-50/80 text-amber-900 dark:border-amber-400/25 dark:bg-amber-950/30 dark:text-amber-300'
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold">
                      {isEmployeeActivated
                        ? 'HR đã duyệt hồ sơ · Đã cấp quyền Nhân viên (EMPLOYEE)'
                        : PREBOARDING_STATUS_META[invite.status].label}
                    </div>
                    <p className="leading-relaxed opacity-95">
                      {isEmployeeActivated
                        ? 'Phòng Nhân sự đã xác minh hợp lệ hồ sơ Pre-boarding và kích hoạt quyền Nhân viên cho bạn. Biểu mẫu khai báo đã được đóng tự động.'
                        : invite.status === 'VERIFIED' && effectiveManualUnlocked
                          ? 'Đã mở khóa chỉnh sửa thông tin. Sau khi lưu cập nhật, hồ sơ sẽ chuyển về trạng thái chờ Phòng Nhân sự xác minh lại.'
                          : PREBOARDING_STATUS_META[invite.status].desc}
                    </p>
                    {isEmployeeActivated && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 font-mono text-[11px] tabular-nums">
                        <span>
                          Mã NV: <strong className="font-semibold">{employeeCodeDisplay}</strong>
                        </span>
                        <span className="break-all">
                          Email công ty: <strong className="font-semibold">{companyEmail}</strong>
                        </span>
                      </div>
                    )}
                    {invite.submitted_at && (
                      <p className="font-mono text-[11px] tabular-nums opacity-85">
                        Nộp lần cuối: {formatDateVN(invite.submitted_at)}
                        {invite.verified_by
                          ? ` · Xác minh bởi: ${invite.verified_by} (${formatDateVN(invite.verified_at || invite.submitted_at)})`
                          : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isEmployeeActivated ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleEnterEmployeeWorkspace}
                        disabled={isEnteringWorkspace}
                        className="min-h-[38px] w-full shrink-0 sm:w-auto"
                      >
                        <span>
                          {isEnteringWorkspace
                            ? 'Đang chuyển không gian...'
                            : 'Vào không gian làm việc Nhân viên'}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </Button>
                    ) : (
                      <>
                        {invite.status === 'VERIFIED' &&
                          !effectiveManualUnlocked &&
                          canManualUnlockVerified && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleManualUnlock}
                              className="shrink-0 border-[#0F766E]/40 bg-[#FCFEFD] text-[#0B4F4A] hover:bg-[#E8F3EF] dark:border-teal-400/40 dark:bg-zinc-900 dark:text-teal-300 dark:hover:bg-zinc-800"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Chỉnh sửa thông tin
                            </Button>
                          )}
                        {!isLocked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handlePrefillSample}
                            className="shrink-0 bg-[#FCFEFD] dark:bg-zinc-900"
                          >
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Điền nhanh dữ liệu mẫu
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employee Activated Confirmation Card or Pre-boarding Self-Fill Form */}
            {isEmployeeActivated ? (
              <Card className="border border-[#6EE7B7]/80 bg-[#FCFEFD] shadow-sm dark:border-emerald-400/25 dark:bg-[#121214]">
                <CardContent className="space-y-6 p-6 sm:p-8">
                  <div className="flex flex-col gap-4 border-b border-[#D5E3DF] pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                            Tài khoản Nhân viên đã sẵn sàng
                          </h2>
                          <Badge variant="success">Nhân viên · EMPLOYEE</Badge>
                        </div>
                        <p className="text-sm leading-relaxed text-[#415A54] dark:text-zinc-400">
                          Hồ sơ Pre-boarding của bạn đã được Phòng Nhân sự xác minh hoàn tất và
                          chuyển sang quyền <strong className="font-semibold text-[#11221E] dark:text-zinc-100">Nhân viên</strong>.
                          Bạn không cần khai báo lại biểu mẫu này và có thể bắt đầu sử dụng các chức
                          năng nội bộ ngay bây giờ.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                    <div className="min-w-0 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                        <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        <span>Mã nhân viên</span>
                      </div>
                      <div className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                        {employeeCodeDisplay || 'Đang đồng bộ'}
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        <span>Email công ty</span>
                      </div>
                      <div className="mt-1.5 break-all font-mono text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                        {companyEmail || 'Đang đồng bộ'}
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        <span>Vai trò hệ thống</span>
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-[#0F766E] dark:text-teal-400">
                        Nhân viên (EMPLOYEE)
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                      <div className="font-medium text-[#11221E] dark:text-zinc-200">
                        {linkedEmployee?.position_name || invite.position_name} ·{' '}
                        {linkedEmployee?.department_name || invite.department_name}
                      </div>
                      <p>
                        {invite.verified_by
                          ? `Xác minh bởi ${invite.verified_by} vào ngày ${formatDateVN(invite.verified_at || invite.submitted_at || invite.created_at)}.`
                          : 'Hồ sơ Pre-boarding đã được niêm phong sau khi duyệt.'}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      onClick={handleEnterEmployeeWorkspace}
                      disabled={isEnteringWorkspace}
                      className="min-h-[44px] w-full shrink-0 sm:w-auto"
                    >
                      <Briefcase className="h-4 w-4" strokeWidth={1.75} />
                      <span>
                        {isEnteringWorkspace
                          ? 'Đang mở không gian làm việc...'
                          : 'Vào không gian làm việc Nhân viên'}
                      </span>
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {errorEntries.length > 0 && (
                <Card className="border-l-4 border-l-red-600 bg-red-50/70 dark:border-l-red-400 dark:bg-red-950/25">
                  <CardContent className="p-4 text-xs text-red-900 dark:text-red-200" role="alert">
                    <div className="font-semibold">
                      Vui lòng kiểm tra lại {errorEntries.length} thông tin bắt buộc:
                    </div>
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                      {errorEntries.map(([key, msg]) => (
                        <li key={key}>{msg}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Section 1: Personal & Legal Identification */}
              <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/80">
                    <UserCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      1. Thông tin cá nhân, Định danh CCCD, Thuế TNCN &amp; BHXH
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-personal-email"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Email cá nhân nhận thông báo
                      </label>
                      <Input
                        id="pb-personal-email"
                        type="email"
                        autoComplete="email"
                        disabled={isLocked}
                        value={personalEmail}
                        onChange={(e) => setPersonalEmail(e.target.value)}
                        placeholder="ungvien@gmail.com"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="pb-phone"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Số điện thoại cá nhân
                      </label>
                      <Input
                        id="pb-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        disabled={isLocked}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="font-mono tabular-nums"
                        placeholder="0909334455"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-gender"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Giới tính
                      </label>
                      <Select
                        id="pb-gender"
                        disabled={isLocked}
                        value={gender}
                        onValueChange={(v) => setGender(v as 'Nam' | 'Nữ')}
                        options={[
                          { label: 'Nam', value: 'Nam' },
                          { label: 'Nữ', value: 'Nữ' },
                        ]}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="pb-dob"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Ngày tháng năm sinh
                      </label>
                      <Input
                        id="pb-dob"
                        type="date"
                        disabled={isLocked}
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-cccd"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Số Căn cước công dân (CCCD 12 số) *
                      </label>
                      <Input
                        ref={fieldErrors.national_id ? firstErrorRef : undefined}
                        id="pb-cccd"
                        inputMode="numeric"
                        disabled={isLocked}
                        value={nationalId}
                        onChange={(e) => setNationalId(e.target.value.replace(/[^\d]/g, ''))}
                        maxLength={12}
                        aria-invalid={Boolean(fieldErrors.national_id)}
                        className="font-mono tabular-nums"
                        placeholder="079097014582"
                        required
                      />
                      {fieldErrors.national_id && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.national_id}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="pb-cccd-date"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Ngày cấp CCCD *
                      </label>
                      <Input
                        id="pb-cccd-date"
                        type="date"
                        disabled={isLocked}
                        value={nationalIdIssueDate}
                        onChange={(e) => setNationalIdIssueDate(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.national_id_issue_date)}
                        className="font-mono tabular-nums"
                        required
                      />
                      {fieldErrors.national_id_issue_date && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.national_id_issue_date}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="pb-cccd-place"
                      className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                    >
                      Nơi cấp CCCD *
                    </label>
                    <Input
                      id="pb-cccd-place"
                      disabled={isLocked}
                      value={nationalIdIssuePlace}
                      onChange={(e) => setNationalIdIssuePlace(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.national_id_issue_place)}
                      placeholder="Cục Cảnh sát QLHC về TTXH"
                      required
                    />
                    {fieldErrors.national_id_issue_place && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {fieldErrors.national_id_issue_place}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-tax-code"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Mã số thuế TNCN (10 chữ số) *
                      </label>
                      <Input
                        id="pb-tax-code"
                        inputMode="numeric"
                        disabled={isLocked}
                        value={taxCode}
                        onChange={(e) => setTaxCode(e.target.value.replace(/[^\d-]/g, ''))}
                        maxLength={14}
                        aria-invalid={Boolean(fieldErrors.tax_code)}
                        className="font-mono tabular-nums"
                        placeholder="8462910384"
                        required
                      />
                      {fieldErrors.tax_code && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.tax_code}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="pb-bhxh"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Mã số Bảo hiểm xã hội (BHXH 10 số, nếu đã có)
                      </label>
                      <Input
                        id="pb-bhxh"
                        inputMode="numeric"
                        disabled={isLocked}
                        value={socialInsuranceNo}
                        onChange={(e) => setSocialInsuranceNo(e.target.value.replace(/[^\d]/g, ''))}
                        maxLength={10}
                        className="font-mono tabular-nums"
                        placeholder="7924819205"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-dependents"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Số người phụ thuộc giảm trừ gia cảnh
                      </label>
                      <Input
                        id="pb-dependents"
                        type="number"
                        min={0}
                        max={10}
                        inputMode="numeric"
                        disabled={isLocked}
                        value={dependentsCount}
                        onChange={(e) => setDependentsCount(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                      <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                        Mức giảm trừ chuẩn: <span className="font-mono tabular-nums">4.400.000 đ/người/tháng</span> (khi có hồ sơ chứng minh hợp lệ).
                      </p>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="pb-address"
                      className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                    >
                      Địa chỉ cư trú hiện tại (để nhận thư từ &amp; đăng ký y tế) *
                    </label>
                    <Input
                      id="pb-address"
                      disabled={isLocked}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.address)}
                      placeholder="Số nhà, tên đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố"
                      required
                    />
                    {fieldErrors.address && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {fieldErrors.address}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Section 2: Bank Account for Payroll */}
              <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/80">
                    <CreditCard className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      2. Tài khoản Ngân hàng nhận lương chính chủ
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-bank-name"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Ngân hàng thụ hưởng *
                      </label>
                      <Select
                        id="pb-bank-name"
                        disabled={isLocked}
                        value={bankName}
                        onValueChange={setBankName}
                        options={BANK_OPTIONS}
                      />
                      {fieldErrors.bank_name && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.bank_name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="pb-bank-acc"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Số tài khoản ngân hàng *
                      </label>
                      <Input
                        id="pb-bank-acc"
                        inputMode="numeric"
                        disabled={isLocked}
                        value={bankAccountNo}
                        onChange={(e) => setBankAccountNo(e.target.value.trim())}
                        aria-invalid={Boolean(fieldErrors.bank_account_no)}
                        className="font-mono tabular-nums"
                        placeholder="0071001298456"
                        required
                      />
                      {fieldErrors.bank_account_no && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.bank_account_no}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Section 3: Emergency Contact */}
              <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/80">
                    <HeartHandshake
                      className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                      strokeWidth={1.5}
                    />
                    <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      3. Người liên hệ khẩn cấp (Emergency Contact)
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pb-emg-name"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Họ và tên người thân liên hệ *
                      </label>
                      <Input
                        id="pb-emg-name"
                        disabled={isLocked}
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.emergency_contact_name)}
                        placeholder="Ví dụ: Trần Thu Trang"
                        required
                      />
                      {fieldErrors.emergency_contact_name && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.emergency_contact_name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="pb-emg-relation"
                        className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                      >
                        Mối quan hệ với nhân sự
                      </label>
                      <Select
                        id="pb-emg-relation"
                        disabled={isLocked}
                        value={emergencyContactRelation}
                        onValueChange={setEmergencyContactRelation}
                        options={RELATION_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="sm:max-w-sm">
                    <label
                      htmlFor="pb-emg-phone"
                      className="mb-1 block text-sm font-medium text-[#11221E] dark:text-zinc-200"
                    >
                      Số điện thoại khẩn cấp *
                    </label>
                    <Input
                      id="pb-emg-phone"
                      type="tel"
                      inputMode="tel"
                      disabled={isLocked}
                      value={emergencyContactPhone}
                      onChange={(e) =>
                        setEmergencyContactPhone(e.target.value.replace(/[^\d]/g, ''))
                      }
                      aria-invalid={Boolean(fieldErrors.emergency_contact_phone)}
                      className="font-mono tabular-nums"
                      placeholder="0908667788"
                      required
                    />
                    {fieldErrors.emergency_contact_phone && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {fieldErrors.emergency_contact_phone}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Section 4: Supporting Documents */}
              <Card className="bg-[#FCFEFD] dark:bg-[#121214]">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/80">
                    <FileUp className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      4. Tài liệu đính kèm (Bản chụp CCCD &amp; Bằng cấp chuyên môn)
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-dashed border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <label
                        htmlFor="pb-idcard-file"
                        className="block text-xs font-semibold text-[#11221E] dark:text-zinc-100"
                      >
                        Bản chụp CCCD 2 mặt / VNeID mức 2
                      </label>
                      <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
                        Chấp nhận PDF, JPG, PNG · Dung lượng tối đa 5 MB
                      </p>
                      <input
                        id="pb-idcard-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        disabled={isLocked}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setIdCardFileName(file.name);
                        }}
                        className="mt-2.5 block w-full text-xs text-[#415A54] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0F766E] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#0D5F58] dark:text-zinc-300 dark:file:bg-teal-400 dark:file:text-zinc-950"
                      />
                      {idCardFileName && (
                        <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-[#0F766E] dark:text-teal-400">
                          <FileCheck2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">{idCardFileName}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-dashed border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <label
                        htmlFor="pb-degree-file"
                        className="block text-xs font-semibold text-[#11221E] dark:text-zinc-100"
                      >
                        Bằng tốt nghiệp / Chứng chỉ chuyên môn
                      </label>
                      <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
                        Chấp nhận PDF, JPG, PNG · Dung lượng tối đa 10 MB
                      </p>
                      <input
                        id="pb-degree-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        disabled={isLocked}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDegreeFileName(file.name);
                        }}
                        className="mt-2.5 block w-full text-xs text-[#415A54] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0F766E] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#0D5F58] dark:text-zinc-300 dark:file:bg-teal-400 dark:file:text-zinc-950"
                      />
                      {degreeFileName && (
                        <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-[#0F766E] dark:text-teal-400">
                          <FileCheck2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">{degreeFileName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sticky Submit Footer */}
              <div className="sticky bottom-0 z-30 flex flex-col gap-3 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] px-5 py-4 dark:border-zinc-800/80 dark:bg-[#121214] sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[#415A54] dark:text-zinc-400">
                  {invite.status === 'VERIFIED' && !effectiveManualUnlocked
                    ? canManualUnlockVerified
                      ? 'Hồ sơ đã được Phòng Nhân sự xác minh. Nhấn "Chỉnh sửa thông tin" nếu bạn cần cập nhật lại.'
                      : 'Nhân sự đã chốt trạng thái chính thức / nghỉ việc — hồ sơ Pre-boarding đã được niêm phong.'
                    : 'Dữ liệu cá nhân được bảo mật theo quy chuẩn An toàn thông tin nội bộ Lạc Việt HRM.'}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Link href="/candidate">
                    <Button type="button" variant="outline">
                      Theo dõi ứng tuyển
                    </Button>
                  </Link>
                  {invite.status === 'VERIFIED' &&
                    !effectiveManualUnlocked &&
                    canManualUnlockVerified && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleManualUnlock}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        Chỉnh sửa thông tin
                      </Button>
                    )}
                  {!isLocked && (
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                      {isSubmitting
                        ? 'Đang gửi hồ sơ...'
                        : invite.status === 'SUBMITTED' || invite.status === 'VERIFIED'
                          ? 'Cập nhật lại hồ sơ Pre-boarding'
                          : 'Gửi hồ sơ nhận việc'}
                    </Button>
                  )}
                </div>
              </div>
            </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function PreboardingPortalPage() {
  return (
    <Suspense fallback={<PreboardingSkeleton />}>
      <PreboardingPortalContent />
    </Suspense>
  );
}
