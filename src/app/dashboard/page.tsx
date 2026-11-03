import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, Card, Container, Eyebrow, StatusPill } from '@/components/ui';
import { ArrowIcon, ConditionIcon } from '@/components/icons';
import LogoutButton from '@/components/LogoutButton';
import RedoButton from '@/components/RedoButton';
import TestModeBanner from '@/components/TestModeBanner';
import { CONDITIONS, CONDITION_INFO } from '@/lib/constants';
import { formatDateTime, formatPct } from '@/lib/format';
import { loadParticipantState } from '@/lib/participant-server';
import { conditionStatus, progressOf } from '@/lib/progress';
import type { ParticipantState } from '@/lib/types';

export const metadata: Metadata = { title: 'My progress' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const state = await loadParticipantState<ParticipantState>();
  if (!state) redirect('/register');
  const { participant } = state;
  const { byCondition, completed, active, recommended } = progressOf(state);
  const done = participant.experiment_completed;
  const isTest = participant.is_test;

  return (
    <Container className="max-w-4xl! pt-10">
      <div className="fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Participant dashboard</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {participant.first_name} {participant.last_name}
          </h1>
          <p className="mt-1 text-sm muted">
            Access code{' '}
            <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono tracking-widest text-white">
              {participant.access_code}
            </span>
          </p>
        </div>
        <LogoutButton />
      </div>

      {isTest ? <TestModeBanner className="fade-up mt-5" /> : null}

      <Card className="fade-up mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm muted">Experiment progress</p>
            <p className="text-2xl font-semibold" data-testid="progress-text">
              {completed} of 3 conditions completed
            </p>
          </div>
          <div className="flex gap-2" aria-hidden>
            {CONDITIONS.map((c) => (
              <span
                key={c}
                className={`h-2.5 w-14 rounded-full ${conditionStatus(byCondition.get(c)) === 'completed' ? 'bg-sky-200' : conditionStatus(byCondition.get(c)) === 'in_progress' ? 'bg-amber-300/70' : 'bg-white/15'}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider muted">
              <tr>
                <th className="pb-3 font-medium">Break condition</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 text-right font-medium">Corsi span</th>
                <th className="pb-3 text-right font-medium">Accuracy</th>
                {isTest ? <th className="pb-3 text-right font-medium">Test</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {CONDITIONS.map((c) => {
                const s = byCondition.get(c);
                const status = conditionStatus(s);
                return (
                  <tr key={c} data-testid={`row-${c}`}>
                    <td className="py-3.5">
                      <span className="flex items-center gap-3">
                        <ConditionIcon condition={c} className="h-5 w-5" style={{ color: CONDITION_INFO[c].accent }} />
                        {CONDITION_INFO[c].short}
                        {s ? <span className="text-xs muted">· #{s.condition_order}</span> : null}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <StatusPill status={status} />
                    </td>
                    <td className="py-3.5 text-right text-lg font-semibold tabular-nums">
                      {status === 'completed' ? (
                        <Link href={`/session/${s!.id}`} className="hover:underline">
                          {s!.corsi_span}
                        </Link>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td className="py-3.5 text-right tabular-nums">
                      {status === 'completed' ? formatPct(s!.accuracy, 0) : '--'}
                    </td>
                    {isTest ? (
                      <td className="py-3.5 text-right">{s ? <RedoButton condition={c} /> : null}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="fade-up mt-6">
        {done ? (
          <Card className="text-center">
            <p className="text-4xl">🎉</p>
            <h2 className="mt-2 text-2xl font-semibold">Experiment complete — thank you!</h2>
            <p className="mx-auto mt-2 max-w-lg muted">
              You have completed all three break conditions
              {participant.experiment_completed_at ? ` (finished ${formatDateTime(participant.experiment_completed_at)})` : ''}.
              Your results are saved and locked. You can view how everyone is doing on the results page.
            </p>
            <Link href="/results" className="btn btn-primary mt-6">
              View experiment results <ArrowIcon className="h-5 w-5" />
            </Link>
          </Card>
        ) : active ? (
          <Card>
            <Alert tone="info">
              You have an unfinished <strong>{CONDITION_INFO[active.condition].title}</strong>{' '}
              {active.status === 'break_in_progress'
                ? '— your 15-minute timer is still running from when you started it.'
                : '— your break is finished and the Corsi test is waiting for you.'}
            </Alert>
            <Link href={`/session/${active.id}`} className="btn btn-primary mt-5">
              {active.status === 'break_in_progress' ? 'Resume break timer' : 'Continue to the Corsi test'}
              <ArrowIcon className="h-5 w-5" />
            </Link>
          </Card>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Ready for your next condition?</h2>
              {recommended ? (
                <p className="mt-1 text-sm muted">
                  Suggested next (counterbalanced order): <span className="text-white">{CONDITION_INFO[recommended].title}</span>.
                  You may choose any remaining condition.
                </p>
              ) : null}
            </div>
            <Link href="/select" className="btn btn-primary">
              Choose a break <ArrowIcon className="h-5 w-5" />
            </Link>
          </Card>
        )}
      </div>
    </Container>
  );
}
