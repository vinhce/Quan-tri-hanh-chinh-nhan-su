import {
  MOCK_CONTRACTS,
  MOCK_EMPLOYEES,
} from '@/mock/employees';
import {
  MOCK_COMPANY_ASSETS,
} from '@/mock/onboarding';
import type {
  AssetCategory,
  AssetConditionStatus,
  CompanyAsset,
  EmployeeAssetAssignment,
  EmploymentContract,
} from '@/mock/types';
import {
  mergeWithRuntimeEmployees,
} from './core-entities';
import {
  getOnboardingRecords,
} from './onboarding-store';
import {
  STORAGE_ASSETS_KEY,
  STORAGE_CONTRACTS_KEY,
  STORAGE_EMPLOYEE_ASSETS_KEY,
  STORAGE_ONBOARDING_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Company Assets
// ---------------------------------------------------------------------------
export function inferDefaultAssetValueVnd(category: AssetCategory): number {
  switch (category) {
    case 'LAPTOP':
      return 38000000;
    case 'MONITOR':
      return 11500000;
    case 'PERIPHERAL':
      return 4200000;
    case 'ACCESS_CARD':
    default:
      return 250000;
  }
}

export function getCompanyAssets(): CompanyAsset[] {
  const stored = readStorageArray<CompanyAsset>(STORAGE_ASSETS_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_COMPANY_ASSETS);
}

export function assignCompanyAsset(
  assetId: string,
  employee: { employee_code: string; full_name: string; department_id: string; id?: string },
  assignedDate?: string
): CompanyAsset | null {
  const currentAssets = getCompanyAssets();
  const idx = currentAssets.findIndex(
    (item) => item.id === assetId || item.asset_code === assetId
  );
  if (idx < 0) return null;

  const assignedAtDate = assignedDate ?? new Date().toISOString().slice(0, 10);
  const targetAsset = currentAssets[idx];
  const updatedAsset: CompanyAsset = {
    ...targetAsset,
    status: 'ASSIGNED',
    assigned_to_code: employee.employee_code,
    assigned_to_name: employee.full_name,
    assigned_department_id: employee.department_id,
    assigned_at: assignedAtDate,
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === idx ? updatedAsset : item
  );

  // Also link to matching onboarding record if present
  const onboardingRecords = getOnboardingRecords();
  const onbIdx = onboardingRecords.findIndex(
    (rec) => rec.employee_code === employee.employee_code
  );
  if (
    onbIdx >= 0 &&
    !onboardingRecords[onbIdx].assigned_asset_ids.includes(updatedAsset.id)
  ) {
    const nextOnboarding = onboardingRecords.map((rec, i) =>
      i === onbIdx
        ? {
            ...rec,
            assigned_asset_ids: [...rec.assigned_asset_ids, updatedAsset.id],
          }
        : rec
    );
    writeStorageArray(STORAGE_ONBOARDING_KEY, nextOnboarding);
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  // Record in EmployeeAssetAssignment store
  const matchedEmp = mergeWithRuntimeEmployees(MOCK_EMPLOYEES).find(
    (e) => e.employee_code === employee.employee_code
  );
  const currentAssignments = getEmployeeAssets();
  const existingOpenIdx = currentAssignments.findIndex(
    (a) => a.asset_id === updatedAsset.id && a.status === 'ASSIGNED'
  );
  const newAssignment: EmployeeAssetAssignment = {
    id:
      existingOpenIdx >= 0
        ? currentAssignments[existingOpenIdx].id
        : `eas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    asset_id: updatedAsset.id,
    asset_code: updatedAsset.asset_code,
    asset_name: updatedAsset.name,
    category: updatedAsset.category,
    serial_number: updatedAsset.serial_number,
    employee_id: employee.id ?? matchedEmp?.id ?? `emp-${employee.employee_code}`,
    employee_code: employee.employee_code,
    employee_name: employee.full_name,
    department_id: employee.department_id,
    assigned_date: assignedAtDate,
    assign_condition: updatedAsset.condition_note || 'Hoạt động tốt khi bàn giao',
    asset_value_vnd:
      updatedAsset.asset_value_vnd ?? inferDefaultAssetValueVnd(updatedAsset.category),
    returned_date: null,
    return_condition: null,
    penalty_amount_vnd: 0,
    status: 'ASSIGNED',
  };
  const nextAssignments =
    existingOpenIdx >= 0
      ? currentAssignments.map((item, i) => (i === existingOpenIdx ? newAssignment : item))
      : [newAssignment, ...currentAssignments];
  writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);

  return updatedAsset;
}

export function revokeCompanyAsset(
  assetId: string,
  conditionNote?: string
): CompanyAsset | null {
  const currentAssets = getCompanyAssets();
  const idx = currentAssets.findIndex(
    (item) => item.id === assetId || item.asset_code === assetId
  );
  if (idx < 0) return null;

  const target = currentAssets[idx];
  const previousEmployeeCode = target.assigned_to_code;

  const updatedAsset: CompanyAsset = {
    ...target,
    status: 'AVAILABLE',
    assigned_to_code: undefined,
    assigned_to_name: undefined,
    assigned_department_id: undefined,
    assigned_at: undefined,
    condition_note: conditionNote?.trim()
      ? conditionNote.trim()
      : target.condition_note,
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === idx ? updatedAsset : item
  );

  if (previousEmployeeCode) {
    const onboardingRecords = getOnboardingRecords();
    const onbIdx = onboardingRecords.findIndex(
      (rec) => rec.employee_code === previousEmployeeCode
    );
    if (
      onbIdx >= 0 &&
      onboardingRecords[onbIdx].assigned_asset_ids.includes(updatedAsset.id)
    ) {
      const nextOnboarding = onboardingRecords.map((rec, i) =>
        i === onbIdx
          ? {
              ...rec,
              assigned_asset_ids: rec.assigned_asset_ids.filter(
                (id) => id !== updatedAsset.id
              ),
            }
          : rec
      );
      writeStorageArray(STORAGE_ONBOARDING_KEY, nextOnboarding);
    }
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  // Sync EmployeeAssetAssignment if open
  const currentAssignments = getEmployeeAssets();
  const openIdx = currentAssignments.findIndex(
    (a) => a.asset_id === updatedAsset.id && a.status === 'ASSIGNED'
  );
  if (openIdx >= 0) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const closedAssignment: EmployeeAssetAssignment = {
      ...currentAssignments[openIdx],
      returned_date: todayIso,
      return_condition: 'GOOD',
      return_note: conditionNote?.trim() || 'Đã thu hồi về kho thiết bị',
      status: 'RETURNED',
    };
    const nextAssignments = currentAssignments.map((item, i) =>
      i === openIdx ? closedAssignment : item
    );
    writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);
  }

  return updatedAsset;
}

export function createCompanyAsset(
  input: Omit<CompanyAsset, 'id'>
): CompanyAsset {
  const randSuffix = Math.random().toString(36).slice(2, 6);
  const created: CompanyAsset = {
    ...input,
    id: `ast-${Date.now()}-${randSuffix}`,
  };
  const currentAssets = getCompanyAssets();
  writeStorageArray(STORAGE_ASSETS_KEY, [created, ...currentAssets]);
  return created;
}

// ---------------------------------------------------------------------------
// Stage 1B: Employment Contracts Store & Employee Asset Assignments Store
// ---------------------------------------------------------------------------
export function getContracts(
  baseContracts: EmploymentContract[] = MOCK_CONTRACTS
): EmploymentContract[] {
  const runtimeList = readStorageArray<EmploymentContract>(STORAGE_CONTRACTS_KEY) ?? [];
  if (runtimeList.length === 0) return cloneJson(baseContracts);

  const baseIds = new Set(baseContracts.map((c) => c.id));
  const baseNumbers = new Set(baseContracts.map((c) => c.contract_number));

  const mergedBase = baseContracts.map((baseItem) => {
    const override = runtimeList.find(
      (rt) =>
        rt.id === baseItem.id || rt.contract_number === baseItem.contract_number
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseNumbers.has(rt.contract_number)
  );

  return [...brandNew, ...mergedBase];
}

export function saveContract(contract: EmploymentContract): EmploymentContract {
  const current = readStorageArray<EmploymentContract>(STORAGE_CONTRACTS_KEY) ?? [];
  const idx = current.findIndex(
    (c) =>
      c.id === contract.id || c.contract_number === contract.contract_number
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? contract : item))
      : [contract, ...current];
  writeStorageArray(STORAGE_CONTRACTS_KEY, updated);
  return contract;
}

function buildSeedEmployeeAssets(): EmployeeAssetAssignment[] {
  return MOCK_COMPANY_ASSETS.filter(
    (a) => a.status === 'ASSIGNED' && a.assigned_to_code
  ).map((asset, index) => {
    const matchedEmp = MOCK_EMPLOYEES.find(
      (e) => e.employee_code === asset.assigned_to_code
    );
    return {
      id: `eas-seed-${String(index + 1).padStart(3, '0')}`,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      category: asset.category,
      serial_number: asset.serial_number,
      employee_id: matchedEmp?.id ?? `emp-${asset.assigned_to_code}`,
      employee_code: asset.assigned_to_code || '',
      employee_name: asset.assigned_to_name || matchedEmp?.full_name || '',
      department_id:
        asset.assigned_department_id || matchedEmp?.department_id || 'dept-tech',
      assigned_date: asset.assigned_at || '2026-01-10',
      assign_condition: asset.condition_note,
      asset_value_vnd: inferDefaultAssetValueVnd(asset.category),
      returned_date: null,
      return_condition: null,
      penalty_amount_vnd: 0,
      status: 'ASSIGNED',
    };
  });
}

export function getEmployeeAssets(
  employeeCodeOrId?: string
): EmployeeAssetAssignment[] {
  const stored = readStorageArray<EmployeeAssetAssignment>(
    STORAGE_EMPLOYEE_ASSETS_KEY
  );
  const list = stored ?? buildSeedEmployeeAssets();
  if (!employeeCodeOrId) return list;
  return list.filter(
    (item) =>
      item.employee_code === employeeCodeOrId ||
      item.employee_id === employeeCodeOrId
  );
}

export function assignAssetToEmployee(params: {
  assetId: string;
  employeeId?: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  assignedDate?: string;
  assignCondition?: string;
  assetValueVnd?: number;
  actorName?: string;
}): { asset: CompanyAsset; assignment: EmployeeAssetAssignment } | null {
  const assignedAsset = assignCompanyAsset(
    params.assetId,
    {
      id: params.employeeId,
      employee_code: params.employeeCode,
      full_name: params.employeeName,
      department_id: params.departmentId,
    },
    params.assignedDate
  );
  if (!assignedAsset) return null;

  const allAssignments = getEmployeeAssets();
  const targetIdx = allAssignments.findIndex(
    (a) => a.asset_id === assignedAsset.id && a.status === 'ASSIGNED'
  );
  if (targetIdx < 0) return null;

  const enriched: EmployeeAssetAssignment = {
    ...allAssignments[targetIdx],
    assign_condition:
      params.assignCondition?.trim() || allAssignments[targetIdx].assign_condition,
    asset_value_vnd:
      params.assetValueVnd ?? allAssignments[targetIdx].asset_value_vnd,
  };
  const updated = allAssignments.map((item, i) =>
    i === targetIdx ? enriched : item
  );
  writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, updated);

  return { asset: assignedAsset, assignment: enriched };
}

export function returnEmployeeAssetWithPenalty(params: {
  assetId: string;
  returnCondition: AssetConditionStatus;
  penaltyAmountVnd?: number;
  returnNote?: string;
  returnedDate?: string;
  actorName?: string;
}): { asset: CompanyAsset; assignment: EmployeeAssetAssignment | null } | null {
  const currentAssets = getCompanyAssets();
  const assetIdx = currentAssets.findIndex(
    (a) => a.id === params.assetId || a.asset_code === params.assetId
  );
  if (assetIdx < 0) return null;

  const targetAsset = currentAssets[assetIdx];
  const returnedDate = params.returnedDate ?? new Date().toISOString().slice(0, 10);
  const penalty = Math.max(0, Math.round(params.penaltyAmountVnd ?? 0));

  const nextAssetStatus: CompanyAsset['status'] =
    params.returnCondition === 'DAMAGED' || params.returnCondition === 'LOST'
      ? 'MAINTENANCE'
      : 'AVAILABLE';

  const updatedAsset: CompanyAsset = {
    ...targetAsset,
    status: nextAssetStatus,
    assigned_to_code: undefined,
    assigned_to_name: undefined,
    assigned_department_id: undefined,
    assigned_at: undefined,
    condition_note:
      params.returnNote?.trim() ||
      (params.returnCondition === 'LOST'
        ? `Báo mất thiết bị ngày ${returnedDate} (Khấu trừ đền bù: ${penalty.toLocaleString('vi-VN')} đ)`
        : params.returnCondition === 'DAMAGED'
          ? `Thu hồi có hư hỏng ngày ${returnedDate} (Phí khắc phục: ${penalty.toLocaleString('vi-VN')} đ)`
          : `Đã thu hồi nguyên vẹn ngày ${returnedDate}`),
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === assetIdx ? updatedAsset : item
  );
  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  const allAssignments = getEmployeeAssets();
  const assignIdx = allAssignments.findIndex(
    (a) => a.asset_id === targetAsset.id && a.status === 'ASSIGNED'
  );
  let closedAssignment: EmployeeAssetAssignment | null = null;
  if (assignIdx >= 0) {
    closedAssignment = {
      ...allAssignments[assignIdx],
      returned_date: returnedDate,
      return_condition: params.returnCondition,
      return_note: params.returnNote?.trim() || updatedAsset.condition_note,
      penalty_amount_vnd: penalty,
      status: params.returnCondition === 'LOST' ? 'LOST' : 'RETURNED',
    };
    const nextAssignments = allAssignments.map((item, i) =>
      i === assignIdx ? (closedAssignment as EmployeeAssetAssignment) : item
    );
    writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);
  }

  return { asset: updatedAsset, assignment: closedAssignment };
}
