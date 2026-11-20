import { NextResponse } from 'next/server';
import { formatProposalCode } from '@/lib/hrm/ids';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import type { JobProposal } from '@/lib/hrm/types';

export async function GET() {
  try {
    const list = await hrmRepo.getProposals();
    return NextResponse.json({ success: true, data: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      department_id,
      department_name,
      title,
      level,
      headcount,
      salary_min,
      salary_max,
      deadline,
      urgency,
      reason,
      requested_by_id,
      requested_by_name,
    } = body;

    if (!department_id || !title || !headcount || !deadline || !reason) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng điền đầy đủ các thông tin bắt buộc của đề xuất tuyển dụng.' },
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

    const proposals = await hrmRepo.getProposals();
    const code = formatProposalCode(currentYear, deptPrefix, proposals.length + 1);
    const now = new Date().toISOString();

    const newProposal: JobProposal = {
      id: `prop-${Date.now()}`,
      code,
      department_id,
      department_name,
      title,
      level: level || 'Senior',
      headcount: Number(headcount) || 1,
      salary_min: Number(salary_min) || 0,
      salary_max: Number(salary_max) || 0,
      deadline,
      urgency: urgency || 'NORMAL',
      reason,
      status: 'pending_approval',
      requested_by_id: requested_by_id || 'NV-2024-006',
      requested_by_name: requested_by_name || 'Trưởng phòng Bộ phận',
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const saved = await hrmRepo.saveProposal(newProposal);
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi tạo đề xuất tuyển dụng';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
