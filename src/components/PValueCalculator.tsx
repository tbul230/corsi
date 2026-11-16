'use client';

import { useMemo, useState } from 'react';
import { CONDITION_INFO, type Condition } from '@/lib/constants';
import { pairSummaries, pEquals, pValuesText, P_CUTOFF, type PairSummary } from '@/lib/simple-results';
import type { ResultRow } from '@/lib/stats';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  }
  return { copied, copy };
}

function Dot({ c }: { c: Condition }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONDITION_INFO[c].accent }} />;
}

function PairCard({ pair, copied, onCopy }: { pair: PairSummary; copied: boolean; onCopy: () => void }) {
  const A = CONDITION_INFO[pair.a].short;
  const B = CONDITION_INFO[pair.b].short;
  return (
    <div className="glass-soft flex flex-col rounded-xl p-4 sm:p-5" data-testid={`pcalc-${pair.a}-${pair.b}`}>
      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
        <Dot c={pair.a} /> {A} <span className="font-normal text-ink-3">vs</span> <Dot c={pair.b} /> {B}
      </p>
      {pair.p == null ? (
        <p className="mt-3 text-sm text-ink-3">Needs at least 2 students who did both of these breaks.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-2">
            Average score: {A} <strong className="text-ink">{pair.averageA}</strong> · {B} <strong className="text-ink">{pair.averageB}</strong>
          </p>
          <p className="text-sm text-ink-2">
            Did better: <strong className="text-ink">{pair.better}</strong>
          </p>
          <div className="mt-3 flex items-center gap-3">
            <p className="select-text text-3xl font-semibold tabular-nums" data-testid="pcalc-p">
              {pEquals(pair.p)}
            </p>
            <button onClick={onCopy} className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-white/5" data-testid="copy-p">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p
            className={`mt-2 inline-flex w-fit rounded-md px-2.5 py-1 text-sm font-semibold ${pair.real ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/8 text-ink-2'}`}
            data-testid="pcalc-verdict">
            {pair.real ? 'Probably a real difference' : 'Could just be luck'}
          </p>
          <p className="mt-auto pt-3 text-xs text-ink-3">Based on {pair.students} students who did both breaks.</p>
        </>
      )}
    </div>
  );
}

/** Live p-values for each pair of breaks, in plain language. Updates whenever the results refresh. */
export default function PValueCalculator({ rows, conditions, updatedAt }: { rows: ResultRow[]; conditions: Condition[]; updatedAt?: string }) {
  const pairs = useMemo(() => pairSummaries(rows, conditions), [rows, conditions]);
  // Students who have done only one of the selected breaks can't be compared with themselves yet.
  const waiting = useMemo(() => {
    const done = new Map<string, Set<Condition>>();
    for (const r of rows) if (conditions.includes(r.condition)) done.set(r.participant, (done.get(r.participant) ?? new Set()).add(r.condition));
    return [...done.values()].filter((s) => s.size === 1).length;
  }, [rows, conditions]);
  const { copied, copy } = useCopy();

  return (
    <section className="glass rounded-2xl p-5 sm:p-6" data-testid="pvalue-calculator">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Is the difference real, or just luck?</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            The <strong>p-value</strong> tells you how likely it is that a difference this big happened just by luck. If p is{' '}
            <strong>less than {P_CUTOFF}</strong>, the difference is probably real.
          </p>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Each p-value compares the <strong>same students</strong> after two different breaks, so a student only counts once they have
            done both of those breaks.
            {waiting > 0 ? (
              <span className="text-amber-200" data-testid="pcalc-waiting">
                {' '}
                {waiting} {waiting === 1 ? 'student has' : 'students have'} only done one break so far and will count when they do another.
              </span>
            ) : null}
          </p>
          {updatedAt ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-ink-3" aria-live="polite" data-testid="pcalc-updated">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live · updated {new Date(updatedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
        {pairs.length ? (
          <button className="btn btn-glass text-sm" onClick={() => copy('all', pValuesText(pairs))} data-testid="copy-all-p">
            {copied === 'all' ? 'Copied!' : 'Copy all p-values'}
          </button>
        ) : null}
      </div>

      {pairs.length ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {pairs.map((pair) => (
            <PairCard
              key={`${pair.a}-${pair.b}`}
              pair={pair}
              copied={copied === pair.label}
              onCopy={() => copy(pair.label, `${pair.label}: ${pEquals(pair.p)}`)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-3">Pick at least two breaks (above the charts) to compare them.</p>
      )}
    </section>
  );
}
