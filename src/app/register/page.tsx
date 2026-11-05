import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container } from '@/components/ui';
import { loadParticipantState } from '@/lib/participant-server';
import RegisterFlow from './RegisterFlow';

export const metadata: Metadata = { title: 'Register' };
export const dynamic = 'force-dynamic';

const EXPECT: [string, string][] = [
  ['Sign in with Google', 'Only to save your progress across devices.'],
  ['Three agreements', 'Participation, a quiet space, and honest effort.'],
  ['Then choose a break', 'Video game, YouTube, or no screens — 15 minutes.']
];

export default async function RegisterPage() {
  const { user, state } = await loadParticipantState();
  if (user && state) redirect('/dashboard');
  return (
    <Container className="py-8 sm:py-12 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] lg:gap-16 xl:gap-24">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-sm font-medium text-accent">Before you begin</p>
            <h2 className="mt-2 text-2xl font-semibold">What to expect</h2>
            <ol className="mt-6 divide-y divide-line border-y border-line">
              {EXPECT.map(([t, d], i) => (
                <li key={t} className="flex gap-4 py-4">
                  <span className="mt-0.5 font-mono text-sm text-ink-3">0{i + 1}</span>
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="text-sm text-ink-2">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-ink-3">
              Your responses are anonymous: researchers see only a random code like “P-7F3K”, never your name or Google account.
            </p>
          </div>
        </aside>
        <div className="min-w-0 lg:max-w-2xl">
          <RegisterFlow signedIn={Boolean(user)} />
        </div>
      </div>
    </Container>
  );
}
