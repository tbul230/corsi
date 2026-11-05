import { NextResponse, type NextRequest } from 'next/server';
import { CONDITIONS, type Condition } from '@/lib/constants';
import { errorResponse, requireUser } from '@/lib/participant-server';
import * as X from '@/lib/server/experiment';

export const dynamic = 'force-dynamic';

const SID = /^[A-Za-z0-9_-]{1,160}__(video_game|youtube|no_screen)$/;
const BREAK_EVENTS = ['page_opened', 'page_closed', 'tab_hidden', 'tab_visible'];

function bad(message: string) {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
}

type Body = Record<string, unknown>;

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  let body: Body = {};
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as Body) : {};
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad('Invalid JSON body.');
  } catch {
    return bad('Invalid JSON body.');
  }

  try {
    const user = await requireUser();
    const pid = user.pid;
    const sid = typeof body.sessionId === 'string' ? body.sessionId : '';
    const needSid = () => {
      if (!SID.test(sid) || !sid.startsWith(`${pid}__`)) throw new X.ExperimentError('SESSION_NOT_FOUND');
    };

    switch (action) {
      case 'register': {
        if (pid.startsWith('test_')) throw new X.ExperimentError('ALREADY_REGISTERED');
        const consent = (body.consent ?? {}) as Record<string, unknown>;
        return NextResponse.json(await X.registerParticipant(pid, { consent }));
      }

      case 'state': {
        const state = await X.getParticipantState(pid);
        if (!state) throw new X.ExperimentError('NOT_REGISTERED');
        return NextResponse.json(state);
      }

      case 'start-break': {
        const condition = body.condition as Condition;
        if (!CONDITIONS.includes(condition)) return bad('Unknown break condition.');
        return NextResponse.json(await X.startBreak(pid, condition));
      }

      case 'session':
        needSid();
        return NextResponse.json(await X.getSessionDetail(pid, sid));

      case 'break-event': {
        needSid();
        if (typeof body.event !== 'string' || !BREAK_EVENTS.includes(body.event)) return bad('Invalid event.');
        const remaining = Number.isFinite(body.remaining) ? (body.remaining as number) : null;
        await X.recordBreakEvent(pid, sid, body.event, remaining);
        return NextResponse.json({ ok: true });
      }

      case 'complete-break':
        needSid();
        return NextResponse.json(await X.completeBreak(pid, sid));

      case 'skip-break':
        needSid();
        return NextResponse.json(await X.skipBreak(pid, sid));

      case 'next-trial':
        needSid();
        return NextResponse.json(await X.nextTrial(pid, sid, body.inputType));

      case 'submit-trial':
        needSid();
        return NextResponse.json(await X.submitTrial(pid, sid, body.response, body.responseTimeMs));

      case 'reset-condition': {
        const condition = body.condition as Condition;
        if (!CONDITIONS.includes(condition)) return bad('Unknown break condition.');
        return NextResponse.json(await X.resetTestCondition(pid, condition));
      }

      default:
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
