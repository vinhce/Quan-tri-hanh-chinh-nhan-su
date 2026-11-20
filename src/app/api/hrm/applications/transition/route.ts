import { NextResponse } from 'next/server';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import { transitionApplicationStage } from '@/lib/hrm/workflow';
import type { Actor, Stage, TerminalReason } from '@/lib/hrm/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = new URL(req.url);
    const appId = body.application_id || body.id || url.searchParams.get('id');

    const { toStage, actor, terminalReason, reason, expectedVersion } = body as {
      toStage: Stage;
      actor: Actor;
      terminalReason?: TerminalReason;
      reason?: string;
      expectedVersion?: number;
    };

    if (!appId) {
      return NextResponse.json({ success: false, error: 'Thiếu application_id' }, { status: 400 });
    }

    if (!actor) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin người thực hiện' }, { status: 400 });
    }

    const application = await hrmRepo.getApplicationById(appId);
    if (!application) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ ứng tuyển' }, { status: 404 });
    }

    // If moving to interview, fetch interview record
    let interview = undefined;
    if (toStage === 'interview') {
      interview = (await hrmRepo.getInterviewByApplicationId(appId)) || undefined;
    }

    const result = transitionApplicationStage({
      application,
      toStage,
      actor,
      interview,
      terminalReason,
      reason,
      expectedVersion,
    });

    const saved = await hrmRepo.saveApplication(result.application);

    return NextResponse.json({
      success: true,
      data: saved,
      eventId: result.eventId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi chuyển bước hồ sơ';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
