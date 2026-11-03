'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import { ArrowIcon, CheckIcon, ConditionIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import { primeChime } from '@/lib/chime';
import type { SessionSummary } from '@/lib/types';

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
  const byCondition = new Map(sessions.map((s) => [s.condition, s]));

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
    <>
      <div className="mt-8 grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Break condition">
        {CONDITIONS.map((c, i) => {
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
              className={`glass fade-up group rounded-[30px] p-6 text-left transition duration-300 ${
                completed
                  ? 'cursor-not-allowed opacity-55'
                  : isSelected
                    ? 'ring-2 ring-sky-200/80 -translate-y-1'
                    : 'hover:-translate-y-1 hover:bg-white/10'
              }`}
              style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-start justify-between">
                <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white/10" style={{ color: info.accent }}>
                  <ConditionIcon condition={c} className="h-9 w-9" />
                </div>
                {completed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                    <CheckIcon className="h-3.5 w-3.5" /> COMPLETED
                  </span>
                ) : recommended === c ? (
                  <span className="rounded-full bg-sky-300/15 px-3 py-1 text-xs font-medium text-sky-100">Suggested next</span>
                ) : null}
              </div>
              <h2 className="mt-5 text-xl font-semibold">{info.title}</h2>
              <p className="mt-1 text-sm muted">{info.description}</p>
              {completed ? (
                <p className="mt-4 text-sm">
                  Your Corsi score: <span className="text-2xl font-semibold tabular-nums">{s!.corsi_span}</span>
                </p>
              ) : (
                <ul className="mt-4 space-y-1.5 text-sm text-white/80">
                  {info.instructions.slice(0, 2).map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs font-medium uppercase tracking-wider muted">15:00 minutes</p>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="glass fade-up mt-6 rounded-[30px] p-6 sm:p-8" data-testid="break-confirm">
          <h2 className="text-2xl font-semibold">Before you start: {CONDITION_INFO[selected].title}</h2>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-200/80">1 · Your 15-minute break</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/85">
                {CONDITION_INFO[selected].instructions.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-200/80">2 · Then the Corsi test</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/85">
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />Nine blocks appear in a 3 × 3 grid. Some light up one at a time.</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />Remember the order, then tap the blocks in that same order.</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />Sequences start at 2 blocks and get longer. The test ends after two misses at the same length.</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/50" />Have about 5 minutes of quiet, uninterrupted time ready after the break.</li>
              </ul>
            </div>
          </div>
          <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-sky-300"
              data-testid="ack"
            />
            I understand: once I start, the break runs for exactly 15 minutes, cannot be changed or skipped, and this
            condition can never be repeated.
          </label>
          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={!ack || busy} onClick={start} data-testid="start-break">
              {busy ? 'Starting…' : 'Start the 15-minute break'} <ArrowIcon className="h-5 w-5" />
            </button>
            <button className="btn btn-glass" onClick={() => setSelected(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
