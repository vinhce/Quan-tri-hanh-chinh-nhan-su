import { NextResponse } from 'next/server';
import { formatJobCode } from '@/lib/hrm/ids';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import type { JobPostingEntity } from '@/lib/hrm/types';

export async function GET() {
  try {
    const list = await hrmRepo.getJobPostings();
    return NextResponse.json({ success: true, data: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      department_id,
      department_name,
      level,
      headcount_target,
      salary_min,
      salary_max,
      hiring_manager_name,
      deadline,
      location,
      work_mode,
      employment_type,
      overview,
      responsibilities,
      requirements,
      benefits,
    } = body;

    if (!title || !department_id || !deadline) {
      return NextResponse.json(
        { success: false, error: 'Thiếu thông tin bắt buộc để tạo tin tuyển dụng.' },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const deptPrefix = department_name.includes('Phần mềm')
      ? 'SWE'
      : department_name.includes('Dữ liệu')
      ? 'AI'
      : department_name.includes('Kinh doanh')
      ? 'SALES'
      : 'HR';

    const jobs = await hrmRepo.getJobPostings();
    const code = formatJobCode(currentYear, deptPrefix, jobs.length + 1);
    const now = new Date().toISOString();

    const newJob: JobPostingEntity = {
      id: `job-${Date.now()}`,
      code,
      title,
      department_id,
      department_name: department_name || 'Khối Kỹ thuật',
      level: level || 'Senior',
      headcount_target: Number(headcount_target) || 1,
      hired_count: 0,
      open_slots: Number(headcount_target) || 1,
      salary_min: Number(salary_min) || 0,
      salary_max: Number(salary_max) || 0,
      status: 'open',
      hiring_manager_name: hiring_manager_name || 'Ban Nhân sự',
      published_date: now.split('T')[0],
      deadline,
      location: location || 'Hà Nội / Hybrid',
      work_mode: work_mode || 'Hybrid',
      employment_type: employment_type || 'Toàn thời gian',
      overview,
      responsibilities: responsibilities || [],
      requirements: requirements || [],
      benefits: benefits || [],
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const saved = await hrmRepo.saveJobPosting(newJob);
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi tạo tin tuyển dụng';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
