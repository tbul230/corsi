'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Eyebrow } from '@/components/ui';
import { ArrowIcon, CheckIcon } from '@/components/icons';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { api, ApiError } from '@/lib/api';
import { CONSENT_ITEMS } from '@/lib/constants';

type Step = 'name' | 'consent';

const NAME_RE = /^\p{L}[\p{L} '’.-]*$/u;

function validateName(v: string, label: string) {
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return `${label} is required.`;
  if (t.length > 60) return `${label} must be 60 characters or fewer.`;
  if (!NAME_RE.test(t)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`;
  return null;
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export default function RegisterFlow({ user }: { user: { email: string; name: string } | null }) {
  const router = useRouter();
  const initial = splitName(user?.name ?? '');
  const [step, setStep] = useState<Step>('name');
  const [first, setFirst] = useState(initial.first);
  const [last, setLast] = useState(initial.last);
  const [consent, setConsent] = useState({ participation: false, quiet: false, guidelines: false });
  const [fieldErrors, setFieldErrors] = useState<{ first?: string | null; last?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allConsented = consent.participation && consent.quiet && consent.guidelines;

  if (!user) {
    return (
      <div className="fade-up space-y-5">
        <div>
          <Eyebrow>Step 1 of 3</Eyebrow>
          <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Sign in to take part</h1>
          <p className="mt-2 text-ink-2">
            Everyone signs in with Google so your three sessions stay linked to you and nobody else can submit results
            in your name. Already registered? Signing in takes you straight to your progress.
          </p>
        </div>
        <Card className="space-y-4">
          <GoogleSignInButton label="Sign in with Google" />
          <p className="text-xs text-ink-3">
            We only receive your name and email address from Google. Researchers sign in the same way and are recognised
            automatically.
          </p>
        </Card>
      </div>
    );
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = { first: validateName(first, 'First name'), last: validateName(last, 'Last name') };
    setFieldErrors(errs);
    if (errs.first || errs.last) return;
    setBusy(true);
    try {
      const { available } = await api<{ available: boolean }>('check-name', { firstName: first, lastName: last });
      if (!available) {
        setError('A participant with this name is already registered. If that is you, sign out and sign in with the Google account you used before.');
        return;
      }
      setStep('consent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function submitConsent(e: FormEvent) {
    e.preventDefault();
    if (!allConsented || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('register', { firstName: first, lastName: last, consent });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      if (err instanceof ApiError && err.code === 'DUPLICATE_NAME') setStep('name');
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') router.push('/dashboard');
      setBusy(false);
    }
  }

  if (step === 'consent') {
    return (
      <form onSubmit={submitConsent} className="fade-up space-y-5">
        <div>
          <Eyebrow>Step 3 of 3</Eyebrow>
          <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Experiment agreement</h1>
        </div>
        <Card className="space-y-4 text-sm leading-relaxed">
          <div>
            <h2 className="font-semibold text-ink">What is collected</h2>
            <p className="muted">
              Your first and last name (to link your three sessions), your consent, which break you took and when, the
              exact break and test timestamps, and every Corsi trial: the sequence shown, the blocks you tapped,
              whether it was correct and how long you took. Whether you left the break page is logged for experiment
              integrity. Your Google account email is stored so you can sign in again. No age, location or other personal information is collected.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-ink">Who can see it</h2>
            <p className="muted">
              Only the researchers running this study (signed-in administrators) can see names and individual results.
              The public results page shows anonymised averages and participant codes such as “P04” — never names.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-ink">How it is used</h2>
            <p className="muted">
              Results are analysed to compare Corsi performance after a video game break, a YouTube break and a
              screen-free break. Submitted results cannot be edited. This is a research task, not a medical or
              diagnostic assessment.
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
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${checked ? 'scale-110 border-accent bg-accent text-white shadow-[0_0_14px_rgba(77,141,255,0.8)]' : 'border-white/25 bg-white/5'} duration-500 [transition-timing-function:var(--ease-spring)]`}>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn btn-glass" onClick={() => setStep('name')}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={!allConsented || busy}>
            {busy ? 'Saving…' : 'I agree — register me'}
            <ArrowIcon className="h-4 w-4" />
          </button>
        </div>
        {!allConsented ? <p className="text-right text-xs muted">All three agreements are required to continue.</p> : null}
      </form>
    );
  }


  return (
    <div className="fade-up space-y-5">
      <div>
        <Eyebrow>Step 2 of 3</Eyebrow>
        <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Confirm your name</h1>
        <p className="mt-2 text-ink-2">
          Signed in as <span className="text-ink">{user.email}</span>. Please enter your real first and last name; it links
          your results across all three break conditions.
        </p>
      </div>
      <Card>
        <form onSubmit={submitName} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="first" className="mb-1.5 block text-sm font-medium">First name</label>
              <input id="first" className="input" autoComplete="given-name" value={first} maxLength={60}
                onChange={(e) => setFirst(e.target.value)} aria-invalid={Boolean(fieldErrors.first)} required />
              {fieldErrors.first ? <p className="mt-1.5 text-xs text-red-300">{fieldErrors.first}</p> : null}
            </div>
            <div>
              <label htmlFor="last" className="mb-1.5 block text-sm font-medium">Last name</label>
              <input id="last" className="input" autoComplete="family-name" value={last} maxLength={60}
                onChange={(e) => setLast(e.target.value)} aria-invalid={Boolean(fieldErrors.last)} required />
              {fieldErrors.last ? <p className="mt-1.5 text-xs text-red-300">{fieldErrors.last}</p> : null}
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'} <ArrowIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
