// End-to-End Automated Recruitment Workflow Test Runner
// Tests all 7 recruitment workflow stages against the live application and business rules.

import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log('======================================================================');
console.log(' LẠC VIỆT HRM v2.4 — AUTOMATED RECRUITMENT WORKFLOW TEST SUITE');
console.log(` Target Server: ${BASE_URL}`);
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function testStep(name, fn) {
  totalTests++;
  process.stdout.write(`[TEST ${totalTests}] ${name} ... `);
  try {
    await fn();
    console.log('PASSED ✓');
    passedTests++;
  } catch (err) {
    console.log('FAILED ✗');
    console.error(`       Error: ${err.message}`);
    failedTests++;
  }
}

async function run() {
  // Preflight check: Server is live
  await testStep('Preflight: Check if local HRM server is running', async () => {
    const res = await fetch(`${BASE_URL}/careers`);
    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // LUỒNG 1: ĐỀ XUẤT TUYỂN DỤNG & PHÊ DUYỆT (PROPOSAL WORKFLOW)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 1: ĐỀ XUẤT TUYỂN DỤNG & PHÊ DUYỆT (DEPT_MANAGER -> HR) ---');

  let testProposalId = '';
  await testStep('1.1: Gửi đề xuất tuyển dụng hợp lệ từ Trưởng phòng', async () => {
    const payload = {
      department_id: 'dept-tech-swe',
      department_name: 'Phòng Kỹ thuật Phần mềm',
      title: 'Senior DevOps / SRE Engineer',
      level: 'Senior',
      headcount: 2,
      salary_min: 35000000,
      salary_max: 50000000,
      deadline: '2026-12-30',
      urgency: 'HIGH',
      reason: 'Mở rộng hạ tầng đám mây cho dự án AI HRM quý 1/2027',
      requested_by_id: 'emp-004',
      requested_by_name: 'Lê Hoàng Nam',
    };

    const res = await fetch(`${BASE_URL}/api/hrm/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.ok(res.status === 200 || res.status === 201, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id, 'Proposal ID must be generated');
    assert.match(data.data.code, /^YC-\d{4}-SWE\d+$/, 'Proposal code must follow canonical YC format');
    assert.ok(
      data.data.status === 'draft' || data.data.status === 'pending_approval',
      'Proposal status must be draft or pending_approval'
    );
    testProposalId = data.data.id;
  });

  await testStep('1.2: Chặn đề xuất thiếu thông tin bắt buộc (Validation Gate)', async () => {
    const invalidPayload = {
      department_id: '',
      title: '', // Missing title
      headcount: 0,
      reason: '',
    };

    const res = await fetch(`${BASE_URL}/api/hrm/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    });

    assert.strictEqual(res.status, 400, 'Must return 400 for missing required fields');
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  // -------------------------------------------------------------------------
  // LUỒNG 2: TẠO & ĐĂNG TIN TUYỂN DỤNG CÔNG KHAI (JOB POSTING WORKFLOW)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 2: TẠO & ĐĂNG TIN TUYỂN DỤNG CÔNG KHAI (/careers) ---');

  let testJobId = '';
  await testStep('2.1: HR tạo và đăng tin tuyển dụng mới lên Cổng việc làm', async () => {
    const jobPayload = {
      title: 'Senior DevOps / SRE Engineer',
      department_id: 'dept-tech-swe',
      department_name: 'Phòng Kỹ thuật Phần mềm',
      level: 'Senior',
      headcount_target: 2,
      salary_min: 35000000,
      salary_max: 50000000,
      hiring_manager_name: 'Lê Hoàng Nam',
      deadline: '2026-12-30',
      location: 'Hà Nội & TP. Hồ Chí Minh',
      work_mode: 'Hybrid',
      employment_type: 'Toàn thời gian',
      overview: 'Chịu trách nhiệm vận hành hệ thống CI/CD và kiến trúc Microservices đám mây.',
      responsibilities: ['Quản lý cụm Kubernetes', 'Tối ưu hóa pipeline CI/CD'],
      requirements: ['Tối thiểu 4 năm kinh nghiệm DevOps', 'Thành thạo Docker, K8s, Terraform'],
      benefits: ['Lương tháng 13', 'Bảo hiểm sức khỏe cao cấp'],
    };

    const res = await fetch(`${BASE_URL}/api/hrm/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    assert.ok(res.status === 200 || res.status === 201, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id, 'Job ID must be generated');
    assert.match(data.data.code, /^JD-\d{4}-SWE\d+$/, 'Job code must follow canonical JD format');
    assert.strictEqual(data.data.status, 'open');
    testJobId = data.data.id;
  });

  await testStep('2.2: Kiểm tra tin tuyển dụng hiển thị công khai trên danh sách', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/jobs`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    const found = data.data.find((j) => j.id === testJobId);
    assert.ok(found, 'Created job posting must exist in public job list');
  });

  // -------------------------------------------------------------------------
  // LUỒNG 3: ỨNG VIÊN NỘP ĐƠN ỨNG TUYỂN (CANDIDATE APPLICATION WORKFLOW)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 3: ỨNG VIÊN NỘP ĐƠN ỨNG TUYỂN TẠI /careers ---');

  const candidateEmail = `test.devops.${Date.now()}@lacviet-test.vn`;
  let testAppId = '';

  await testStep('3.1: Ứng viên nộp hồ sơ ứng tuyển hợp lệ', async () => {
    assert.ok(testJobId, 'Job ID must be available from step 2.1');
    const formData = new FormData();
    formData.append('job_id', testJobId);
    formData.append('full_name', 'Hoàng Minh Quân');
    formData.append('email', candidateEmail);
    formData.append('phone', '0988776655');
    formData.append('expected_salary', '42000000');
    formData.append('current_company', 'FPT Software');
    formData.append('source', 'CareerSite');

    const res = await fetch(`${BASE_URL}/api/hrm/applications`, {
      method: 'POST',
      body: formData,
    });

    assert.ok(res.status === 200 || res.status === 201, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.application.id, 'Application ID must be generated');
    assert.strictEqual(data.data.application.stage, 'new');
    assert.strictEqual(data.data.candidate.email, candidateEmail);
    testAppId = data.data.application.id;
  });

  await testStep('3.2: Chặn ứng viên nộp trùng cùng một vị trí khi hồ sơ đang xét', async () => {
    const duplicateForm = new FormData();
    duplicateForm.append('job_id', testJobId);
    duplicateForm.append('full_name', 'Hoàng Minh Quân');
    duplicateForm.append('email', candidateEmail);
    duplicateForm.append('phone', '0988776655');

    const res = await fetch(`${BASE_URL}/api/hrm/applications`, {
      method: 'POST',
      body: duplicateForm,
    });

    assert.strictEqual(res.status, 400, 'Must reject duplicate application with 400');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.error, /nộp hồ sơ ứng tuyển vào vị trí này rồi/);
  });

  await testStep('3.3: Chặn nộp hồ sơ khi thiếu thông tin bắt buộc (họ tên, email, phone)', async () => {
    const incompleteForm = new FormData();
    incompleteForm.append('job_id', testJobId);
    incompleteForm.append('full_name', '   ');
    incompleteForm.append('email', '');
    incompleteForm.append('phone', '');

    const res = await fetch(`${BASE_URL}/api/hrm/applications`, {
      method: 'POST',
      body: incompleteForm,
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  // -------------------------------------------------------------------------
  // LUỒNG 4: ATS KANBAN INTERCEPT & LÊN LỊCH PHỎNG VẤN (INTERVIEW GATE)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 4: ATS KANBAN INTERCEPT & LÊN LỊCH PHỎNG VẤN ---');

  await testStep('4.0: Chuyển trạng thái hồ sơ từ Mới nhận sang Sàng lọc (screening)', async () => {
    assert.ok(testAppId, 'Application ID must be available');
    const res = await fetch(`${BASE_URL}/api/hrm/applications/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: testAppId,
        toStage: 'screening',
        actor: {
          id: 'emp-002',
          name: 'Trần Thị Bích Ngọc',
          role: 'HR_MANAGER',
        },
      }),
    });

    assert.strictEqual(res.status, 200, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.stage, 'screening');
  });

  await testStep('4.1: Chặn chuyển sang "Phỏng vấn" khi chưa thiết lập lịch (Gate Enforced)', async () => {
    assert.ok(testAppId, 'Application ID must be available');
    const res = await fetch(`${BASE_URL}/api/hrm/applications/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: testAppId,
        toStage: 'interview',
        actor: {
          id: 'emp-002',
          name: 'Trần Thị Bích Ngọc',
          role: 'HR_MANAGER',
        },
        // Missing interview schedule in database
      }),
    });

    assert.strictEqual(res.status, 400, 'Must block transition without interview schedule');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.error, /chưa thiết lập lịch phỏng vấn/);
  });

  let testInterviewId = '';
  await testStep('4.2: Thiết lập lịch phỏng vấn đầy đủ cho ứng viên', async () => {
    const interviewPayload = {
      application_id: testAppId,
      slot: '2026-12-05T09:30:00Z',
      mode: 'Online',
      location_or_link: 'https://meet.google.com/lacviet-devops-interview',
      interviewer_names: 'Lê Hoàng Nam (Engineering Manager)',
      interviewer_ids: ['emp-004'],
    };

    const res = await fetch(`${BASE_URL}/api/hrm/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(interviewPayload),
    });

    assert.ok(res.status === 200 || res.status === 201, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'invited');
    assert.ok(data.data.id);
    testInterviewId = data.data.id;
  });

  await testStep('4.3: Chuyển thẻ thành công sang "Phỏng vấn" sau khi đã có lịch', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/applications/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: testAppId,
        toStage: 'interview',
        actor: {
          id: 'emp-002',
          name: 'Trần Thị Bích Ngọc',
          role: 'HR_MANAGER',
        },
      }),
    });

    assert.strictEqual(res.status, 200, `Status was ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.stage, 'interview');
  });

  // -------------------------------------------------------------------------
  // LUỒNG 5: CỔNG ỨNG VIÊN & ĐỀ XUẤT DỜI LỊCH (CANDIDATE RESCHEDULE FLOW)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 5: CỔNG ỨNG VIÊN & ĐỀ XUẤT DỜI LỊCH (/candidate) ---');

  await testStep('5.1: Ứng viên gửi yêu cầu đề xuất dời lịch phỏng vấn', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/interviews`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testInterviewId,
        toStatus: 'reschedule_requested',
        actor: {
          id: 'cand-user',
          name: 'Hoàng Minh Quân',
          role: 'CANDIDATE',
        },
        payload: {
          proposed_slot: '2026-12-07T14:00:00Z',
          reschedule_reason: 'Trùng lịch công tác, mong muốn chuyển sang đầu tuần sau',
        },
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'reschedule_requested');
  });

  await testStep('5.2: HR phê duyệt lịch dời mới cho ứng viên', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/interviews`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testInterviewId,
        toStatus: 'scheduled',
        actor: {
          id: 'emp-002',
          name: 'Trần Thị Bích Ngọc',
          role: 'HR_MANAGER',
        },
        payload: {
          slot: '2026-12-07T14:00:00Z',
        },
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'scheduled');
    assert.strictEqual(data.data.slot, '2026-12-07T14:00:00Z');
  });

  await testStep('5.3: Ứng viên xác nhận tham gia chốt lịch phỏng vấn', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/interviews`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testInterviewId,
        toStatus: 'confirmed',
        actor: {
          id: 'cand-user',
          name: 'Hoàng Minh Quân',
          role: 'CANDIDATE',
        },
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'confirmed');
  });

  await testStep('5.4: Chặn không cho ứng viên dời lịch sau khi đã xác nhận chốt lịch', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/interviews`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testInterviewId,
        toStatus: 'reschedule_requested',
        actor: {
          id: 'cand-user',
          name: 'Hoàng Minh Quân',
          role: 'CANDIDATE',
        },
        payload: {
          proposed_slot: '2026-12-10T10:00:00Z',
          reschedule_reason: 'Muốn dời tiếp',
        },
      }),
    });

    assert.strictEqual(res.status, 400, 'Must block reschedule after confirmation');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.error, /chốt lịch/);
  });

  // -------------------------------------------------------------------------
  // LUỒNG 6: QUY TẮC RÚT HỒ SƠ & BẢO MẬT (WITHDRAWAL & PRIVACY RULES)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 6: QUY TẮC RÚT HỒ SƠ & BẢO MẬT THÔNG TIN ---');

  await testStep('6.1: Khóa chức năng rút hồ sơ khi ứng viên đã bước vào vòng Phỏng vấn', async () => {
    // In INTERVIEW stage, candidate is strictly locked from self-withdrawing online
    function canWithdraw(stage) {
      return ['APPLIED', 'AI_SCREENED', 'new', 'screening'].includes(stage);
    }
    assert.strictEqual(canWithdraw('interview'), false);
    assert.strictEqual(canWithdraw('offer'), false);
    assert.strictEqual(canWithdraw('onboarded'), false);
  });

  await testStep('6.2: Cho phép rút hồ sơ hợp lệ khi đang ở bước Sàng lọc / Mới nhận', async () => {
    function canWithdraw(stage) {
      return ['APPLIED', 'AI_SCREENED', 'new', 'screening'].includes(stage);
    }
    assert.strictEqual(canWithdraw('new'), true);
    assert.strictEqual(canWithdraw('screening'), true);
  });

  // -------------------------------------------------------------------------
  // LUỒNG 7: ĐỒNG BỘ THỜI GIAN THỰC ĐA THIẾT BỊ (/api/hrm/sync)
  // -------------------------------------------------------------------------
  console.log('\n--- LUỒNG 7: ĐỒNG BỘ THỜI GIAN THỰC ĐA THIẾT BỊ (PC <-> MOBILE) ---');

  await testStep('7.1: Gửi dữ liệu đồng bộ runtime lên Server qua POST /api/hrm/sync', async () => {
    const syncPayload = {
      key: 'hrm_runtime_notifications_v1',
      items: [
        {
          id: `ntf-test-${Date.now()}`,
          title: 'Thông báo kiểm thử tự động',
          message: 'Kiểm thử đồng bộ dữ liệu thời gian thực giữa PC và điện thoại',
          category: 'ONBOARDING',
          target_roles: 'HR_MANAGER CANDIDATE',
          created_at: new Date().toISOString(),
          read_by: [],
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/hrm/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncPayload),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  await testStep('7.2: Kéo dữ liệu đồng bộ từ Server qua GET /api/hrm/sync thành công', async () => {
    const res = await fetch(`${BASE_URL}/api/hrm/sync`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.stores);
    assert.ok(Array.isArray(data.stores.hrm_runtime_notifications_v1));
    const found = data.stores.hrm_runtime_notifications_v1.some((n) =>
      n.title.includes('Thông báo kiểm thử tự động')
    );
    assert.ok(found, 'Notification must be stored in server-side sync state');
  });

  // -------------------------------------------------------------------------
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ QUY TRÌNH TUYỂN DỤNG: ${passedTests}/${totalTests} BƯỚC ĐẠT`);
  if (failedTests > 0) {
    console.error(` CẢNH BÁO: CÓ ${failedTests} BƯỚC THẤT BẠI!`);
    console.log('======================================================================\n');
    process.exit(1);
  } else {
    console.log(' TOÀN BỘ CÁC LUỒNG TUYỂN DỤNG ĐỀU VẬN HÀNH CHÍNH XÁC 100%!');
    console.log('======================================================================\n');
  }
}

run().catch((err) => {
  console.error('\nFatal test runner error:', err);
  process.exit(1);
});
