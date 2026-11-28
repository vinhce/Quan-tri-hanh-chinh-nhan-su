export { isOfficialEmployeeStatus } from '@/mock/types';

export {
  checkInOutToday,
  importDailyAttendances,
} from './runtime/attendance-daily';
export {
  getMonthlyAttendances,
  recomputeMonthlyAttendance,
} from './runtime/attendance-monthly';
export {
  getTodayDateVN,
  getCurrentHHmmVN,
  isAttendanceNightLockWindow,
  evaluateDailyPunch,
  getDailyAttendances,
} from './runtime/attendance-rules';
export {
  DEFAULT_WIFI_ATTENDANCE_POLICY,
  getBiometricCredentials,
  saveBiometricCredential,
  removeBiometricCredential,
  getWifiAttendancePolicy,
  saveWifiAttendancePolicy,
  resetAllDemoRuntimeData,
  initRuntimeSync,
} from './runtime/biometric-sync';
export {
  promoteOrTransferEmployee,
} from './runtime/career-progression';
export {
  getCompanyAssets,
  assignCompanyAsset,
  revokeCompanyAsset,
  createCompanyAsset,
  getContracts,
  saveContract,
  getEmployeeAssets,
  assignAssetToEmployee,
  returnEmployeeAssetWithPenalty,
} from './runtime/contracts-assets';
export {
  mergeWithRuntimeRequests,
  saveRuntimeRequest,
  mergeWithRuntimeEmployees,
  saveRuntimeEmployee,
  generateNextEmployeeCode,
  readRuntimeCandidates,
  mergeWithRuntimeCandidates,
  saveRuntimeCandidate,
  readRuntimeJobs,
  mergeWithRuntimeJobs,
  saveRuntimeJob,
  getJobPostings,
  notifyCandidateStageChange,
  getRuntimeDepartments,
  saveRuntimeDepartment,
  getAllRuntimeEmployees,
} from './runtime/core-entities';
export {
  getDepartmentRecruitmentRequests,
  saveDepartmentRecruitmentRequest,
  createDepartmentRecruitmentRequest,
  approveDepartmentRecruitmentRequest,
  rejectDepartmentRecruitmentRequest,
} from './runtime/dept-recruitment';
export {
  getLeaveBalances,
  saveLeaveBalance,
  applyApprovedRequestSideEffects,
  handleRequestLifecycleChange,
} from './runtime/leave-requests';
export {
  getNotificationsForActor,
  pushNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from './runtime/notifications';
export {
  reconcileClearanceAsset,
  signOffClearanceDept,
  checkClearance100Percent,
} from './runtime/offboarding-clearance';
export {
  prepareDepartmentTransferHandovers,
  addHandoverItem,
  assignHandoverReceiver,
  confirmHandoverBySender,
  confirmHandoverByReceiver,
  approveHandoverByManager,
} from './runtime/offboarding-handover';
export {
  submitResignation,
  approveResignation,
  rejectResignation,
} from './runtime/offboarding-resignation';
export {
  executeFinalSettlement,
  checkCandidateRehireWarning,
} from './runtime/offboarding-settlement';
export {
  calculateResignationNotice,
  getResignations,
  getHandoverItems,
  getClearanceChecklists,
} from './runtime/offboarding-store';
export {
  getManagerOffboardingDependencies,
  executeManagerSuccessorReassign,
} from './runtime/offboarding-succession';
export {
  toggleOnboardingChecklistItem,
  toggleOnboardingChecklistGroup,
  toggleAllOnboardingChecklist,
  completeOnboardingRecord,
} from './runtime/onboarding-checklist';
export {
  updateCandidateOfferSalary,
  initiateCandidateOnboarding,
} from './runtime/onboarding-initiate';
export {
  getOnboardingRecords,
  saveOnboardingRecord,
  getPreboardingInvites,
  getPreboardingByToken,
} from './runtime/onboarding-store';
export {
  assignOnboardingMentor,
  completeOnboardingDeptTask,
} from './runtime/onboarding-tasks';
export {
  getPayrollRecords,
  savePayrollRecord,
  calculateMonthlyPayrolls,
} from './runtime/payroll';
export {
  getPerformanceReviews,
  savePerformanceReview,
  getCareerHistories,
} from './runtime/performance';
export {
  createPreboardingInvite,
} from './runtime/preboarding-create';
export {
  savePreboardingDraft,
  submitPreboardingInfo,
  submitPreboardingInvite,
  hrQuickUpdatePreboarding,
  verifyPreboardingInvite,
} from './runtime/preboarding-submit';
export {
  getExpiringProbationContracts,
  convertProbationToOfficial,
} from './runtime/probation';
export {
  HRM_RUNTIME_EVENT,
  STORAGE_NOTIFICATIONS_KEY,
  STORAGE_REQUESTS_KEY,
  STORAGE_EMPLOYEES_KEY,
  STORAGE_CANDIDATES_KEY,
  STORAGE_JOBS_KEY,
  STORAGE_ONBOARDING_KEY,
  STORAGE_ASSETS_KEY,
  STORAGE_DEPT_REQUESTS_KEY,
  STORAGE_USERS_KEY,
  STORAGE_PREBOARDING_KEY,
  STORAGE_EMPLOYEE_ASSETS_KEY,
  STORAGE_CONTRACTS_KEY,
  STORAGE_DEPARTMENTS_KEY,
  STORAGE_DAILY_ATTENDANCE_KEY,
  STORAGE_MONTHLY_ATTENDANCE_KEY,
  STORAGE_LEAVE_BALANCES_KEY,
  STORAGE_PAYROLLS_KEY,
  STORAGE_PERFORMANCE_REVIEWS_KEY,
  STORAGE_CAREER_HISTORIES_KEY,
  STORAGE_RESIGNATIONS_KEY,
  STORAGE_HANDOVER_ITEMS_KEY,
  STORAGE_CLEARANCE_CHECKLISTS_KEY,
  STORAGE_BIOMETRIC_CREDS_KEY,
  STORAGE_WIFI_POLICY_KEY,
  STORAGE_BOOT_EPOCH_KEY,
  ALL_RUNTIME_SYNC_KEYS,
} from './runtime/storage';
export {
  getSystemUsers,
  saveSystemUser,
  setUserActiveByEmployee,
  findSystemUserForLogin,
  activateEmployeeAccountIfPreboardingVerified,
} from './runtime/users-auth';
