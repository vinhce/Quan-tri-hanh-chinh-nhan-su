import { NextResponse } from 'next/server';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import { transitionProposal } from '@/lib/hrm/workflow';
import type { Actor, ProposalStatus } from '@/lib/hrm/types';

export function generateStaticParams() {
  return [];
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const proposal = await hrmRepo.getProposalById(params.id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy đề xuất tuyển dụng' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: proposal });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi hệ thống';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { toStatus, reason, actor, expectedVersion } = body as {
      toStatus: ProposalStatus;
      reason?: string;
      actor: Actor;
      expectedVersion?: number;
    };

    if (!toStatus || !actor) {
      return NextResponse.json(
        { success: false, error: 'Thiếu trạng thái mục tiêu hoặc thông tin người thao tác.' },
        { status: 400 }
      );
    }

    const proposal = await hrmRepo.getProposalById(params.id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy đề xuất tuyển dụng' }, { status: 404 });
    }

    const result = transitionProposal({
      proposal,
      toStatus,
      actor,
      reason,
      expectedVersion,
    });

    const saved = await hrmRepo.saveProposal(result.proposal);
    return NextResponse.json({ success: true, data: saved, eventId: result.eventId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi cập nhật đề xuất tuyển dụng';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
