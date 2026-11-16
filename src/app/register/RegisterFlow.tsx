'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Eyebrow } from '@/components/ui';
import { ArrowIcon, CheckIcon } from '@/components/icons';
import SignInForm from '@/components/SignInForm';
import AnonymityNote from '@/components/AnonymityNote';
import { api, ApiError } from '@/lib/api';
import { CONSENT_ITEMS } from '@/lib/constants';

/**
 * Registration collects no identifying information: no name, email, student ID or free text.
 * Step 1 is code + password sign-in (only to save progress); step 2 is the three consent agreements.
 */
export default function RegisterFlow({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = useState({ participation: false, quiet: false, guidelines: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allConsented = consent.participation && consent.quiet && consent.guidelines;

  if (!signedIn) {
    return (
      <div className="fade-up space-y-5">
        <div>
          <Eyebrow>Step 1 of 2</Eyebrow>
          <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Sign in to take part</h1>
          <p className="mt-2 text-ink-2">
            Choose a password and you'll get a random code. Use the code and password to come back for your other sessions, on any device.
          </p>
        </div>
        <Card className="space-y-4">
          <SignInForm />
          <AnonymityNote />
        </Card>
      </div>
    );
  }

  async function submitConsent(e: FormEvent) {
    e.preventDefault();
    if (!allConsented || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('register', { consent });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        router.push('/dashboard');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submitConsent} className="fade-up space-y-5">
      <div>
        <Eyebrow>Step 2 of 2</Eyebrow>
        <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Experiment agreement</h1>
      </div>
      <AnonymityNote prominent />
      <Card className="space-y-4 text-sm leading-relaxed">
        <div>
          <h2 className="font-semibold text-ink">What is collected</h2>
          <p className="muted">
            Only your experiment data, stored under a random code: your consent, which break you took and when, the break
            and test timestamps, every Corsi trial (the sequence shown, the blocks you tapped, whether it was correct and
            how long you took), whether you used touch or a mouse, and whether you left the break page. We do not store
            your name, email or any other personal information.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-ink">Who can see it</h2>
          <p className="muted">
            The researchers see your random code and results only. Nobody — including teachers and administrators — can
            see who you are or link your results to you.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-ink">How it is used</h2>
          <p className="muted">
            Results are analysed to compare Corsi performance after a video game break, a YouTube break and a
            screen-free break. Submitted results cannot be edited. This is a research task, not a medical or diagnostic
            assessment.
          </p>
        </div>
      </Card>
      <fieldset className="stagger space-y-3">
        <legend className="sr-only">Agreements</legend>
        {CONSENT_ITEMS.map((item, i) => {
          const checked = consent[item.key];
          return (
            <label
              key={item.key}
              className={`glass glass-interactive flex cursor-pointer gap-4 rounded-2xl p-4 sm:p-5 ${checked ? 'glass-selected' : ''}`}>
              <input
                type="checkbox"
                className="peer sr-only"
                name={item.key}
                checked={checked}
                onChange={(e) => setConsent((c) => ({ ...c, [item.key]: e.target.checked }))}
              />
              <span
                aria-hidden
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition duration-500 [transition-timing-function:var(--ease-spring)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${checked ? 'scale-110 border-accent bg-accent text-white shadow-[0_0_14px_rgba(77,141,255,0.8)]' : 'border-white/25 bg-white/5'}`}>
                {checked ? <CheckIcon className="pop h-4 w-4" /> : null}
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  Agreement {i + 1}: {item.title}
                </span>
                <span className="mt-1 block text-sm muted">“{item.text}”</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={!allConsented || busy}>
          {busy ? 'Saving…' : 'I agree — start'}
          <ArrowIcon className="h-4 w-4" />
        </button>
      </div>
      {!allConsented ? <p className="text-right text-xs muted">All three agreements are required to continue.</p> : null}
    </form>
  );
}
