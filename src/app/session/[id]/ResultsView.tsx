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
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300">
            <CheckIcon className="h-4 w-4" />
            {participant.is_test ? 'Saved as a test run (not counted)' : 'Saved to the study database'}
          </p>
          <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl lg:text-[2.1rem]">
            {participant.first_name} {participant.last_name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-ink-2">
            <ConditionIcon condition={s.condition} className="h-4.5 w-4.5" style={{ color: info.accent }} />
            {info.title}
            <span className="text-ink-3">· condition {s.condition_order} of 3 · {formatDateTime(s.test_completed_at)}</span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="glass flex flex-col items-center justify-center rounded-2xl p-6 text-center sm:p-8">
          <p className="label">Final Corsi span</p>
          <p className="mt-1 text-7xl font-semibold tabular-nums tracking-tight sm:text-8xl" data-testid="final-span">
            {s.corsi_span}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            longest sequence reproduced correctly
          </p>
        </section>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:content-start">
          <Stat label="Longest correct sequence" value={s.max_length_correct ?? '—'} hint="blocks" />
          <Stat label="Correct trials" value={s.correct_trials ?? '—'} />
          <Stat label="Incorrect trials" value={s.incorrect_trials ?? '—'} />
          <Stat label="Accuracy" value={formatPct(s.accuracy)} hint={`${s.total_attempts} attempts`} />
          <Stat label="Test duration" value={formatDuration(s.test_duration_seconds)} />
          <Stat
            label="Break duration"
            value={formatDuration(s.actual_break_seconds)}
            hint={s.break_skipped ? 'skipped (test mode)' : '15 min required'}
          />
          <Stat label="Total score" value={s.total_score ?? '—'} hint="span × correct trials" />
          <Stat label="Break interruptions" value={s.break_interruptions} hint="times the page was left" />
        </section>
      </div>

      {trials && trials.length ? (
        <div className="glass mt-6 overflow-hidden rounded-2xl">
          <h2 className="border-b border-line px-5 py-4 font-semibold sm:px-6">Trial by trial</h2>
          <div className="overflow-x-auto p-2 sm:p-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs font-medium text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Length</th>
                  <th className="px-3 py-2 font-medium">Shown</th>
                  <th className="px-3 py-2 font-medium">Your response</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
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
          Return to my dashboard <ArrowIcon className="h-4 w-4" />
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
