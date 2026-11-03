import { NextResponse, type NextRequest } from 'next/server';
import { CONDITIONS, type Condition } from '@/lib/constants';
import {
  callRpc,
  clearParticipantToken,
  errorResponse,
  getParticipantToken,
  RpcError,
  setParticipantToken
} from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BREAK_EVENTS = ['page_opened', 'page_closed', 'tab_hidden', 'tab_visible'];

function bad(message: string) {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
}

function str(v: unknown, max = 100) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : null;
}

async function requireToken() {
  const token = await getParticipantToken();
  if (!token) throw new RpcError('NOT_AUTHENTICATED', 401, 'Please register or sign in first.');
  return token;
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
    switch (action) {
      case 'check-name': {
        const first = str(body.firstName, 60);
        const last = str(body.lastName, 60);
        if (!first || !last) return bad('First and last name are required.');
        const available = await callRpc<boolean>('check_name_available', {
          p_first_name: first,
          p_last_name: last
        });
        return NextResponse.json({ available });
      }

      case 'register': {
        const first = str(body.firstName, 60);
        const last = str(body.lastName, 60);
        if (!first || !last) return bad('First and last name are required.');
        const consent = body.consent as Record<string, unknown> | undefined;
        const result = await callRpc<{ token: string }>('register_participant', {
          p_first_name: first,
          p_last_name: last,
          p_consent_participation: consent?.participation === true,
          p_consent_quiet_environment: consent?.quiet === true,
          p_consent_guidelines: consent?.guidelines === true
        });
        const { token, ...state } = result;
        await setParticipantToken(token);
        return NextResponse.json(state);
      }

      case 'resume': {
        const first = str(body.firstName, 60);
        const last = str(body.lastName, 60);
        const code = str(body.accessCode, 12);
        if (!first || !last || !code) return bad('Name and access code are required.');
        const result = await callRpc<{ token: string }>('resume_participant', {
          p_first_name: first,
          p_last_name: last,
          p_access_code: code
        });
        const { token, ...state } = result;
        await setParticipantToken(token);
        return NextResponse.json(state);
      }

      case 'logout': {
        const token = await getParticipantToken();
        if (token) await callRpc('logout_participant', { p_token: token }).catch(() => undefined);
        await clearParticipantToken();
        return NextResponse.json({ ok: true });
      }

      case 'state': {
        const token = await requireToken();
        return NextResponse.json(await callRpc('get_participant_state', { p_token: token }));
      }

      case 'start-break': {
        const token = await requireToken();
        const condition = body.condition as Condition;
        if (!CONDITIONS.includes(condition)) return bad('Unknown break condition.');
        return NextResponse.json(
          await callRpc('start_break', { p_token: token, p_condition: condition })
        );
      }

      case 'session': {
        const token = await requireToken();
        if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return bad('Invalid session.');
        return NextResponse.json(
          await callRpc('get_session', { p_token: token, p_session: body.sessionId })
        );
      }

      case 'break-event': {
        const token = await requireToken();
        if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return bad('Invalid session.');
        if (typeof body.event !== 'string' || !BREAK_EVENTS.includes(body.event)) return bad('Invalid event.');
        const remaining = Number.isFinite(body.remaining) ? Math.round(body.remaining as number) : null;
        await callRpc('record_break_event', {
          p_token: token,
          p_session: body.sessionId,
          p_event: body.event,
          p_remaining: remaining
        });
        return NextResponse.json({ ok: true });
      }

      case 'complete-break': {
        const token = await requireToken();
        if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return bad('Invalid session.');
        return NextResponse.json(
          await callRpc('complete_break', { p_token: token, p_session: body.sessionId })
        );
      }

      case 'next-trial': {
        const token = await requireToken();
        if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return bad('Invalid session.');
        return NextResponse.json(
          await callRpc('next_trial', { p_token: token, p_session: body.sessionId })
        );
      }

      case 'submit-trial': {
        const token = await requireToken();
        if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return bad('Invalid session.');
        const response = body.response;
        if (
          !Array.isArray(response) ||
          response.length < 1 ||
          response.length > 9 ||
          !response.every((n) => Number.isInteger(n) && n >= 0 && n <= 8)
        ) {
          return bad('Invalid response.');
        }
        const rt = Number.isFinite(body.responseTimeMs) ? Math.round(body.responseTimeMs as number) : null;
        return NextResponse.json(
          await callRpc('submit_trial', {
            p_token: token,
            p_session: body.sessionId,
            p_response: response,
            p_response_time_ms: rt
          })
        );
      }

      default:
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
