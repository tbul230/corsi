'use client';

import { useState } from 'react';
import type { SessionDetail, SessionSummary } from '@/lib/types';
import BreakTimer from './BreakTimer';
import CorsiTest from './CorsiTest';
import ResultsView from './ResultsView';
import { api } from '@/lib/api';

export default function SessionRunner({ initial }: { initial: SessionDetail }) {
  const [detail, setDetail] = useState(initial);
  const { session } = detail;

  async function reload() {
    const fresh = await api<SessionDetail>('session', { sessionId: session.id });
    setDetail(fresh);
  }

  if (session.status === 'break_in_progress') {
    return (
      <BreakTimer
        session={session}
        onComplete={(s: SessionSummary) => setDetail((d) => ({ ...d, session: s }))}
      />
    );
  }
  if (session.status === 'awaiting_test' || session.status === 'test_in_progress') {
    return <CorsiTest session={session} onFinished={() => void reload()} />;
  }
  return <ResultsView detail={detail} />;
}
