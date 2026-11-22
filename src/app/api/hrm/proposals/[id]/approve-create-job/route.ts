import { NextResponse } from 'next/server';
import { can } from '@/lib/hrm/permissions';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import type { Actor, JobPostingEntity } from '@/lib/hrm/types';

export function generateStaticParams() {
  return [{ id: '__static_placeholder__' }];
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { actor, jobData } = body as {
      actor: Actor;
      jobData?: Partial<JobPostingEntity>;
    };

    if (!actor) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin người thực hiện' }, { status: 400 });
    }

    const proposal = await hrmRepo.getProposalById(params.id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy đề xuất' }, { status: 404 });
    }

    if (!can(actor, 'approve_proposal', { headcount: proposal.headcount, salary: proposal.salary_max })) {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền duyệt đề xuất này (cần quyền Giám đốc nếu vượt định biên/ngân sách).' },
        { status: 403 }
      );
    }

    const result = await hrmRepo.approveAndCreateJob(
      params.id,
      jobData || {},
      actor.id,
      actor.name
    );

    return NextResponse.json({
      success: true,
      data: {
        proposal: result.proposal,
        job: result.job,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi duyệt & tạo tin tuyển dụng';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
