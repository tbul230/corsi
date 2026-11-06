'use client';

import { useCallback, useEffect, useState } from 'react';
import ResultsCharts from '@/components/ResultsCharts';
import { Alert, Spinner } from '@/components/ui';
import type { PublicResults } from '@/lib/types';

const REFRESH_MS = 10_000;

export default function LiveResults() {
  const [data, setData] = useState<PublicResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/results', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(null);
    } catch {
      setError('Could not load the latest results. Retrying automatically…');
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  if (!data) return error ? <Alert>{error}</Alert> : <Spinner label="Loading results…" />;

  return (
    <>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <ResultsCharts rows={data.sessions} totalParticipants={data.total_participants} />
      <p className="mt-4 text-xs muted" aria-live="polite">
        Live · updated {new Date(data.generated_at).toLocaleTimeString()} · refreshes every 10 seconds
      </p>
    </>
  );
}
