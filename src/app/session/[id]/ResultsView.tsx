'use client';

import Link from 'next/link';
import { Stat } from '@/components/ui';
import RedoButton from '@/components/RedoButton';
import TestModeBanner from '@/components/TestModeBanner';
import { ArrowIcon, CheckIcon, ConditionIcon } from '@/components/icons';
import { CONDITION_INFO } from '@/lib/constants';
import { formatDateTime, formatDuration, formatPct } from '@/lib/format';
import type { SessionDetail } from '@/lib/types';

export default function ResultsView({ detail }: { detail: SessionDetail }) {
  const { session: s, participant, trials } = detail;
  const info = CONDITION_INFO[s.condition];

  return (
    <div className="fade-up" data-testid="results">
      {participant.is_test ? <TestModeBanner className="mb-4" /> : null}
      <div className="glass relative overflow-hidden rounded-[36px] p-7 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl"
          style={{ background: info.accent, opacity: 0.16 }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">
              <CheckIcon className="h-3.5 w-3.5" /> {participant.is_test ? 'Saved as a test run (not counted)' : 'Saved to the study database'}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {participant.first_name} {participant.last_name}
            </h1>
            <p className="mt-1 flex items-center gap-2 muted">
              <ConditionIcon condition={s.condition} className="h-5 w-5" style={{ color: info.accent }} />
              {info.title} · condition {s.condition_order} of 3
            </p>
            <p className="mt-1 text-sm muted">Completed {formatDateTime(s.test_completed_at)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] muted">Corsi span</p>
            <p className="text-7xl font-semibold tabular-nums tracking-tight sm:text-8xl" data-testid="final-span">
              {s.corsi_span}
            </p>
          </div>
        </div>

        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Longest correct sequence" value={s.max_length_correct ?? '—'} hint="blocks" />
          <Stat label="Correct trials" value={s.correct_trials ?? '—'} />
          <Stat label="Incorrect trials" value={s.incorrect_trials ?? '—'} />
          <Stat label="Accuracy" value={formatPct(s.accuracy)} hint={`${s.total_attempts} attempts`} />
          <Stat label="Test duration" value={formatDuration(s.test_duration_seconds)} />
          <Stat label="Break duration" value={formatDuration(s.actual_break_seconds)} hint="15 min required" />
          <Stat label="Total score" value={s.total_score ?? '—'} hint="span × correct trials" />
          <Stat label="Break interruptions" value={s.break_interruptions} hint="times the page was left" />
        </div>
      </div>

      {trials && trials.length ? (
        <div className="glass mt-6 overflow-hidden rounded-[30px]">
          <h2 className="px-6 pt-6 text-lg font-semibold">Trial by trial</h2>
          <div className="overflow-x-auto p-2 sm:p-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider muted">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Length</th>
                  <th className="px-3 py-2 font-medium">Shown</th>
                  <th className="px-3 py-2 font-medium">Your response</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {trials.map((t) => (
                  <tr key={t.trial_number}>
                    <td className="px-3 py-2 tabular-nums muted">{t.trial_number}</td>
                    <td className="px-3 py-2 tabular-nums">{t.sequence_length}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.sequence.map((b) => b + 1).join(' → ')}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.response.map((b) => b + 1).join(' → ')}</td>
                    <td className="px-3 py-2">
                      <span className={t.is_correct ? 'text-emerald-300' : 'text-red-300'}>
                        {t.is_correct ? 'Correct' : 'Incorrect'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.response_time_ms != null ? `${(t.response_time_ms / 1000).toFixed(2)} s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 pt-3 text-xs muted">Blocks are numbered 1–9, left to right, top to bottom.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn btn-primary" data-testid="back-dashboard">
          Return to my dashboard <ArrowIcon className="h-5 w-5" />
        </Link>
        <Link href="/results" className="btn btn-glass">
          See experiment results
        </Link>
      </div>
      {participant.is_test ? (
        <div className="mt-4 flex items-center gap-3 text-sm muted">
          Test run — <RedoButton condition={s.condition} label="Redo this condition" />
        </div>
      ) : (
        <p className="mt-4 text-sm muted">This condition is complete and locked — it cannot be repeated or changed.</p>
      )}
    </div>
  );
}
