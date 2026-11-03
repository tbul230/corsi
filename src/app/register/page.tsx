import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import RegisterFlow from './RegisterFlow';

export const metadata: Metadata = { title: 'Register' };

const EXPECT: [string, string][] = [
  ['Your name', 'Used only to link your three sessions together.'],
  ['Three agreements', 'Participation, a quiet space, and honest effort.'],
  ['An access code', 'Lets you continue later on any device.'],
  ['Then choose a break', 'Video game, YouTube, or no screens — 15 minutes.']
];

export default function RegisterPage() {
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
              Only the research team can see names. Public results use anonymous codes such as “P04”.
            </p>
          </div>
        </aside>
        <div className="min-w-0 lg:max-w-2xl">
          <RegisterFlow />
        </div>
      </div>
    </Container>
  );
}
