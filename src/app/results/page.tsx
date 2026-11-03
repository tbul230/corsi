import type { Metadata } from 'next';
import { Container, PageHeader } from '@/components/ui';
import LiveResults from './LiveResults';

export const metadata: Metadata = { title: 'Experiment results' };

export default function ResultsPage() {
  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <div className="mb-6">
        <PageHeader
          eyebrow="Live experiment results"
          title="How do breaks affect Corsi span?"
          description="Calculated directly from completed tests and refreshed automatically. Participants appear as anonymous codes. With small samples, treat differences as descriptive rather than conclusive."
        />
      </div>
      <LiveResults />
    </Container>
  );
}
