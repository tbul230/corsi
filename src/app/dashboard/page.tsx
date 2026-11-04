import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Container, PageHeader, StatusPill } from '@/components/ui';
import { ArrowIcon, CheckIcon, ConditionIcon } from '@/components/icons';
import LogoutButton from '@/components/LogoutButton';
import CountUp from '@/components/CountUp';
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
    <Container className="py-8 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="Participant dashboard"
        title={`${participant.first_name} ${participant.last_name}`}
        actions={<LogoutButton />}
      />
      {isTest ? <TestModeBanner className="mt-6" /> : null}

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Conditions */}
        <section className="glass fade-up self-start overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold">Break conditions</h2>
              <p className="text-sm text-ink-2" data-testid="progress-text">
                {completed} of 3 conditions completed
              </p>
            </div>
            <div className="flex w-full gap-1.5 sm:w-48" aria-hidden>
              {CONDITIONS.map((c) => {
                const st = conditionStatus(byCondition.get(c));
                return (
                  <span
                    key={c}
                    className={`h-1.5 flex-1 rounded-full ${st === 'completed' ? 'grow-x bg-gradient-to-r from-sky-300 to-accent shadow-[0_0_12px_rgba(77,141,255,0.7)]' : st === 'in_progress' ? 'shimmer bg-amber-300/70' : 'bg-white/10'}`}
                  />
                );
              })}
            </div>
          </div>
          <ul className="stagger divide-y divide-white/8">
            {CONDITIONS.map((c) => {
              const s = byCondition.get(c);
              const status = conditionStatus(s);
              return (
                <li
                  key={c}
                  data-testid={`row-${c}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors duration-300 hover:bg-white/[0.03] sm:px-6">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                    style={{ color: CONDITION_INFO[c].accent }}>
                    <ConditionIcon condition={c} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {CONDITION_INFO[c].title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                      <StatusPill status={status} />
                      {s ? <span className="text-xs text-ink-3">#{s.condition_order} in order</span> : null}
                      {status === 'completed' ? <span>Accuracy {formatPct(s!.accuracy, 0)}</span> : null}
                      {isTest && s ? <RedoButton condition={c} /> : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-3">Corsi span</p>
                    {status === 'completed' ? (
                      <Link href={`/session/${s!.id}`} className="text-2xl font-semibold tabular-nums hover:text-accent">
                        <CountUp value={s!.corsi_span ?? 0} />
                      </Link>
                    ) : (
                      <p className="text-2xl font-semibold text-ink-3">--</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Next step + code */}
        <div className="stagger flex flex-col gap-6">
          {done ? (
            <Card>
              <div className="pop grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                <CheckIcon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Experiment complete. Thank you!</h2>
              <p className="mt-2 text-sm text-ink-2">
                You finished all three break conditions
                {participant.experiment_completed_at ? ` on ${formatDateTime(participant.experiment_completed_at)}` : ''}.
                Your results are saved and locked.
              </p>
              <Link href="/results" className="btn btn-primary mt-5 w-full">
                View experiment results <ArrowIcon className="h-4 w-4" />
              </Link>
            </Card>
          ) : active ? (
            <Card>
              <p className="text-sm font-medium text-amber-200">Unfinished session</p>
              <h2 className="mt-1 text-xl font-semibold">{CONDITION_INFO[active.condition].title}</h2>
              <p className="mt-2 text-sm text-ink-2">
                {active.status === 'break_in_progress'
                  ? 'Your 15-minute timer is still running from when you started it.'
                  : 'Your break is finished and the Corsi test is waiting for you.'}
              </p>
              <Link href={`/session/${active.id}`} className="btn btn-primary mt-5 w-full">
                {active.status === 'break_in_progress' ? 'Resume break timer' : 'Continue to the Corsi test'}
                <ArrowIcon className="h-4 w-4" />
              </Link>
            </Card>
          ) : (
            <Card>
              <p className="text-sm font-medium text-accent">Next step</p>
              <h2 className="mt-1 text-xl font-semibold">Choose your next break</h2>
              {recommended ? (
                <p className="mt-2 text-sm text-ink-2">
                  Suggested: <span className="text-ink">{CONDITION_INFO[recommended].title}</span>. This keeps the order
                  balanced across participants, but you may pick any remaining condition.
                </p>
              ) : null}
              <Link href="/select" className="btn btn-primary mt-5 w-full">
                Choose a break <ArrowIcon className="h-4 w-4" />
              </Link>
            </Card>
          )}

          <Card>
            <p className="label">Your access code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">{participant.access_code}</p>
            <p className="mt-2 text-sm text-ink-2">
              Use it with your name to continue on another device or browser.
            </p>
          </Card>
        </div>
      </div>
    </Container>
  );
}
