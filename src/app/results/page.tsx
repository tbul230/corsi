import type { Metadata } from 'next';
import { Card, Container, PageHeader } from '@/components/ui';
import SignInForm from '@/components/SignInForm';
import { getSessionUser } from '@/lib/server/session';
import LiveResults from './LiveResults';

export const metadata: Metadata = { title: 'Experiment results' };
export const dynamic = 'force-dynamic';

export default async function ResultsPage() {
  const user = await getSessionUser();
  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <div className="mb-6">
        <PageHeader
          eyebrow="Live experiment results"
          title="Does the kind of break change your memory score?"
          description="These update by themselves as students finish. Other students show up as #1, #2… and you show up as “You”. Score = how many blocks in a row you remembered."
        />
      </div>
      {user ? (
        <LiveResults />
      ) : (
        <Card className="max-w-md">
          <p className="font-medium">Sign in to view the results</p>
          <p className="mt-1 text-sm text-ink-2">The live results are available to everyone taking part.</p>
          <div className="mt-4">
            <SignInForm reloadAfter initialMode="login" />
          </div>
        </Card>
      )}
    </Container>
  );
}
