'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui';
import TestModeBanner from '@/components/TestModeBanner';
import { CheckIcon, ConditionIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { BREAK_SECONDS, CONDITION_INFO } from '@/lib/constants';
import { playChime } from '@/lib/chime';
import { formatClock, formatDateTime } from '@/lib/format';
import type { SessionDetail, SessionSummary } from '@/lib/types';

const TRANSITION_MS = 3500;

/**
 * The 15-minute break. Remaining time is always derived from the server's
 * break_ends_at timestamp and a measured client↔server clock offset, so it is
 * correct after refreshes, background tabs, sleep, or closing the browser.
 * setInterval is only used to repaint — never to count time.
 */
export default function BreakTimer({
  session,
  onComplete
}: {
  session: SessionSummary;
  onComplete: (s: SessionSummary) => void;
}) {
  const info = CONDITION_INFO[session.condition];
  const endsAt = new Date(session.break_ends_at).getTime();
  const offsetRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>('default');
  const completingRef = useRef(false);

  const remainingNow = useCallback(() => {
    const offset = offsetRef.current ?? 0;
    return endsAt - (Date.now() + offset);
  }, [endsAt]);

  // Measure the clock offset against the server (NTP-style, using round-trip midpoint).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t0 = Date.now();
        const fresh = await api<SessionDetail>('session', { sessionId: session.id });
        const t1 = Date.now();
        if (cancelled) return;
        offsetRef.current = new Date(fresh.server_now).getTime() - (t0 + t1) / 2;
      } catch {
        offsetRef.current = 0;
      }
      if (!cancelled) setRemainingMs(remainingNow());
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, remainingNow]);

  // Integrity logging: page opened / hidden / visible / closed.
  useEffect(() => {
    const send = (event: string) => {
      const remaining = Math.max(0, Math.round(remainingNow() / 1000));
      const body = JSON.stringify({ sessionId: session.id, event, remaining });
      if (event === 'page_closed' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/participant/break-event', new Blob([body], { type: 'application/json' }));
      } else {
        void fetch('/api/participant/break-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true
        }).catch(() => undefined);
      }
    };
    send('page_opened');
    const onVis = () => send(document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible');
    const onHide = () => send('page_closed');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      // SPA navigation away from the timer also counts as leaving the break page.
      if (!completingRef.current) send('page_closed');
    };
  }, [session.id, remainingNow]);

  useEffect(() => {
    setNotifyState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  const [skipping, setSkipping] = useState(false);
  async function skip() {
    setSkipping(true);
    try {
      completingRef.current = true;
      const res = await api<{ session: SessionSummary }>('skip-break', { sessionId: session.id });
      onComplete(res.session);
    } catch (err) {
      completingRef.current = false;
      setError(err instanceof ApiError ? err.message : 'Could not skip the break.');
      setSkipping(false);
    }
  }

  const complete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setFinished(true);
    playChime();
    document.title = 'Break complete · Corsi Experiment';
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification('Your 15-minute break is over', { body: 'Return to the Corsi Experiment to take the test.' });
      }
    } catch {
      /* ignore */
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const res = await api<{ session: SessionSummary }>('complete-break', { sessionId: session.id });
        setTimeout(() => onComplete(res.session), TRANSITION_MS);
        return;
      } catch (err) {
        // Small clock disagreements: the server is authoritative, so wait and retry.
        if (err instanceof ApiError && err.code === 'BREAK_NOT_FINISHED') {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        if (err instanceof ApiError && err.code === 'NETWORK') {
          setError('Connection lost — retrying…');
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        setError(err instanceof ApiError ? err.message : 'Could not record the end of the break.');
        completingRef.current = false;
        return;
      }
    }
  }, [session.id, onComplete]);

  // Repaint loop (time is computed from timestamps on every tick).
  useEffect(() => {
    if (remainingMs === null) return;
    const tick = () => {
      const r = remainingNow();
      setRemainingMs(r);
      if (r <= 0) void complete();
      else document.title = `${formatClock(Math.ceil(r / 1000))} · ${info.short} break`;
    };
    tick();
    const id = window.setInterval(tick, 250);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs === null, remainingNow, complete, info.short]);

  useEffect(() => () => void (document.title = 'Corsi Experiment'), []);

  const secondsLeft = remainingMs === null ? BREAK_SECONDS : Math.max(0, Math.ceil(remainingMs / 1000));
  const fraction = remainingMs === null ? 1 : Math.max(0, Math.min(1, remainingMs / (BREAK_SECONDS * 1000)));

  return (
    <div className="fade-up mx-auto max-w-2xl text-center">
      <div className="glass relative overflow-hidden rounded-[40px] px-6 py-10 sm:px-12 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: info.accent, opacity: 0.18 }}
        />
        <div className="relative">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10" style={{ color: info.accent }}>
            <ConditionIcon condition={session.condition} className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-white/90" data-testid="break-title">
            {info.title}
          </h1>

          {finished ? (
            <div className="py-6" data-testid="break-finished">
              <div className="mx-auto mt-6 grid h-20 w-20 place-items-center rounded-full bg-emerald-400/20 text-emerald-200">
                <CheckIcon className="h-10 w-10" />
              </div>
              <p className="mt-6 text-3xl font-semibold">Break complete!</p>
              <p className="mt-2 muted">Please return to your seat. The Corsi test is about to begin…</p>
              <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-white/10">
                <div className="h-full animate-[grow_3.5s_linear_forwards] rounded-full bg-sky-200" style={{ width: 0 }} />
              </div>
              <style>{`@keyframes grow{to{width:100%}}`}</style>
            </div>
          ) : (
            <>
              <p className="mt-8 text-sm muted">Time remaining</p>
              <p
                className="mt-1 font-semibold tabular-nums tracking-tight"
                style={{ fontSize: 'clamp(4.5rem, 20vw, 9rem)', lineHeight: 1 }}
                role="timer"
                aria-live="off"
                data-testid="timer">
                {formatClock(secondsLeft)}
              </p>
              <div
                className="mx-auto mt-8 h-3 w-full max-w-md overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-label="Break time remaining"
                aria-valuemin={0}
                aria-valuemax={BREAK_SECONDS}
                aria-valuenow={secondsLeft}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-300 to-white transition-[width] duration-300 ease-linear"
                  style={{ width: `${fraction * 100}%` }}
                  data-testid="progress"
                />
              </div>
              <p className="mt-8 text-lg font-medium">{info.timerPrompt}</p>
            </>
          )}
        </div>
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      {session.is_test && !finished ? (
        <div className="mt-6">
          <TestModeBanner />
          <button className="btn btn-glass mt-3 border-amber-300/40! text-amber-100" onClick={skip} disabled={skipping} data-testid="skip-break">
            {skipping ? 'Skipping…' : 'Skip break (test mode only)'}
          </button>
        </div>
      ) : null}

      {!finished ? (
        <div className="mt-6 space-y-3 text-sm muted">
          <ul className="glass-soft mx-auto max-w-xl space-y-1.5 rounded-3xl p-5 text-left">
            {info.instructions.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />
                {t}
              </li>
            ))}
            <li className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />
              The timer cannot be paused, reset or skipped. Started {formatDateTime(session.break_started_at)}; ends{' '}
              {formatDateTime(session.break_ends_at)}.
            </li>
          </ul>
          {notifyState === 'default' ? (
            <button
              className="btn btn-glass text-sm"
              onClick={async () => setNotifyState(await Notification.requestPermission())}>
              Notify me when the break ends
            </button>
          ) : null}
          <p>
            If you close this page, the break keeps running.{' '}
            <Link href="/dashboard" className="underline">Return to dashboard</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
