import { NextResponse } from 'next/server';
import { hrmRepo } from '@/lib/hrm/repo.mysql';
import { transitionInterview } from '@/lib/hrm/workflow';
import type { Actor, InterviewEntity, InterviewStatus } from '@/lib/hrm/types';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const appId = url.searchParams.get('application_id');
    if (!appId) {
      const list = await hrmRepo.getInterviews();
      return NextResponse.json({ success: true, data: list });
    }
    const interview = await hrmRepo.getInterviewByApplicationId(appId);
    return NextResponse.json({ success: true, data: interview });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      application_id,
      slot,
      mode,
      location_or_link,
      interviewer_names,
      interviewer_ids,
      score,
      note,
    } = body;

    if (!application_id || !slot) {
      return NextResponse.json(
        { success: false, error: 'Thiếu application_id hoặc thời gian phỏng vấn' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const interview: InterviewEntity = {
      id: `int-${Date.now()}`,
      application_id,
      slot,
      mode: mode || 'Online',
      location_or_link: location_or_link || '',
      interviewer_names: interviewer_names || 'Hội đồng phỏng vấn',
      interviewer_ids: interviewer_ids || [],
      status: 'invited',
      score,
      note,
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const saved = await hrmRepo.saveInterview(interview);
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi tạo lịch phỏng vấn';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      toStatus,
      actor,
      payload,
      reason,
      expectedVersion,
    } = body as {
      id: string;
      toStatus: InterviewStatus;
      actor: Actor;
      payload?: {
        slot?: string;
        mode?: 'Online' | 'Offline';
        location_or_link?: string;
        interviewer_names?: string;
        proposed_slot?: string;
        proposed_slot_text?: string;
        reschedule_reason?: string;
        score?: number;
        note?: string;
      };
      reason?: string;
      expectedVersion?: number;
    };

    if (!id || !toStatus || !actor) {
      return NextResponse.json(
        { success: false, error: 'Thiếu id, toStatus hoặc thông tin người thao tác.' },
        { status: 400 }
      );
    }

    const interviews = await hrmRepo.getInterviews();
    const current = interviews.find((i) => i.id === id);
    if (!current) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy lịch phỏng vấn' }, { status: 404 });
    }

    const result = transitionInterview({
      interview: current,
      toStatus,
      actor,
      payload,
      reason,
      expectedVersion,
    });

    const saved = await hrmRepo.saveInterview(result.interview);

    return NextResponse.json({
      success: true,
      data: saved,
      eventId: result.eventId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi khi cập nhật lịch phỏng vấn';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
