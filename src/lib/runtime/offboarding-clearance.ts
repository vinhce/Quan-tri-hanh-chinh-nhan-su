import {
  evaluateResignationWorkHandoverGate,
} from '@/lib/hrm/work-handover-bridge';
import {
  getWorkItems,
} from '@/lib/hrm/work-items-store';
import type {
  AssetConditionStatus,
  ClearanceChecklist,
  ClearanceGateStatus,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  returnEmployeeAssetWithPenalty,
} from './contracts-assets';
import {
  getClearanceChecklists,
  getHandoverItems,
  getResignations,
  saveClearanceInternal,
} from './offboarding-store';
import {
  getManagerOffboardingDependencies,
} from './offboarding-succession';

export function reconcileClearanceAsset(params: {
  checklistId?: string;
  resignationId?: string;
  assetId: string;
  returned: boolean;
  returnCondition: AssetConditionStatus;
  penaltyAmountVnd?: number;
  conditionNote?: string;
  returnedDate?: string;
  actorName: string;
}): ClearanceChecklist | null {
  const all = getClearanceChecklists();
  const target = all.find(
    (cl) =>
      (params.checklistId && cl.id === params.checklistId) ||
      (params.resignationId && cl.resignation_id === params.resignationId)
  );
  if (!target) return null;

  const nowDate = params.returnedDate ?? new Date().toISOString().slice(0, 10);
  const penalty = Math.max(0, Math.round(params.penaltyAmountVnd ?? 0));

  if (params.returned || params.returnCondition === 'LOST') {
    returnEmployeeAssetWithPenalty({
      assetId: params.assetId,
      returnCondition: params.returnCondition,
      penaltyAmountVnd: penalty,
      returnNote: params.conditionNote,
      returnedDate: nowDate,
      actorName: params.actorName,
    });
  }

  const nextAssets = target.assets.map((ast) => {
    if (ast.asset_id !== params.assetId && ast.asset_code !== params.assetId) {
      return ast;
    }
    return {
      ...ast,
      returned: params.returned,
      returned_date:
        params.returned || params.returnCondition === 'LOST' ? nowDate : null,
      return_condition: params.returnCondition,
      penalty_amount_vnd: penalty,
      condition_note: params.conditionNote,
      reconciled_by: params.actorName,
    };
  });

  const totalPenalty = nextAssets.reduce(
    (sum, a) => sum + (a.penalty_amount_vnd || 0),
    0
  );
  const allAssetsReconciled = nextAssets.every(
    (a) => a.returned || a.return_condition === 'LOST'
  );

  const updatedChecklist: ClearanceChecklist = {
    ...target,
    assets: nextAssets,
    total_penalty_vnd: totalPenalty,
    admin_assets_cleared: allAssetsReconciled,
    admin_signed_by: allAssetsReconciled ? params.actorName : target.admin_signed_by,
    admin_signed_at: allAssetsReconciled
      ? new Date().toISOString()
      : target.admin_signed_at,
    updated_at: new Date().toISOString(),
  };

  return saveClearanceInternal(updatedChecklist);
}

export function signOffClearanceDept(params: {
  checklistId?: string;
  resignationId?: string;
  department: 'ADMIN' | 'IT' | 'ACCOUNTING' | 'HR';
  approved: boolean;
  advanceDeductionVnd?: number;
  note?: string;
  actorName: string;
}): ClearanceChecklist | null {
  const all = getClearanceChecklists();
  const target = all.find(
    (cl) =>
      (params.checklistId && cl.id === params.checklistId) ||
      (params.resignationId && cl.resignation_id === params.resignationId)
  );
  if (!target) return null;

  const nowIso = new Date().toISOString();
  let updated: ClearanceChecklist = { ...target, updated_at: nowIso };

  if (params.department === 'ADMIN') {
    const unreconciled = target.assets.filter(
      (a) => !a.returned && a.return_condition !== 'LOST'
    );
    if (params.approved && unreconciled.length > 0) {
      throw new Error(
        `Bộ phận Hành chính chưa thể ký tất toán khi còn ${unreconciled.length} thiết bị chưa đối soát thu hồi/báo mất.`
      );
    }
    updated = {
      ...updated,
      admin_assets_cleared: params.approved,
      admin_signed_by: params.approved ? params.actorName : null,
      admin_signed_at: params.approved ? nowIso : null,
    };
  } else if (params.department === 'IT') {
    updated = {
      ...updated,
      it_access_revoked: params.approved,
      it_signed_by: params.approved ? params.actorName : null,
      it_signed_at: params.approved ? nowIso : null,
      it_note: params.note ?? updated.it_note,
    };
  } else if (params.department === 'ACCOUNTING') {
    updated = {
      ...updated,
      accounting_debt_cleared: params.approved,
      advance_deduction_vnd: Math.max(
        0,
        Math.round(params.advanceDeductionVnd ?? updated.advance_deduction_vnd ?? 0)
      ),
      accounting_signed_by: params.approved ? params.actorName : null,
      accounting_signed_at: params.approved ? nowIso : null,
      accounting_note: params.note ?? updated.accounting_note,
    };
  } else if (params.department === 'HR') {
    updated = {
      ...updated,
      hr_bhxh_closed: params.approved,
      hr_signed_by: params.approved ? params.actorName : null,
      hr_signed_at: params.approved ? nowIso : null,
      hr_note: params.note ?? updated.hr_note,
    };
  }

  const saved = saveClearanceInternal(updated);

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: `CLR-${params.department}`,
    actor_role: 'HR_MANAGER',
    action: 'CLEARANCE_SIGNOFF',
    target: `${saved.employee_code} · ${params.department}`,
    detail: `Xác nhận đối soát thanh lý bộ phận ${params.department}: ${params.approved ? 'ĐÃ HOÀN TẤT' : 'MỞ LẠI'}. ${params.note ?? ''}`.trim(),
  });

  return saved;
}

export function checkClearance100Percent(
  resignationId: string
): ClearanceGateStatus {
  const resignation = getResignations().find(
    (r) => r.id === resignationId || r.resignation_code === resignationId
  );
  if (!resignation) {
    return {
      resignation_id: resignationId,
      employee_id: '',
      is_100_percent_cleared: false,
      completion_percent: 0,
      handover_total: 0,
      handover_completed: 0,
      assets_total: 0,
      assets_reconciled: 0,
      admin_cleared: false,
      it_cleared: false,
      accounting_cleared: false,
      hr_cleared: false,
      manager_dependencies_cleared: false,
      blocking_reasons: ['Không tìm thấy hồ sơ thôi việc hợp lệ.'],
    };
  }

  const handovers = getHandoverItems(resignation.id).filter(
    (h) => (h.source_type ?? 'RESIGNATION') !== 'DEPARTMENT_TRANSFER'
  );
  const handoverTotal = handovers.length;
  const handoverCompleted = handovers.filter(
    (h) =>
      h.sender_confirmed &&
      h.receiver_confirmed &&
      h.manager_approved &&
      h.status === 'COMPLETED'
  ).length;
  const workHandoverGate = evaluateResignationWorkHandoverGate({
    resignationId: resignation.id,
    employeeId: resignation.employee_id,
    employeeCode: resignation.employee_code,
    workItems: getWorkItems(resignation.employee_id),
    handovers,
  });

  const clearance = getClearanceChecklists(resignation.id)[0] ?? null;
  const assetsTotal = clearance?.assets.length ?? 0;
  const assetsReconciled =
    clearance?.assets.filter(
      (a) => a.returned || a.return_condition === 'LOST'
    ).length ?? 0;

  const adminCleared = Boolean(
    clearance &&
      clearance.admin_assets_cleared &&
      assetsReconciled === assetsTotal
  );
  const itCleared = Boolean(clearance?.it_access_revoked);
  const accountingCleared = Boolean(clearance?.accounting_debt_cleared);
  const hrCleared = Boolean(clearance?.hr_bhxh_closed);

  const mgrDep = getManagerOffboardingDependencies(resignation.employee_id);
  const managerDependenciesCleared = !mgrDep.requires_successor_reassign;

  const blockingReasons: string[] = [];
  if (handoverTotal === 0 || handoverCompleted < handoverTotal) {
    blockingReasons.push(
      `Chưa hoàn tất bàn giao công việc 3 bên (${handoverCompleted}/${handoverTotal} hạng mục)`
    );
  }
  if (!workHandoverGate.passed) {
    blockingReasons.push(...workHandoverGate.blockingReasons);
  }
  if (!managerDependenciesCleared) {
    blockingReasons.push(
      `Chưa chuyển giao người kế nhiệm Quản lý cho ${mgrDep.subordinates.length} nhân sự trực thuộc & ${mgrDep.pending_requests.length} đơn chờ duyệt`
    );
  }
  if (!adminCleared) {
    blockingReasons.push(
      `Hành chính chưa thu hồi/đối soát xong tài sản (${assetsReconciled}/${assetsTotal} thiết bị)`
    );
  }
  if (!itCleared) {
    blockingReasons.push('Bộ phận IT chưa xác nhận thu hồi quyền truy cập & email');
  }
  if (!accountingCleared) {
    blockingReasons.push('Phòng Kế toán chưa xác nhận công nợ / tạm ứng');
  }
  if (!hrCleared) {
    blockingReasons.push('Phòng Nhân sự chưa xác nhận chốt sổ BHXH');
  }

  // Compute weighted completion percent across 6 gates
  let passedChecks = 0;
  const totalChecks = 6;
  if (handoverTotal > 0 && handoverCompleted === handoverTotal) passedChecks += 1;
  if (managerDependenciesCleared) passedChecks += 1;
  if (adminCleared) passedChecks += 1;
  if (itCleared) passedChecks += 1;
  if (accountingCleared) passedChecks += 1;
  if (hrCleared) passedChecks += 1;

  const completionPercent = Math.round((passedChecks / totalChecks) * 100);
  const is100Percent = blockingReasons.length === 0;

  return {
    resignation_id: resignation.id,
    employee_id: resignation.employee_id,
    is_100_percent_cleared: is100Percent,
    completion_percent: completionPercent,
    handover_total: handoverTotal,
    handover_completed: handoverCompleted,
    assets_total: assetsTotal,
    assets_reconciled: assetsReconciled,
    admin_cleared: adminCleared,
    it_cleared: itCleared,
    accounting_cleared: accountingCleared,
    hr_cleared: hrCleared,
    manager_dependencies_cleared: managerDependenciesCleared,
    blocking_reasons: blockingReasons,
  };
}
