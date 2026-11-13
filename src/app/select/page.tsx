import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container, PageHeader } from '@/components/ui';
import { loadParticipantState } from '@/lib/participant-server';
import { progressOf } from '@/lib/progress';
import BreakSelector from './BreakSelector';

export const metadata: Metadata = { title: 'Choose a break' };
export const dynamic = 'force-dynamic';

export default async function SelectPage() {
  const { state } = await loadParticipantState();
  if (!state) redirect('/register');
  const { active, recommended } = progressOf(state);
  if (active) redirect(`/session/${active.id}`);
  if (state.participant.experiment_completed) redirect('/dashboard');

  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="Break selection"
        title="Choose your break condition"
        description="Each condition is a 15-minute break followed immediately by the Corsi test. You can do each condition only once, and a break can't be changed, paused or restarted after it starts."
      />
      <BreakSelector sessions={state.sessions} recommended={recommended} />
    </Container>
  );
}
