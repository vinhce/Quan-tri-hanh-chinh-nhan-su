import {
  MOCK_EMPLOYEES,
} from '@/mock/employees';
import type {
  Employee,
  OnboardingRecord,
  OnboardingTaskGroup,
} from '@/mock/types';
import {
  mergeWithRuntimeEmployees,
  saveRuntimeEmployee,
} from './core-entities';
import {
  getOnboardingRecords,
} from './onboarding-store';
import {
  triggerOnboardingGroupSideEffectInternal,
} from './onboarding-tasks';
import {
  STORAGE_ONBOARDING_KEY,
  emitRuntimeUpdated,
  writeStorageArray,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function toggleOnboardingChecklistItem(
  onboardingId: string,
  itemId: string,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  let itemFound = false;
  let toggledGroup: OnboardingTaskGroup | null = null;
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => {
    if (chk.id !== itemId) return chk;
    itemFound = true;
    toggledGroup = chk.group;
    const nextCompleted = !chk.completed;
    return {
      ...chk,
      completed: nextCompleted,
      completed_at: nextCompleted ? nowIso : undefined,
      completed_by: nextCompleted ? actorName : undefined,
    };
  });

  if (!itemFound) return null;

  const isAnyUncompleted = updatedChecklist.some((item) => !item.completed);
  const nextStatus =
    isAnyUncompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (toggledGroup) {
    const groupAllDone = updatedChecklist
      .filter((c) => c.group === toggledGroup)
      .every((c) => c.completed);
    if (groupAllDone) {
      triggerOnboardingGroupSideEffectInternal(updatedRecord, toggledGroup, actorName);
    }
  }

  return updatedRecord;
}

export function toggleOnboardingChecklistGroup(
  onboardingId: string,
  group: OnboardingTaskGroup,
  targetCompleted: boolean,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => {
    if (chk.group !== group) return chk;
    return {
      ...chk,
      completed: targetCompleted,
      completed_at: targetCompleted ? nowIso : undefined,
      completed_by: targetCompleted ? actorName : undefined,
    };
  });

  const isAnyUncompleted = updatedChecklist.some((item) => !item.completed);
  const nextStatus =
    isAnyUncompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (targetCompleted) {
    triggerOnboardingGroupSideEffectInternal(updatedRecord, group, actorName);
  }

  return updatedRecord;
}

export function toggleAllOnboardingChecklist(
  onboardingId: string,
  targetCompleted: boolean,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => ({
    ...chk,
    completed: targetCompleted,
    completed_at: targetCompleted ? nowIso : undefined,
    completed_by: targetCompleted ? actorName : undefined,
  }));

  const nextStatus =
    !targetCompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : targetCompleted
      ? 'COMPLETED'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (targetCompleted) {
    triggerOnboardingGroupSideEffectInternal(updatedRecord, 'IT', actorName);
    triggerOnboardingGroupSideEffectInternal(updatedRecord, 'HR', actorName);
  }

  return updatedRecord;
}

export function completeOnboardingRecord(onboardingId: string): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const completedChecklist = target.checklist.map((chk) =>
    chk.completed
      ? chk
      : {
          ...chk,
          completed: true,
          completed_at: nowIso,
        }
  );

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: 'COMPLETED',
    checklist: completedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );

  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  // Keep corresponding employee in PROBATION after onboarding completion (never skip directly to ACTIVE/OFFICIAL)
  const allKnownEmployees = mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
  const matchedEmp = allKnownEmployees.find(
    (emp) =>
      emp.id === target.employee_id ||
      emp.employee_code === target.employee_code
  );

  if (
    matchedEmp &&
    (matchedEmp.employment_status === 'PROBATION' ||
      matchedEmp.employment_status === 'PENDING_ONBOARD')
  ) {
    const probationEmployee: Employee = {
      ...matchedEmp,
      employment_status: 'PROBATION',
      contract_status:
        matchedEmp.contract_status === 'PENDING_SIGN'
          ? 'ACTIVE'
          : matchedEmp.contract_status,
    };
    saveRuntimeEmployee(probationEmployee);
    setUserActiveByEmployee({
      employeeId: probationEmployee.id,
      employeeCode: probationEmployee.employee_code,
      email: probationEmployee.email,
      fullName: probationEmployee.full_name,
      departmentName: probationEmployee.department_name,
      positionName: probationEmployee.position_name,
      roleCode: probationEmployee.role_code,
      isActive: true,
      targetStatus: 'ACTIVE',
      actorName: 'Hệ thống Onboarding',
    });
  } else {
    emitRuntimeUpdated();
  }

  return updatedRecord;
}
