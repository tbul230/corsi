import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container, Eyebrow } from '@/components/ui';
import { loadParticipantState } from '@/lib/participant-server';
import { progressOf } from '@/lib/progress';
import type { ParticipantState } from '@/lib/types';
import BreakSelector from './BreakSelector';

export const metadata: Metadata = { title: 'Choose a break' };
export const dynamic = 'force-dynamic';

export default async function SelectPage() {
  const state = await loadParticipantState<ParticipantState>();
  if (!state) redirect('/register');
  const { active, recommended } = progressOf(state);
  if (active) redirect(`/session/${active.id}`);
  if (state.participant.experiment_completed) redirect('/dashboard');

  return (
    <Container className="pt-10">
      <div className="fade-up">
        <Eyebrow>Break selection</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Choose your break condition</h1>
        <p className="mt-2 max-w-2xl muted">
          Each condition is a 15-minute break followed immediately by the Corsi test. You can complete each condition
          only once. Once a break starts it cannot be changed, paused or restarted.
        </p>
      </div>
      <BreakSelector sessions={state.sessions} recommended={recommended} />
    </Container>
  );
}
