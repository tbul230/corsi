'use client';

import { Card, Container } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="flex flex-1 items-center justify-center py-12 text-center">
      <div className="w-full max-w-md">
      <Card>
        <p className="text-xl font-semibold">Something went wrong</p>
        <p className="mt-2 text-sm muted">Your saved results are safe. Please try again.</p>
        <button className="btn btn-primary mt-6" onClick={reset}>Try again</button>
      </Card>
      </div>
    </Container>
  );
}
