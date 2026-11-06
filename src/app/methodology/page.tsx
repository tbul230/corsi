import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Container, PageHeader } from '@/components/ui';
import { BREAK_SECONDS, CONDITIONS, CONDITION_INFO, CORSI_RULES, CORSI_TIMING } from '@/lib/constants';

export const metadata: Metadata = { title: 'Methodology' };

const SECTIONS = [
  ['design', 'Research question & design'],
  ['procedure', 'Procedure'],
  ['parameters', 'Corsi task parameters'],
  ['order', 'Order & practice effects'],
  ['integrity', 'Integrity safeguards'],
  ['limitations', 'Limitations']
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="scroll-mt-20 space-y-3 leading-relaxed text-ink-2" >
      <span id={id} className="relative -top-20 block" aria-hidden />
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children}
    </Card>
  );
}

export default function MethodologyPage() {
  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="Methodology"
        title="Experiment procedure"
        description="Exactly what every participant experiences, so the procedure is identical for everyone and can be reported or replicated."
      />
      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-16">
        <nav className="hidden lg:block" aria-label="Sections">
          <ul className="sticky top-24 space-y-1 border-l border-line text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-ink-2 hover:border-accent hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-4xl space-y-5">
      <Section id="design" title="Research question & design">
        <p>
          Does the type of 15-minute break taken immediately beforehand affect performance on a Corsi-style
          block-tapping task, a measure of visuospatial short-term memory span?
        </p>
        <p>
          <strong>Design:</strong> within-subjects, one independent variable with three levels (break type). Every
          participant completes all three conditions exactly once:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {CONDITIONS.map((c) => (
            <li key={c}>
              <strong>{CONDITION_INFO[c].title}</strong> — {CONDITION_INFO[c].description}
            </li>
          ))}
        </ul>
        <p>
          <strong>Primary dependent variable:</strong> Corsi span (longest sequence length reproduced correctly).
          Secondary: accuracy (% correct trials), total score (span × correct trials), per-trial response times.
        </p>
      </Section>

      <Section id="procedure" title="Procedure (per condition)">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Google sign-in (used only to save progress), then three consent agreements. No name or other identifying information is collected; each participant is stored under a pseudonymous ID and shown only as a random code such as P-7F3K.</li>
          <li>Selection of one of the remaining break conditions; standardised written instructions are shown.</li>
          <li>
            A {BREAK_SECONDS / 60}-minute break. The start and end times are fixed by the server when the break begins;
            the countdown is computed from those timestamps, so it is accurate after refreshing, switching tabs or
            closing the browser, and it cannot be paused, reset, shortened or skipped. The server rejects any attempt
            to start the test before the break has ended.
          </li>
          <li>
            When the timer reaches zero the break-completion time is recorded and the participant is moved
            automatically to the Corsi test screen; the test-start time is recorded when the first sequence is shown.
          </li>
          <li>Corsi block-tapping test (below), then an immediate summary of results.</li>
          <li>Results are saved and locked. The participant returns to their dashboard.</li>
        </ol>
      </Section>

      <Section id="parameters" title="Corsi task parameters">
        <ul className="list-disc space-y-1 pl-5">
          <li>{CORSI_RULES.blocks} identical blocks in a fixed 3 × 3 grid.</li>
          <li>
            Each block lights for {CORSI_TIMING.blockOnMs} ms with a {CORSI_TIMING.interBlockMs} ms dark interval
            between blocks; sequences begin {CORSI_TIMING.preSequenceMs} ms after the “Watch” cue.
          </li>
          <li>
            Sequences are generated randomly <em>on the server</em> with no block repeated within a sequence (so no
            immediate repeats). The participant never sees the next sequence in advance.
          </li>
          <li>
            Sequence length starts at {CORSI_RULES.startLength}. A correct reproduction increases the length by one
            (maximum {CORSI_RULES.maxLength}). An incorrect reproduction gives one more attempt at the same length with
            a new sequence.
          </li>
          <li>
            <strong>Stopping rule:</strong> the test ends after {CORSI_RULES.attemptsPerLength} failed attempts at the
            same length, or after a correct reproduction at length {CORSI_RULES.maxLength}.
          </li>
          <li>A response is complete once the participant has tapped as many blocks as were shown; it is scored correct only if every block is in the right order.</li>
          <li>Feedback (“Correct” / “Incorrect”) is shown for {CORSI_TIMING.feedbackMs} ms after each trial.</li>
          <li>Response time is measured from the end of the sequence to the final tap.</li>
        </ul>
        <p>
          <strong>Scoring:</strong> Corsi span = the longest sequence length reproduced correctly (0 if none). Total
          score = span × number of correct trials. Accuracy = correct trials ÷ total trials. All scores are computed by
          the server from the stored trial records, not by the browser.
        </p>
      </Section>

      <Section id="order" title="Controlling order & practice effects">
        <p>
          Repeating the Corsi task can improve scores through practice alone. To prevent this from being confounded
          with break type, each participant is assigned one of the six possible condition orders at registration,
          choosing the order used least so far (counterbalancing). This order is suggested on the dashboard, though
          participants may choose any remaining condition. The actual order of completion is recorded for every
          session and the results page includes a “span by completion order” chart so practice effects can be
          inspected. Where possible, complete the three conditions at similar times of day, ideally on separate days.
        </p>
      </Section>

      <Section id="integrity" title="Integrity safeguards">
        <ul className="list-disc space-y-1 pl-5">
          <li>Every participant signs in with Google, and each participant has exactly one record per break condition (enforced in a server-side database transaction), so a condition can never be repeated from any tab, browser or direct API call.</li>
          <li>Only one condition can be in progress at a time.</li>
          <li>Participation is anonymous: data is keyed by a one-way pseudonymous ID derived from the Google account with a server-only secret, and no name, email or Google account details are stored. Researchers and administrators see only random codes.</li>
          <li>The database cannot be accessed from browsers at all; completed results are never modified, and only researchers can delete data (every deletion is logged).</li>
          <li>Researchers can try the procedure in a separate admin test mode (break can be skipped, conditions redone). Those runs are flagged as tests and excluded from every result, chart and export.</li>
          <li>Timestamps are recorded for registration, consent, break start, break end, break completion, test start, every trial and test completion.</li>
          <li>Leaving the break page (closing/refreshing the tab) is logged as an interruption; switching to other apps or tabs is logged separately. If a test is interrupted mid-trial, the unanswered sequence is discarded, logged, and a new sequence of the same length is shown.</li>
        </ul>
      </Section>

      <Section id="limitations" title="Limitations">
        <p>
          This is an experimental, browser-based implementation of a Corsi-style task. It is <strong>not</strong> a
          validated clinical or neuropsychological assessment and must not be used for diagnosis. The classic Corsi
          board uses an irregular block layout; this version uses a regular 3 × 3 grid. Break activities are
          self-reported and cannot be verified, and screen size, input device and environment vary between
          participants.
        </p>
      </Section>

          <div className="flex gap-3">
            <Link href="/register" className="btn btn-primary">Take part</Link>
            <Link href="/results" className="btn btn-glass">View results</Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
