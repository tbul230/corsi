'use client';

import { Card, Container } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="max-w-md! pt-20 text-center">
      <Card>
        <p className="text-xl font-semibold">Something went wrong</p>
        <p className="mt-2 text-sm muted">Your saved results are safe. Please try again.</p>
        <button className="btn btn-primary mt-6" onClick={reset}>Try again</button>
      </Card>
    </Container>
  );
}
