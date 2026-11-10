import Link from 'next/link';
import { Container } from '@/components/ui';
import { ArrowIcon, ConditionIcon } from '@/components/icons';
import { CONDITIONS, CONDITION_INFO } from '@/lib/constants';
import SignInForm from '@/components/SignInForm';
import AnonymityNote from '@/components/AnonymityNote';
import { loadParticipantState } from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

const STEPS: [string, string][] = [
  ['Register', 'Your first and last name, plus three short agreements.'],
  ['Take a 15-minute break', 'Video game, YouTube, or no screens. A timer keeps it exact.'],
  ['Do the Corsi test', 'Watch blocks light up, then tap them back in the same order.'],
  ['Repeat twice more', 'One session per break type, in any order, on any device.']
];

/** Live illustration of a trial: three blocks light up in order, on a loop. */
function TrialIllustration() {
  const order: Record<number, number> = { 1: 1, 5: 2, 6: 3 };
  return (
    <div className="glass float-slow rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Example trial</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-ink-2">3 blocks</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className={`corsi-block ${order[i] ? 'demo-lit' : ''}`}
            style={order[i] ? { animationDelay: `${(order[i] - 1) * 1.2}s` } : undefined}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-ink-2">
        Blocks light up one at a time. When it&apos;s your turn, tap them in the same order. Each correct answer adds
        one more block.
      </p>
    </div>
  );
}

export default async function Home() {
  const { user, state } = await loadParticipantState();
  const active = state?.sessions.find((s) => s.status !== 'completed');
  const next = !user ? null : !state ? '/register' : active ? `/session/${active.id}` : '/dashboard';
  const nextLabel = !state ? 'Continue registration' : active ? 'Resume your session' : 'Continue experiment';
  return (
    <>
      <Container className="py-10 sm:py-14 lg:py-20">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          <div className="stagger">
            <p className="text-sm font-medium text-accent">Visuospatial working-memory study</p>
            <h1 className="mt-3 text-[2.15rem] font-semibold leading-[1.08] sm:text-5xl lg:text-[3.6rem]">
              The Corsi Block-Tapping Experiment
            </h1>
            <p className="mt-5 max-w-[38rem] text-[1.05rem] leading-relaxed text-ink-2 lg:text-lg">
              Does the way you spend a short break change how much you can hold in mind? We measure your Corsi span, the
              longest sequence of blocks you can remember and repeat, after three different 15-minute breaks.
            </p>
            <div className="mt-8 max-w-sm">
              {next ? (
                <Link href={next} className="btn btn-primary w-full px-6" data-testid="continue">
                  {nextLabel}
                  <ArrowIcon className="h-4 w-4" />
                </Link>
              ) : (
                <SignInForm />
              )}
              <AnonymityNote className="mt-4" />
              <p className="mt-3 text-sm text-ink-3">
                <Link href="/methodology" className="underline underline-offset-2 hover:text-ink">
                  Read the method
                </Link>
              </p>
            </div>
            <dl className="glass-soft mt-10 grid max-w-[38rem] grid-cols-3 divide-x divide-white/8 rounded-2xl">
              {[
                ['3', 'break conditions'],
                ['15:00', 'per break'],
                ['~5 min', 'per test']
              ].map(([v, l]) => (
                <div key={l} className="px-4 py-4 sm:px-5">
                  <dt className="text-xl font-semibold tabular-nums sm:text-2xl">{v}</dt>
                  <dd className="mt-0.5 text-xs text-ink-3 sm:text-sm">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="fade-up mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: '80ms' }}>
            <TrialIllustration />
          </div>
        </section>
      </Container>

      <div className="border-t border-white/8">
        <Container className="py-12 lg:py-16">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <section>
              <h2 className="text-xl font-semibold sm:text-2xl">The three breaks</h2>
              <p className="mt-2 text-ink-2">You complete each one once. They can be done in any order.</p>
              <ul className="glass stagger mt-6 divide-y divide-white/8 rounded-2xl px-5">
                {CONDITIONS.map((c) => (
                  <li key={c} className="flex items-start gap-4 py-4">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                      style={{ color: CONDITION_INFO[c].accent }}>
                      <ConditionIcon condition={c} className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-medium">{CONDITION_INFO[c].title}</p>
                      <p className="text-sm text-ink-2">{CONDITION_INFO[c].description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold sm:text-2xl">How a session works</h2>
              <p className="mt-2 text-ink-2">About 20 to 25 minutes each time.</p>
              <ol className="glass stagger mt-6 divide-y divide-white/8 rounded-2xl px-5">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="flex gap-4 py-4">
                    <span className="mt-0.5 font-mono text-sm text-ink-3 tabular-nums">0{i + 1}</span>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-ink-2">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </Container>
      </div>
    </>
  );
}
