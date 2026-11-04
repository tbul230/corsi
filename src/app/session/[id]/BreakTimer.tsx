'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui';
import TestModeBanner from '@/components/TestModeBanner';
import { CheckIcon, ConditionIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { BREAK_SECONDS, CONDITION_INFO } from '@/lib/constants';
import { playChime } from '@/lib/chime';
import { formatClock } from '@/lib/format';
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
    <div className="fade-up grid gap-6 lg:min-h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* Timer — the main element */}
      <section className="glass relative flex flex-col items-center justify-center overflow-hidden rounded-3xl px-5 py-10 text-center sm:px-10 sm:py-14 lg:py-16">
        <div
          aria-hidden
          className="breathe pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${info.accent}55, transparent 65%)` }}
        />
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" style={{ color: info.accent }}>
            <ConditionIcon condition={session.condition} className="h-5 w-5" />
          </span>
          <h1 className="text-base font-semibold sm:text-lg" data-testid="break-title">
            {info.title}
          </h1>
        </div>

        {finished ? (
          <div className="py-8" data-testid="break-finished">
            <div className="pop mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.45)]">
              <CheckIcon className="h-8 w-8" />
            </div>
            <p className="mt-5 text-2xl font-semibold sm:text-3xl">Break complete</p>
            <p className="mt-2 text-ink-2">Please return to your seat. The Corsi test is about to begin…</p>
            <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-navy-700">
              <div className="h-full animate-[grow_3.5s_linear_forwards] rounded-full bg-gradient-to-r from-sky-300 to-accent" style={{ width: 0 }} />
            </div>
            <style>{`@keyframes grow{to{width:100%}}`}</style>
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm text-ink-3 sm:mt-10">Time remaining</p>
            <p
              className="mt-1 font-semibold tabular-nums tracking-tight"
              style={{ fontSize: 'clamp(4.25rem, 19vw, 11rem)', lineHeight: 1 }}
              role="timer"
              aria-live="off"
              data-testid="timer">
              {formatClock(secondsLeft).slice(0, 3)}
              <span key={secondsLeft} className="tick">
                {formatClock(secondsLeft).slice(3)}
              </span>
            </p>
            <div
              className="mt-8 h-2.5 w-full max-w-lg overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] sm:mt-10"
              role="progressbar"
              aria-label="Break time remaining"
              aria-valuemin={0}
              aria-valuemax={BREAK_SECONDS}
              aria-valuenow={secondsLeft}>
              <div
                className="shimmer h-full rounded-full bg-gradient-to-r from-sky-300 via-accent to-[#3a78ec] shadow-[0_0_16px_rgba(77,141,255,0.8)] transition-[width] duration-1000 ease-linear"
                style={{ width: `${fraction * 100}%` }}
                data-testid="progress"
              />
            </div>
            <p className="mt-8 max-w-md text-base font-medium sm:text-lg">{info.timerPrompt}</p>
          </>
        )}
      </section>

      {/* Instructions */}
      <aside className="stagger flex flex-col gap-4">
        {error ? <Alert>{error}</Alert> : null}

        {session.is_test && !finished ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5">
            <TestModeBanner />
            <button
              className="btn btn-glass mt-3 w-full border-amber-300/40! text-amber-100"
              onClick={skip}
              disabled={skipping}
              data-testid="skip-break">
              {skipping ? 'Skipping…' : 'Skip break (test mode only)'}
            </button>
          </div>
        ) : null}

        {!finished ? (
          <>
            <div className="glass rounded-2xl p-5 sm:p-6">
              <h2 className="font-semibold">During your break</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-ink-2">
                {info.instructions.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    {t}
                  </li>
                ))}
                <li className="flex gap-2.5">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  The timer can&apos;t be paused, reset or skipped.
                </li>
              </ul>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="label">Started</dt>
                  <dd className="mt-0.5 tabular-nums">{new Date(session.break_started_at).toLocaleTimeString()}</dd>
                </div>
                <div>
                  <dt className="label">Ends</dt>
                  <dd className="mt-0.5 tabular-nums">{new Date(session.break_ends_at).toLocaleTimeString()}</dd>
                </div>
              </dl>
            </div>
            <div className="glass rounded-2xl p-5 text-sm text-ink-2 sm:p-6">
              <p>If you close this page, the break keeps running. Come back any time from your dashboard.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:flex-col">
                {notifyState === 'default' ? (
                  <button
                    className="btn btn-glass flex-1"
                    onClick={async () => setNotifyState(await Notification.requestPermission())}>
                    Notify me when it ends
                  </button>
                ) : null}
                <Link href="/dashboard" className="btn btn-glass flex-1">
                  Back to dashboard
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
