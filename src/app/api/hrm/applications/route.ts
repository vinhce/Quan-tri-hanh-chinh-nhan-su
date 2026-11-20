import { NextResponse } from 'next/server';
import { saveCvFile } from '@/lib/hrm/files';
import { formatCandidateCode } from '@/lib/hrm/ids';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import type { ApplicationEntity, CandidateEntity } from '@/lib/hrm/types';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const candidateId = url.searchParams.get('candidate_id');

    if (candidateId) {
      const list = await hrmRepo.getApplicationsByCandidateId(candidateId);
      return NextResponse.json({ success: true, data: list });
    }

    const list = await hrmRepo.getApplications();
    return NextResponse.json({ success: true, data: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const jobId = formData.get('job_id') as string;
    const fullName = formData.get('full_name') as string;
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const phone = formData.get('phone') as string;
    const expectedSalary = Number(formData.get('expected_salary')) || 0;
    const currentCompany = (formData.get('current_company') as string) || '';
    const source = (formData.get('source') as ApplicationEntity['source']) || 'CareerSite';
    const cvFile = formData.get('cv_file') as File | null;

    if (!jobId || !fullName || !email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp đầy đủ thông tin: vị trí ứng tuyển, họ tên, email và số điện thoại.' },
        { status: 400 }
      );
    }

    // Check job exists and is open
    const job = await hrmRepo.getJobPostingById(jobId);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Vị trí tuyển dụng không tồn tại.' }, { status: 404 });
    }
    if (job.status !== 'open') {
      return NextResponse.json({ success: false, error: 'Tin tuyển dụng này đã đóng hoặc tạm dừng nhận hồ sơ.' }, { status: 400 });
    }
    if (new Date(job.deadline) < new Date()) {
      return NextResponse.json({ success: false, error: 'Tin tuyển dụng này đã hết hạn nhận hồ sơ.' }, { status: 400 });
    }

    // Check existing candidate by email
    let candidate = await hrmRepo.getCandidateByEmail(email);
    const currentYear = new Date().getFullYear();
    const allCandidates = await hrmRepo.getCandidates();

    if (!candidate) {
      const candId = `cand-${Date.now()}`;
      const candidateCode = formatCandidateCode(currentYear, allCandidates.length + 1);
      candidate = {
        id: candId,
        candidate_code: candidateCode,
        email,
        full_name: fullName,
        phone,
        is_demo: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await hrmRepo.saveCandidate(candidate);
    }

    // Check if candidate has already applied to this specific job
    const existingApps = await hrmRepo.getApplicationsByCandidateId(candidate.id);
    const alreadyApplied = existingApps.some((a) => a.job_id === jobId && !a.archived);
    if (alreadyApplied) {
      return NextResponse.json(
        { success: false, error: 'Bạn đã nộp hồ sơ ứng tuyển vào vị trí này rồi. Vui lòng theo dõi tiến trình tại Cổng ứng viên.' },
        { status: 400 }
      );
    }

    // Handle CV file upload if attached
    let cvFileId: string | undefined = undefined;
    if (cvFile && cvFile.size > 0) {
      const arrayBuffer = await cvFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const savedFile = await saveCvFile({
        buffer,
        originalName: cvFile.name,
        mimeType: cvFile.type,
        ownerType: 'candidate',
        ownerId: candidate.id,
      });
      await hrmRepo.saveFile(savedFile);
      cvFileId = savedFile.id;
    }

    const appId = `app-${Date.now()}`;
    const appCode = `HS-${currentYear}-${candidate.candidate_code.replace('UV-', '')}`;
    const now = new Date().toISOString();

    const application: ApplicationEntity = {
      id: appId,
      code: appCode,
      candidate_id: candidate.id,
      job_id: jobId,
      source,
      expected_salary: expectedSalary,
      current_company: currentCompany,
      cv_file_id: cvFileId,
      stage: 'new',
      stage_changed_at: now,
      archived: false,
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const savedApp = await hrmRepo.saveApplication(application);

    return NextResponse.json({
      success: true,
      data: {
        application: savedApp,
        candidate,
      },
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi nộp hồ sơ ứng tuyển';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
