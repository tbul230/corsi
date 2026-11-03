import type { Metadata } from 'next';
import { Container, Eyebrow } from '@/components/ui';
import LiveResults from './LiveResults';

export const metadata: Metadata = { title: 'Experiment results' };

export default function ResultsPage() {
  return (
    <Container className="pt-10">
      <div className="fade-up mb-6">
        <Eyebrow>Live experiment results</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">How do breaks affect Corsi span?</h1>
        <p className="mt-2 max-w-3xl muted">
          Calculated directly from completed tests in the study database and refreshed automatically. Participants are
          shown as anonymous codes. Small samples are noisy — treat differences as descriptive, not conclusive.
        </p>
      </div>
      <LiveResults />
    </Container>
  );
}
