'use client';

import { Card, Container } from '@/components/ui';

/** Shown when a page fails to load on the server (the real cause is in the server logs under this reference). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md text-center">
        <Card>
          <p className="text-xl font-semibold">This page could not load</p>
          <p className="mt-2 text-sm muted">
            The study server had a problem while preparing this page. Your saved results are safe.
            {error.digest ? ` Reference: ${error.digest}.` : ''}
          </p>
          <button className="btn btn-primary mt-6" onClick={reset}>Try again</button>
        </Card>
      </div>
    </Container>
  );
}
