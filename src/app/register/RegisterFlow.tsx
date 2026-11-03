'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Eyebrow } from '@/components/ui';
import { ArrowIcon, CheckIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { CONSENT_ITEMS } from '@/lib/constants';
import type { ParticipantState } from '@/lib/types';

type Step = 'name' | 'consent' | 'code';
type Mode = 'new' | 'returning';

const NAME_RE = /^\p{L}[\p{L} '’.-]*$/u;

function validateName(v: string, label: string) {
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return `${label} is required.`;
  if (t.length > 60) return `${label} must be 60 characters or fewer.`;
  if (!NAME_RE.test(t)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`;
  return null;
}

export default function RegisterFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('new');
  const [step, setStep] = useState<Step>('name');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState({ participation: false, quiet: false, guidelines: false });
  const [fieldErrors, setFieldErrors] = useState<{ first?: string | null; last?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<ParticipantState | null>(null);

  const allConsented = consent.participation && consent.quiet && consent.guidelines;

  function checkNames() {
    const errs = { first: validateName(first, 'First name'), last: validateName(last, 'Last name') };
    setFieldErrors(errs);
    return !errs.first && !errs.last;
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checkNames()) return;
    setBusy(true);
    try {
      const { available } = await api<{ available: boolean }>('check-name', { firstName: first, lastName: last });
      if (!available) {
        setError(
          'A participant with this name is already registered. If that is you, switch to “Returning participant” and enter your access code.'
        );
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
      const state = await api<ParticipantState>('register', { firstName: first, lastName: last, consent });
      setRegistered(state);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      if (err instanceof ApiError && err.code === 'DUPLICATE_NAME') setStep('name');
    } finally {
      setBusy(false);
    }
  }

  async function submitReturning(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checkNames()) return;
    if (!code.trim()) {
      setError('Enter the 6-character access code you were given at registration.');
      return;
    }
    setBusy(true);
    try {
      await api('resume', { firstName: first, lastName: last, accessCode: code });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  if (step === 'code' && registered) {
    return (
      <Card className="fade-up text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Welcome, {registered.participant.first_name}!</h1>
        <p className="mt-2 muted">You are registered. Please write down your personal access code:</p>
        <p
          data-testid="access-code"
          className="mx-auto mt-5 w-fit rounded-xl border border-line-strong bg-navy-950 px-6 py-3 font-mono text-3xl font-semibold tracking-[0.25em]">
          {registered.participant.access_code}
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm muted">
          You will need your name and this code to continue the experiment on another device or browser. It is also
          shown on your progress dashboard.
        </p>
        <button className="btn btn-primary mt-8" onClick={() => { router.push('/dashboard'); router.refresh(); }}>
          Continue to my dashboard <ArrowIcon className="h-4 w-4" />
        </button>
      </Card>
    );
  }

  if (step === 'consent') {
    return (
      <form onSubmit={submitConsent} className="fade-up space-y-5">
        <div>
          <Eyebrow>Step 2 of 2</Eyebrow>
          <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">Experiment agreement</h1>
        </div>
        <Card className="space-y-4 text-sm leading-relaxed">
          <div>
            <h2 className="font-semibold text-ink">What is collected</h2>
            <p className="muted">
              Your first and last name (to link your three sessions), your consent, which break you took and when, the
              exact break and test timestamps, and every Corsi trial: the sequence shown, the blocks you tapped,
              whether it was correct and how long you took. Whether you left the break page is logged for experiment
              integrity. No email, age, location or other personal information is collected.
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
        <fieldset className="space-y-3">
          <legend className="sr-only">Agreements</legend>
          {CONSENT_ITEMS.map((item, i) => {
            const checked = consent[item.key];
            return (
              <label
                key={item.key}
                className={`flex cursor-pointer gap-4 rounded-xl border p-4 transition-colors sm:p-5 ${checked ? 'border-accent bg-accent/8' : 'border-line bg-navy-900 hover:border-line-strong'}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  name={item.key}
                  checked={checked}
                  onChange={(e) => setConsent((c) => ({ ...c, [item.key]: e.target.checked }))}
                />
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${checked ? 'border-accent bg-accent text-white' : 'border-line-strong bg-navy-950'}`}>
                  {checked ? <CheckIcon className="h-4 w-4" /> : null}
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
        <Eyebrow>{mode === 'new' ? 'Step 1 of 2' : 'Welcome back'}</Eyebrow>
        <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl">
          {mode === 'new' ? 'Participant registration' : 'Continue as a returning participant'}
        </h1>
      </div>
      <div className="inline-flex rounded-lg border border-line bg-navy-900 p-1 text-sm" role="tablist">
        {(['new', 'returning'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${mode === m ? 'bg-navy-700 text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {m === 'new' ? 'New participant' : 'Returning participant'}
          </button>
        ))}
      </div>
      <Card>
        <form onSubmit={mode === 'new' ? submitName : submitReturning} noValidate className="space-y-5">
          <p className="text-sm muted">
            {mode === 'new'
              ? 'Please enter your real first and last name. Your name links your results across all three break conditions.'
              : 'Enter the same name you registered with and your 6-character access code.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="first" className="mb-1.5 block text-sm font-medium">
                First name
              </label>
              <input
                id="first"
                className="input"
                autoComplete="given-name"
                value={first}
                maxLength={60}
                onChange={(e) => setFirst(e.target.value)}
                aria-invalid={Boolean(fieldErrors.first)}
                required
              />
              {fieldErrors.first ? <p className="mt-1.5 text-xs text-red-300">{fieldErrors.first}</p> : null}
            </div>
            <div>
              <label htmlFor="last" className="mb-1.5 block text-sm font-medium">
                Last name
              </label>
              <input
                id="last"
                className="input"
                autoComplete="family-name"
                value={last}
                maxLength={60}
                onChange={(e) => setLast(e.target.value)}
                aria-invalid={Boolean(fieldErrors.last)}
                required
              />
              {fieldErrors.last ? <p className="mt-1.5 text-xs text-red-300">{fieldErrors.last}</p> : null}
            </div>
          </div>
          {mode === 'returning' ? (
            <div>
              <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
                Access code
              </label>
              <input
                id="code"
                className="input font-mono uppercase tracking-[0.3em]"
                value={code}
                maxLength={12}
                autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
            </div>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Checking…' : mode === 'new' ? 'Continue' : 'Sign in'}
              <ArrowIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      </Card>
      <p className="text-center text-xs muted">
        Researcher?{' '}
        <a href="/test-mode" className="underline underline-offset-2 hover:text-ink">
          Admin test mode
        </a>
      </p>
    </div>
  );
}
