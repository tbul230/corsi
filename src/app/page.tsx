import Link from 'next/link';
import { Container, Eyebrow } from '@/components/ui';
import { ArrowIcon, ConditionIcon } from '@/components/icons';
import { CONDITIONS, CONDITION_INFO } from '@/lib/constants';
import { getParticipantToken } from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['Register', 'Enter your real first and last name.'],
  ['Consent', 'Read what is collected and accept the three agreements.'],
  ['Choose a break', 'Pick one of the three break conditions.'],
  ['15-minute break', 'A real countdown timer — the test cannot start early.'],
  ['Corsi test', 'Repeat the order in which blocks light up.'],
  ['Saved', 'Your results are stored securely. Repeat for all three breaks.']
];

function HeroGrid() {
  const lit = [1, 5, 6];
  return (
    <div className="glass mx-auto grid w-full max-w-[300px] grid-cols-3 gap-3 rounded-[32px] p-4 sm:max-w-[340px]">
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className="corsi-block"
          data-lit={lit.includes(i)}
          style={lit.includes(i) ? { animation: `pulse 2.4s ${lit.indexOf(i) * 0.8}s infinite` } : undefined}
        />
      ))}
    </div>
  );
}

export default async function Home() {
  const signedIn = Boolean(await getParticipantToken());
  return (
    <Container className="pb-8 pt-10 sm:pt-16">
      <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
        <div className="fade-up">
          <Eyebrow>Visuospatial working-memory study</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The Corsi Block-Tapping Experiment
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed muted">
            Does how you spend a short break change how much you can hold in mind? This experiment measures your{' '}
            <span className="text-white">visuospatial short-term memory span</span> — the longest sequence of
            blocks you can remember and tap back in order — after three different 15-minute breaks.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={signedIn ? '/dashboard' : '/register'} className="btn btn-primary px-7 py-3.5 text-lg">
              {signedIn ? 'Continue Experiment' : 'Start Experiment'}
              <ArrowIcon className="h-5 w-5" />
            </Link>
            <Link href="/methodology" className="btn btn-glass">
              How it works
            </Link>
          </div>
          <p className="mt-4 text-sm muted">About 20–25 minutes per condition · three conditions in total</p>
        </div>
        <div className="fade-up" style={{ animationDelay: '120ms' }}>
          <HeroGrid />
        </div>
      </section>

      <section className="mt-20">
        <Eyebrow>Three break conditions</Eyebrow>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {CONDITIONS.map((c) => (
            <div key={c} className="glass rounded-[28px] p-6">
              <div
                className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"
                style={{ color: CONDITION_INFO[c].accent }}>
                <ConditionIcon condition={c} className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{CONDITION_INFO[c].title}</h3>
              <p className="mt-1 text-sm muted">{CONDITION_INFO[c].description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <Eyebrow>Procedure</Eyebrow>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="glass-soft flex gap-4 rounded-2xl p-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold tabular-nums">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <style>{`@keyframes pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(.55)}}`}</style>
    </Container>
  );
}
