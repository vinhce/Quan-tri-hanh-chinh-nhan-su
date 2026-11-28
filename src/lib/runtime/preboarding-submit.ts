import type {
  Employee,
  OnboardingRecord,
  PreboardingInvite,
  PreboardingStatus,
  PreboardingSubmissionData,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  saveRuntimeEmployee,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  getOnboardingRecords,
  getPreboardingInvites,
} from './onboarding-store';
import {
  STORAGE_ONBOARDING_KEY,
  STORAGE_PREBOARDING_KEY,
  writeStorageArray,
} from './storage';
import {
  activateEmployeeAccountIfPreboardingVerified,
  emailsMatchInternalAlias,
  findLinkedEmployeeForPreboarding,
  getSystemUsers,
} from './users-auth';

function isEmployeeLockedForVerifiedPreboarding(
  emp: Employee | null | undefined
): boolean {
  if (!emp) return false;
  return (
    emp.employment_status === 'OFFICIAL' ||
    emp.employment_status === 'ACTIVE' ||
    emp.employment_status === 'RESIGNED'
  );
}

export function savePreboardingDraft(
  token: string,
  draft: Partial<PreboardingSubmissionData>
): PreboardingInvite | null {
  const cleanToken = token?.trim();
  if (!cleanToken) return null;

  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.token === cleanToken || item.id === cleanToken
  );
  if (idx < 0) return null;

  const existing = invites[idx];
  if (existing.status === 'EXPIRED') return null;

  const existingEmp = findLinkedEmployeeForPreboarding(existing);
  const wasVerified = existing.status === 'VERIFIED';
  if (wasVerified && isEmployeeLockedForVerifiedPreboarding(existingEmp)) {
    return null;
  }

  const mergedData: PreboardingSubmissionData = {
    national_id: '',
    tax_code: '',
    bank_name: 'Vietcombank',
    bank_account_no: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    ...existing.submitted_data,
    ...draft,
  };

  const nextStatus: PreboardingStatus = wasVerified ? 'PENDING' : existing.status;
  const updatedInvite: PreboardingInvite = {
    ...existing,
    status: nextStatus,
    submitted_data: mergedData,
    verified_by: wasVerified ? undefined : existing.verified_by,
    verified_at: wasVerified ? undefined : existing.verified_at,
  };

  const nextInvites = invites.map((item, i) => (i === idx ? updatedInvite : item));
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  if (wasVerified && existingEmp) {
    saveRuntimeEmployee({
      ...existingEmp,
      preboarding_status: 'PENDING',
    });
  }

  return updatedInvite;
}

export function submitPreboardingInfo(
  token: string,
  submission: PreboardingSubmissionData
): { invite: PreboardingInvite; employee: Employee | null } {
  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.token === token.trim() || item.id === token.trim()
  );
  if (idx < 0) {
    throw new Error('Không tìm thấy liên kết Pre-boarding hợp lệ hoặc liên kết đã hết hạn.');
  }

  const targetInvite = invites[idx];
  if (targetInvite.status === 'EXPIRED') {
    throw new Error('Liên kết Pre-boarding đã hết hạn, không thể nộp hồ sơ.');
  }

  const existingEmp = findLinkedEmployeeForPreboarding(targetInvite);
  const wasVerified = targetInvite.status === 'VERIFIED';
  if (wasVerified && isEmployeeLockedForVerifiedPreboarding(existingEmp)) {
    throw new Error(
      'Nhân sự đã ký hợp đồng chính thức hoặc đã nghỉ việc, không thể mở khóa chỉnh sửa hồ sơ Pre-boarding đã xác minh.'
    );
  }

  if (!submission.national_id?.trim() || !submission.bank_account_no?.trim()) {
    throw new Error('Vui lòng điền đầy đủ Số CCCD và Tài khoản ngân hàng nhận lương.');
  }

  const nowIso = new Date().toISOString();
  const updatedInvite: PreboardingInvite = {
    ...targetInvite,
    status: 'SUBMITTED',
    submitted_data: { ...targetInvite.submitted_data, ...submission },
    submitted_at: nowIso,
    verified_by: wasVerified ? undefined : targetInvite.verified_by,
    verified_at: wasVerified ? undefined : targetInvite.verified_at,
  };

  const nextInvites = invites.map((item, i) => (i === idx ? updatedInvite : item));
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  let updatedEmployee: Employee | null = null;
  if (existingEmp) {
    if (wasVerified) {
      // Do NOT overwrite verified legal/payroll fields on Employee until HR re-verifies
      updatedEmployee = {
        ...existingEmp,
        preboarding_status: 'SUBMITTED',
      };
      saveRuntimeEmployee(updatedEmployee);
    } else {
      updatedEmployee = {
        ...existingEmp,
        personal_email: submission.personal_email?.trim() || existingEmp.personal_email,
        phone: submission.phone?.trim() || existingEmp.phone,
        gender: submission.gender || existingEmp.gender,
        date_of_birth: submission.date_of_birth || existingEmp.date_of_birth,
        national_id: submission.national_id.trim(),
        national_id_issue_date: submission.national_id_issue_date,
        national_id_issue_place: submission.national_id_issue_place,
        tax_code: submission.tax_code?.trim() || existingEmp.tax_code,
        social_insurance_no:
          submission.social_insurance_no?.trim() || existingEmp.social_insurance_no,
        bank_name: submission.bank_name.trim(),
        bank_account_no: submission.bank_account_no.trim(),
        dependents_count: submission.dependents_count ?? existingEmp.dependents_count,
        address: submission.address?.trim() || existingEmp.address,
        emergency_contact_name: submission.emergency_contact_name.trim(),
        emergency_contact_phone: submission.emergency_contact_phone.trim(),
        emergency_contact_relation: submission.emergency_contact_relation?.trim(),
        preboarding_status: 'SUBMITTED',
      };
      saveRuntimeEmployee(updatedEmployee);
    }
  }

  pushNotification({
    title: wasVerified
      ? `Ứng viên cập nhật lại hồ sơ Pre-boarding: ${targetInvite.full_name}`
      : `Ứng viên hoàn tất khai báo Pre-boarding: ${targetInvite.full_name}`,
    message: `${targetInvite.full_name} (${targetInvite.employee_code}) đã nộp thông tin CCCD, MST, ngân hàng & liên hệ khẩn cấp. Chờ HR rà soát.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'SUPER_ADMIN'],
    nav_id: 'onboarding',
  });

  recordAuditLog({
    actor_name: targetInvite.full_name,
    actor_code: targetInvite.employee_code,
    actor_role: 'CANDIDATE',
    action: 'PREBOARDING_SUBMIT',
    target: `${targetInvite.employee_code} (${targetInvite.token})`,
    detail: wasVerified
      ? `Ứng viên gửi lại bản chỉnh sửa hồ sơ Pre-boarding (chờ HR duyệt lại trước khi đồng bộ lương/CCCD).`
      : `Ứng viên tự khai báo hoàn tất hồ sơ Pre-boarding trực tuyến (CCCD, MST, Ngân hàng ${submission.bank_name}).`,
  });

  return { invite: updatedInvite, employee: updatedEmployee };
}

export const submitPreboardingInvite = submitPreboardingInfo;

export function hrQuickUpdatePreboarding(
  inviteIdOrToken: string,
  patch: Partial<PreboardingSubmissionData> & {
    verify?: boolean;
    actorName?: string;
  }
): { invite: PreboardingInvite; employee: Employee | null } {
  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.id === inviteIdOrToken || item.token === inviteIdOrToken
  );
  if (idx < 0) {
    throw new Error('Không tìm thấy hồ sơ Pre-boarding cần cập nhật.');
  }

  const nowIso = new Date().toISOString();
  const target = invites[idx];
  if (target.status === 'EXPIRED') {
    throw new Error('Liên kết Pre-boarding này đã hết hạn, không thể cập nhật hoặc duyệt.');
  }

  const existingEmp = findLinkedEmployeeForPreboarding(target);
  if (patch.verify) {
    if (existingEmp?.employment_status === 'RESIGNED') {
      throw new Error('Nhân sự đã hoàn tất thủ tục nghỉ việc (RESIGNED), không thể duyệt kích hoạt Pre-boarding.');
    }
    const existingUsers = getSystemUsers();
    const linkedLockedUser = existingUsers.find(
      (u) =>
        u.account_status === 'LOCKED' &&
        (u.employee_code === (existingEmp?.employee_code ?? target.employee_code) ||
          (Boolean(existingEmp?.id) && u.employee_id === existingEmp!.id) ||
          (Boolean(existingEmp?.email) && emailsMatchInternalAlias(u.email, existingEmp!.email)))
    );
    if (linkedLockedUser) {
      throw new Error('Tài khoản nhân sự đang bị khóa (LOCKED), không thể duyệt kích hoạt Pre-boarding.');
    }
  }

  const { verify: shouldVerify, actorName: patchActorName, ...cleanPatch } = patch;
  const mergedData: PreboardingSubmissionData = {
    national_id: cleanPatch.national_id ?? target.submitted_data?.national_id ?? '',
    tax_code: cleanPatch.tax_code ?? target.submitted_data?.tax_code ?? '',
    bank_name: cleanPatch.bank_name ?? target.submitted_data?.bank_name ?? 'Vietcombank',
    bank_account_no:
      cleanPatch.bank_account_no ?? target.submitted_data?.bank_account_no ?? '',
    emergency_contact_name:
      cleanPatch.emergency_contact_name ??
      target.submitted_data?.emergency_contact_name ??
      '',
    emergency_contact_phone:
      cleanPatch.emergency_contact_phone ??
      target.submitted_data?.emergency_contact_phone ??
      '',
    ...target.submitted_data,
    ...cleanPatch,
  };

  const nextStatus = shouldVerify ? 'VERIFIED' : target.status === 'PENDING' ? 'SUBMITTED' : target.status;
  const updatedInvite: PreboardingInvite = {
    ...target,
    submitted_data: mergedData,
    status: nextStatus,
    verified_by: shouldVerify ? patchActorName || 'HR Manager' : target.verified_by,
    verified_at: shouldVerify ? nowIso : target.verified_at,
  };

  writeStorageArray(
    STORAGE_PREBOARDING_KEY,
    invites.map((item, i) => (i === idx ? updatedInvite : item))
  );

  let updatedEmployee: Employee | null = null;
  if (existingEmp) {
    updatedEmployee = {
      ...existingEmp,
      personal_email: mergedData.personal_email?.trim() || existingEmp.personal_email,
      phone: mergedData.phone?.trim() || existingEmp.phone,
      gender: mergedData.gender || existingEmp.gender,
      date_of_birth: mergedData.date_of_birth || existingEmp.date_of_birth,
      national_id: mergedData.national_id || existingEmp.national_id,
      national_id_issue_date:
        mergedData.national_id_issue_date ?? existingEmp.national_id_issue_date,
      national_id_issue_place:
        mergedData.national_id_issue_place ?? existingEmp.national_id_issue_place,
      tax_code: mergedData.tax_code || existingEmp.tax_code,
      social_insurance_no:
        mergedData.social_insurance_no || existingEmp.social_insurance_no,
      bank_name: mergedData.bank_name || existingEmp.bank_name,
      bank_account_no: mergedData.bank_account_no || existingEmp.bank_account_no,
      dependents_count: mergedData.dependents_count ?? existingEmp.dependents_count,
      address: mergedData.address ?? existingEmp.address,
      emergency_contact_name:
        mergedData.emergency_contact_name || existingEmp.emergency_contact_name,
      emergency_contact_phone:
        mergedData.emergency_contact_phone || existingEmp.emergency_contact_phone,
      emergency_contact_relation:
        mergedData.emergency_contact_relation ??
        existingEmp.emergency_contact_relation,
      preboarding_status: nextStatus === 'VERIFIED' ? 'VERIFIED' : 'SUBMITTED',
    };
    saveRuntimeEmployee(updatedEmployee);
  }

  if (patch.verify) {
    const actorName = patch.actorName || 'HR Manager';
    const activatedUser = activateEmployeeAccountIfPreboardingVerified(
      updatedEmployee?.employee_code ?? updatedInvite.employee_code
    );

    if (activatedUser) {
      const onboardingRecords = getOnboardingRecords();
      const onbIdx = onboardingRecords.findIndex(
        (rec) =>
          rec.preboarding_token === updatedInvite.token ||
          rec.employee_code ===
            (updatedEmployee?.employee_code ?? updatedInvite.employee_code) ||
          (Boolean(updatedEmployee?.id) && rec.employee_id === updatedEmployee!.id)
      );

      if (onbIdx >= 0) {
        const targetOnb = onboardingRecords[onbIdx];
        let checklistChanged = false;
        const hasSpecificSsoTask = targetOnb.checklist.some(
          (chk) => chk.task_code === 'IT_EMAIL_SSO'
        );
        const updatedChecklist = targetOnb.checklist.map((chk) => {
          const isTargetItTask = hasSpecificSsoTask
            ? chk.task_code === 'IT_EMAIL_SSO'
            : chk.group === 'IT';
          if (!isTargetItTask || chk.completed) return chk;
          checklistChanged = true;
          return {
            ...chk,
            completed: true,
            completed_at: chk.completed_at ?? nowIso,
            completed_by: chk.completed_by ?? actorName,
            side_effect_summary:
              chk.side_effect_summary ??
              `Tự động kích hoạt tài khoản Nhân viên (${activatedUser.role_code}, ACTIVE) khi HR duyệt hồ sơ Pre-boarding.`,
          };
        });

        if (checklistChanged) {
          const allDone = updatedChecklist.every((c) => c.completed);
          const updatedOnb: OnboardingRecord = {
            ...targetOnb,
            status: allDone ? 'COMPLETED' : targetOnb.status,
            checklist: updatedChecklist,
          };
          writeStorageArray(
            STORAGE_ONBOARDING_KEY,
            onboardingRecords.map((item, i) => (i === onbIdx ? updatedOnb : item))
          );
        }
      }
    }
  }

  return { invite: updatedInvite, employee: updatedEmployee };
}

export function verifyPreboardingInvite(
  inviteIdOrToken: string,
  actorName = 'HR Manager'
): { invite: PreboardingInvite; employee: Employee | null } {
  return hrQuickUpdatePreboarding(inviteIdOrToken, {
    verify: true,
    actorName,
  });
}
