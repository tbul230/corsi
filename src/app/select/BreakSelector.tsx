'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import { ArrowIcon, CheckIcon, ConditionIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import { primeChime } from '@/lib/chime';
import type { SessionSummary } from '@/lib/types';

const TEST_STEPS = [
  'Nine blocks appear in a 3 × 3 grid and some light up one at a time.',
  'Remember the order, then tap the blocks in that same order.',
  'Sequences start at 2 blocks and grow. The test ends after two misses at the same length.',
  'Plan for about 5 quiet, uninterrupted minutes after the break.'
];

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2 text-sm text-ink-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function BreakSelector({
  sessions,
  recommended
}: {
  sessions: SessionSummary[];
  recommended: Condition | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Condition | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const byCondition = new Map(sessions.map((s) => [s.condition, s]));

  // On phones the confirmation panel is below the cards: bring it into view.
  useEffect(() => {
    if (selected && window.innerWidth < 1024) confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  async function start() {
    if (!selected || !ack || busy) return;
    setBusy(true);
    setError(null);
    primeChime();
    try {
      const res = await api<{ session: SessionSummary }>('start-break', { condition: selected });
      router.replace(`/session/${res.session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the break.');
      setBusy(false);
      if (err instanceof ApiError && err.status === 409) router.refresh();
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="grid content-start gap-3 sm:gap-4" role="radiogroup" aria-label="Break condition">
        {CONDITIONS.map((c) => {
          const info = CONDITION_INFO[c];
          const s = byCondition.get(c);
          const completed = s?.status === 'completed';
          const isSelected = selected === c;
          return (
            <button
              key={c}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={completed}
              disabled={completed}
              data-testid={`card-${c}`}
              onClick={() => {
                setSelected(c);
                setAck(false);
                setError(null);
              }}
              className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 rounded-2xl border p-4 text-left transition-colors sm:p-5 ${
                completed
                  ? 'cursor-not-allowed border-line bg-navy-900/50 opacity-60'
                  : isSelected
                    ? 'border-accent bg-accent/8'
                    : 'border-line bg-navy-900 hover:border-line-strong hover:bg-navy-850'
              }`}>
              <span
                className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-navy-850 sm:h-14 sm:w-14"
                style={{ color: info.accent }}>
                <ConditionIcon condition={c} className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[1.05rem] font-semibold sm:text-lg">{info.title}</span>
                  {completed ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                      <CheckIcon className="h-3 w-3" /> COMPLETED
                    </span>
                  ) : recommended === c ? (
                    <span className="rounded-md bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">Suggested</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm text-ink-2">{info.description}</span>
                {completed ? (
                  <span className="mt-2 block text-sm">
                    Your Corsi score: <span className="font-semibold tabular-nums">{s!.corsi_span}</span>
                  </span>
                ) : (
                  <span className="mt-2 hidden text-sm text-ink-3 sm:block">{info.instructions[0]}</span>
                )}
              </span>
              <span className="text-right text-sm tabular-nums text-ink-3">15:00</span>
            </button>
          );
        })}
      </div>

      <div ref={confirmRef} className="scroll-mt-20">
        <div className="glass rounded-2xl p-5 sm:p-6 lg:sticky lg:top-20" data-testid={selected ? 'break-confirm' : undefined}>
          {selected ? (
            <>
              <p className="text-sm font-medium text-accent">Before you start</p>
              <h2 className="mt-1 text-xl font-semibold">{CONDITION_INFO[selected].title}</h2>
              <h3 className="mt-5 text-sm font-semibold">1. Your 15-minute break</h3>
              <div className="mt-2">
                <Bullets items={CONDITION_INFO[selected].instructions} />
              </div>
              <h3 className="mt-5 text-sm font-semibold">2. Then the Corsi test</h3>
              <div className="mt-2">
                <Bullets items={TEST_STEPS} />
              </div>
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-navy-950 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#4d8dff]"
                  data-testid="ack"
                />
                <span className="text-ink-2">
                  I understand that once I start, the break runs for exactly 15 minutes, can&apos;t be changed or skipped,
                  and this condition can never be repeated.
                </span>
              </label>
              {error ? (
                <div className="mt-4">
                  <Alert>{error}</Alert>
                </div>
              ) : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <button className="btn btn-primary flex-1" disabled={!ack || busy} onClick={start} data-testid="start-break">
                  {busy ? 'Starting…' : 'Start the 15-minute break'} <ArrowIcon className="h-4 w-4" />
                </button>
                <button className="btn btn-glass" onClick={() => setSelected(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="py-6 text-center lg:py-16">
              <p className="font-medium">Select a break condition</p>
              <p className="mt-1 text-sm text-ink-3">Its instructions will appear here before you start.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
