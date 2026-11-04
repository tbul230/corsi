'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui';
import { ArrowIcon, CheckIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { CONDITION_INFO, CORSI_RULES, CORSI_TIMING } from '@/lib/constants';
import type { NextTrialResponse, SessionSummary, TrialSpec } from '@/lib/types';

type Phase = 'intro' | 'loading' | 'watch' | 'respond' | 'submitting' | 'feedback' | 'done';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function CorsiTest({
  session,
  onFinished
}: {
  session: SessionSummary;
  onFinished: () => void;
}) {
  const resumed = session.status === 'test_in_progress';
  const [phase, setPhase] = useState<Phase>('intro');
  const [trial, setTrial] = useState<TrialSpec | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [tapped, setTapped] = useState<number | null>(null);
  const [response, setResponse] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const respondStart = useRef(0);
  const responseRef = useRef<number[]>([]);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Discourage leaving mid-test (the test cannot be paused or restarted).
  useEffect(() => {
    if (phase === 'intro' || phase === 'done') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const present = useCallback(async (t: TrialSpec) => {
    setTrial(t);
    setResponse([]);
    responseRef.current = [];
    setFeedback(null);
    setLit(null);
    setPhase('watch');
    await sleep(CORSI_TIMING.preSequenceMs);
    for (let i = 0; i < t.sequence.length; i++) {
      if (!alive.current) return;
      setLit(t.sequence[i]);
      await sleep(CORSI_TIMING.blockOnMs);
      setLit(null);
      if (i < t.sequence.length - 1) await sleep(CORSI_TIMING.interBlockMs);
    }
    if (!alive.current) return;
    respondStart.current = performance.now();
    setPhase('respond');
  }, []);

  const begin = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPhase('loading');
    try {
      const res = await api<NextTrialResponse>('next-trial', { sessionId: session.id });
      if (res.finished) {
        setPhase('done');
        onFinished();
        return;
      }
      busy.current = false;
      await present(res.trial);
    } catch (err) {
      busy.current = false;
      if (err instanceof ApiError && err.code === 'TEST_ALREADY_COMPLETED') {
        onFinished();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load the next trial.');
      setPhase('intro');
    }
  }, [session.id, present, onFinished]);

  const submit = useCallback(
    async (resp: number[], rt: number) => {
      setPhase('submitting');
      let res: NextTrialResponse | null = null;
      for (let attempt = 0; attempt < 5 && !res; attempt++) {
        try {
          res = await api<NextTrialResponse>('submit-trial', {
            sessionId: session.id,
            response: resp,
            responseTimeMs: Math.round(rt)
          });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'NETWORK') {
            setError('Connection problem — retrying…');
            await sleep(1500 * (attempt + 1));
            continue;
          }
          setError(err instanceof ApiError ? err.message : 'Could not save your response.');
          return;
        }
      }
      if (!res) {
        setError('Could not reach the server. Your progress up to the previous trial is saved — reload the page to continue.');
        return;
      }
      setError(null);
      const correct = Boolean(res.correct);
      setFeedback(correct);
      setPhase('feedback');
      await sleep(CORSI_TIMING.feedbackMs);
      if (!alive.current) return;
      if (res.finished) {
        setPhase('done');
        onFinished();
      } else {
        await present(res.trial);
      }
    },
    [session.id, present, onFinished]
  );

  function tap(block: number) {
    if (phase !== 'respond' || !trial) return;
    if (responseRef.current.length >= trial.sequence.length) return;
    const next = [...responseRef.current, block];
    responseRef.current = next;
    setResponse(next);
    setTapped(block);
    setTimeout(() => setTapped((t) => (t === block ? null : t)), CORSI_TIMING.tapFlashMs);
    if (next.length === trial.sequence.length) {
      void submit(next, performance.now() - respondStart.current);
    }
  }

  if (phase === 'intro') {
    const steps: [string, React.ReactNode][] = [
      ['Watch', 'Blocks light up one at a time.'],
      ['Remember', <>Keep the <strong className="text-ink">order</strong> in mind.</>],
      ['Repeat', <>When it says <em>“Your turn”</em>, tap the blocks in that same order.</>],
      ['Grow', 'Each correct answer adds one block. Two misses at the same length end the test.']
    ];
    return (
      <div className="stagger grid gap-6 lg:min-h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
        <section className="glass rounded-2xl p-6 sm:p-8 lg:p-10">
          {!resumed ? (
            <p className="pop inline-flex items-center gap-2 rounded-lg bg-emerald-500/12 px-2.5 py-1 text-sm font-medium text-emerald-300">
              <CheckIcon className="h-4 w-4" /> {CONDITION_INFO[session.condition].title} complete
            </p>
          ) : null}
          <h1 className="mt-4 text-[1.65rem] font-semibold sm:text-3xl lg:text-4xl">
            {resumed ? 'Resume your Corsi test' : 'Corsi Block-Tapping Test'}
          </h1>
          <ol className="stagger mt-6 divide-y divide-white/8 border-y border-white/8">
            {steps.map(([t, d], i) => (
              <li key={t} className="flex gap-4 py-4">
                <span className="mt-0.5 font-mono text-sm text-ink-3">0{i + 1}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="text-sm text-ink-2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className="glass flex flex-col justify-center rounded-2xl p-6 sm:p-8">
          <div className="mx-auto grid w-40 grid-cols-3 gap-1.5" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={`corsi-block ${i === 0 || i === 4 || i === 8 ? 'demo-lit' : ''}`} style={{ animationDelay: `${(i / 4) * 1.2}s` }} />
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-2">
            Once started, the test can&apos;t be paused or restarted. Don&apos;t write anything down or use any help.
            {resumed ? ' Because the test was interrupted, you will continue at your current length with a new sequence.' : ''}
          </p>
          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <button className="btn btn-primary mt-6 w-full" onClick={() => void begin()} data-testid="begin-test">
            {resumed ? 'Resume test' : "I'm ready, begin the test"} <ArrowIcon className="h-4 w-4" />
          </button>
        </aside>
      </div>
    );
  }

  const statusText =
    phase === 'loading'
      ? 'Preparing…'
      : phase === 'watch'
        ? 'Watch carefully'
        : phase === 'respond'
          ? 'Your turn — tap the blocks in order'
          : phase === 'submitting'
            ? 'Saving…'
            : phase === 'feedback'
              ? feedback
                ? 'Correct'
                : 'Incorrect'
              : 'Saving your results…';

  return (
    // Full-screen, distraction-free test surface
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy-950 px-4" data-testid="corsi-surface">
      <div className="mb-6 text-center">
        <p className="text-sm tabular-nums text-ink-3" data-testid="trial-meta">
          {trial ? `Trial ${trial.trial_number} · ${trial.sequence_length} blocks` : ' '}
        </p>
        <p
          className={`mt-2 h-9 text-2xl font-semibold transition-colors ${
            phase === 'feedback' ? (feedback ? 'text-emerald-300' : 'text-red-300') : phase === 'respond' ? 'text-accent' : 'text-ink'
          }`}
          data-testid="status"
          aria-live="polite">
          {statusText}
        </p>
      </div>
      <div
        className="grid w-full max-w-[min(92vw,64vh,600px)] grid-cols-3 gap-3 sm:gap-4"
        data-phase={phase}
        data-testid="corsi-grid">
        {Array.from({ length: CORSI_RULES.blocks }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Block ${i + 1}`}
            className="corsi-block"
            data-block={i}
            data-lit={lit === i}
            data-tapped={tapped === i}
            data-clickable={phase === 'respond'}
            disabled={phase !== 'respond'}
            onPointerDown={(e) => {
              e.preventDefault();
              tap(i);
            }}
            onClick={(e) => {
              // keyboard activation (Enter/Space) — pointer taps are handled on pointerdown
              if (e.detail === 0) tap(i);
            }}
          />
        ))}
      </div>
      <div className="mt-6 flex h-4 gap-2" aria-hidden>
        {trial && (phase === 'respond' || phase === 'submitting' || phase === 'feedback')
          ? Array.from({ length: trial.sequence_length }, (_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < response.length ? 'bg-accent' : 'bg-navy-700'}`} />
            ))
          : null}
      </div>
      {error ? <div className="mt-6 max-w-md"><Alert>{error}</Alert></div> : null}
    </div>
  );
}
