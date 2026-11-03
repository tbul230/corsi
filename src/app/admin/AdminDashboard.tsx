'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import ResultsCharts from '@/components/ResultsCharts';
import { Alert, Eyebrow, Stat, StatusPill } from '@/components/ui';
import { ConditionIcon } from '@/components/icons';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import { formatDateTime, formatDuration, formatPct } from '@/lib/format';
import type { ResultRow } from '@/lib/stats';
import { browserClient } from '@/lib/supabase/browser';
import type { AdminData, AdminSession } from '@/lib/admin-data';
import SignOutButton from './SignOutButton';

type Tab = 'overview' | 'participants' | 'sessions' | 'integrity' | 'export' | 'deletions';

const STATUS_LABEL: Record<string, string> = {
  break_in_progress: 'Break in progress',
  awaiting_test: 'Break done · test not started',
  test_in_progress: 'Test in progress',
  completed: 'Completed'
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : ''}`}>{children}</th>;
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${right ? 'text-right tabular-nums' : ''} ${mono ? 'font-mono text-xs' : ''}`}>
      {children}
    </td>
  );
}

function useDeleter() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(kind: 'participant' | 'session', id: string, label: string) {
    const what =
      kind === 'participant'
        ? `Permanently delete ${label} and ALL of their attempts and trials?`
        : `Permanently delete this attempt (${label}) and its trials? The participant will be able to do this condition again.`;
    if (!confirm(`${what}\n\nThis cannot be undone. A copy is kept in the deletion log.`)) return false;
    setBusy(id);
    const { error } =
      kind === 'participant'
        ? await browserClient().rpc('admin_delete_participant', { p_participant: id })
        : await browserClient().rpc('admin_delete_session', { p_session: id });
    setBusy(null);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return false;
    }
    router.refresh();
    return true;
  }
  return { busy, run };
}

function DeleteButton({ onClick, busy, label = 'Delete', testId }: { onClick: () => void; busy: boolean; label?: string; testId?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className="rounded-full border border-red-300/30 bg-red-400/10 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-400/20 disabled:opacity-50">
      {busy ? 'Deleting…' : label}
    </button>
  );
}

export default function AdminDashboard({ data: allData, email }: { data: AdminData; email: string }) {
  const router = useRouter();
  const [includeTest, setIncludeTest] = useState(false);
  const deleter = useDeleter();
  const testRunCount = allData.participants.filter((p) => p.is_test).length;
  const data = useMemo<AdminData>(() => {
    if (includeTest) return allData;
    const testSessions = new Set(allData.sessions.filter((s) => s.is_test).map((s) => s.id));
    return {
      ...allData,
      participants: allData.participants.filter((p) => !p.is_test),
      sessions: allData.sessions.filter((s) => !s.is_test),
      trials: allData.trials.filter((t) => !testSessions.has(t.session_id)),
      events: allData.events.filter((e) => !testSessions.has(e.session_id))
    };
  }, [allData, includeTest]);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { participants, sessions, trials, events } = data;
  const pById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const name = (pid: string) => {
    const p = pById.get(pid);
    return p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  };

  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const unfinished = sessions.filter((s) => s.status !== 'completed');
  const interrupted = sessions.filter((s) => s.break_interruptions > 0 || s.test_interruptions > 0);

  const rows: ResultRow[] = completedSessions.map((s) => ({
    participant: name(s.participant_id),
    condition: s.condition,
    condition_order: s.condition_order,
    corsi_span: s.corsi_span ?? 0,
    accuracy: s.accuracy
  }));

  const completionCounts = [0, 1, 2, 3].map(
    (k) => participants.filter((p) => completedSessions.filter((s) => s.participant_id === p.id).length === k).length
  );

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['participants', `Participants (${participants.length})`],
    ['sessions', `Sessions (${sessions.length})`],
    ['integrity', `Unfinished & interruptions (${new Set([...unfinished, ...interrupted].map((s) => s.id)).size})`],
    ['export', 'Export & account'],
    ['deletions', `Deletion log (${data.deletions.length})`]
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Administrator dashboard</Eyebrow>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Corsi experiment data</h1>
          <p className="text-sm muted">Signed in as {email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong px-3 text-sm">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => setIncludeTest(e.target.checked)}
              className="h-4 w-4 accent-amber-300"
              data-testid="include-test"
            />
            Show admin test runs ({testRunCount})
          </label>
          <button
            className="btn btn-glass text-sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              router.refresh();
              setTimeout(() => setRefreshing(false), 800);
            }}>
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
          <SignOutButton />
        </div>
      </div>

      {includeTest ? (
        <Alert tone="info">Admin test runs are included in the tables and charts below. Turn this off for real study data.</Alert>
      ) : null}

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-navy-900 p-1 text-sm" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 font-medium transition-colors ${tab === key ? 'bg-navy-700 text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Registered participants" value={participants.length} />
            <Stat label="Finished all 3 conditions" value={completionCounts[3]} hint={`${participants.length ? Math.round((100 * completionCounts[3]) / participants.length) : 0}% of participants`} />
            <Stat label="Completed sessions" value={completedSessions.length} hint={`of ${participants.length * 3} possible`} />
            <Stat label="Unfinished sessions" value={unfinished.length} />
          </div>
          <div className="glass rounded-2xl p-5">
            <h3 className="font-semibold">Completion statistics</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                {completionCounts.map((c, k) => (
                  <div key={k} className="glass-soft rounded-2xl p-3">
                    <p className="text-2xl font-semibold tabular-nums">{c}</p>
                    <p className="text-xs muted">{k} of 3 done</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                {CONDITIONS.map((c) => (
                  <div key={c} className="glass-soft rounded-2xl p-3">
                    <p className="text-2xl font-semibold tabular-nums">{completedSessions.filter((s) => s.condition === c).length}</p>
                    <p className="text-xs muted">{CONDITION_INFO[c].short} completed</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ResultsCharts rows={rows} totalParticipants={participants.length} participantLabel="Participant" />
        </div>
      ) : null}

      {tab === 'participants' ? (
        selectedParticipant ? (
          <ParticipantDetail
            pid={selectedParticipant}
            data={data}
            deleter={deleter}
            onBack={() => {
              setSelectedParticipant(null);
              setSelectedSession(null);
            }}
            selectedSession={selectedSession}
            onSelectSession={setSelectedSession}
          />
        ) : (
          <div className="glass overflow-x-auto rounded-2xl p-3">
            {participants.length === 0 ? (
              <p className="p-6 text-center muted">No participants yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium text-ink-3">
                  <tr>
                    <Th>Name</Th>
                    <Th>Registered</Th>
                    <Th>Access code</Th>
                    {CONDITIONS.map((c) => (
                      <Th key={c} right>{CONDITION_INFO[c].short}</Th>
                    ))}
                    <Th>Progress</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {participants.map((p) => {
                    const ps = sessions.filter((s) => s.participant_id === p.id);
                    return (
                      <tr key={p.id} className="hover:bg-navy-850">
                        <Td>
                          {p.first_name} {p.last_name}
                          {p.is_test ? <span className="ml-2 rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-100">Test</span> : null}
                        </Td>
                        <Td>{formatDateTime(p.created_at)}</Td>
                        <Td mono>{p.access_code}</Td>
                        {CONDITIONS.map((c) => {
                          const s = ps.find((x) => x.condition === c);
                          return (
                            <Td key={c} right>
                              {s?.status === 'completed' ? <strong>{s.corsi_span}</strong> : s ? <span className="text-amber-200">…</span> : <span className="muted">—</span>}
                            </Td>
                          );
                        })}
                        <Td>{ps.filter((s) => s.status === 'completed').length}/3</Td>
                        <Td>
                          <span className="flex items-center gap-3">
                            <button className="text-accent hover:underline" onClick={() => setSelectedParticipant(p.id)}>
                              View
                            </button>
                            <DeleteButton
                              busy={deleter.busy === p.id}
                              testId={`delete-participant-${p.id}`}
                              onClick={() => void deleter.run('participant', p.id, `${p.first_name} ${p.last_name}`)}
                            />
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      ) : null}

      {tab === 'sessions' ? (
        <SessionTable sessions={sessions} name={name} onOpen={(s) => { setSelectedParticipant(s.participant_id); setSelectedSession(s.id); setTab('participants'); }} />
      ) : null}

      {tab === 'integrity' ? (
        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-lg font-semibold">Unfinished sessions ({unfinished.length})</h2>
            <SessionTable sessions={unfinished} name={name} onOpen={(s) => { setSelectedParticipant(s.participant_id); setSelectedSession(s.id); setTab('participants'); }} />
          </div>
          <div>
            <h2 className="mb-2 text-lg font-semibold">Interrupted breaks / tests ({interrupted.length})</h2>
            <p className="mb-2 text-sm muted">
              Break interruptions = the break page was closed, refreshed or navigated away from. Test interruptions = a
              trial was shown but the page was left before answering (a new sequence was issued on return).
            </p>
            <div className="glass overflow-x-auto rounded-2xl p-3">
              {interrupted.length === 0 ? (
                <p className="p-6 text-center muted">No interruptions recorded.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-medium text-ink-3">
                    <tr><Th>Participant</Th><Th>Condition</Th><Th right>Break interruptions</Th><Th right>Tab switches</Th><Th right>Test interruptions</Th><Th>Event log</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {interrupted.map((s) => {
                      const ev = events.filter((e) => e.session_id === s.id);
                      return (
                        <tr key={s.id}>
                          <Td>{name(s.participant_id)}</Td>
                          <Td>{CONDITION_INFO[s.condition].short}</Td>
                          <Td right>{s.break_interruptions}</Td>
                          <Td right>{ev.filter((e) => e.event_type === 'tab_hidden').length}</Td>
                          <Td right>{s.test_interruptions}</Td>
                          <td className="px-3 py-2 text-xs muted">
                            {ev.filter((e) => e.event_type === 'page_closed').map((e) => (
                              <div key={e.id}>closed {formatDateTime(e.occurred_at)} ({formatDuration(e.client_remaining_seconds)} left)</div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'export' ? <ExportPanel /> : null}

      {tab === 'deletions' ? (
        <div className="glass overflow-x-auto rounded-2xl p-3">
          {data.deletions.length === 0 ? (
            <p className="p-6 text-center muted">Nothing has been deleted.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-ink-3">
                <tr><Th>When</Th><Th>Type</Th><Th>What</Th><Th>By</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...data.deletions].reverse().map((d) => (
                  <tr key={d.id}>
                    <Td>{formatDateTime(d.deleted_at)}</Td>
                    <Td>{d.kind === 'participant' ? 'Participant' : 'Attempt'}</Td>
                    <Td>{d.summary}</Td>
                    <Td>{d.deleted_by_email ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      <p className="text-xs muted">
        {trials.length} trial records · {events.length} break events loaded. Completed results are read-only — the
        database rejects edits and deletions.
      </p>
    </div>
  );
}

function SessionTable({
  sessions,
  name,
  onOpen
}: {
  sessions: AdminSession[];
  name: (pid: string) => string;
  onOpen: (s: AdminSession) => void;
}) {
  if (sessions.length === 0) return <div className="glass rounded-2xl p-6 text-center muted">No sessions.</div>;
  return (
    <div className="glass overflow-x-auto rounded-2xl p-3">
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-medium text-ink-3">
          <tr>
            <Th>Participant</Th><Th>Condition</Th><Th right>Order</Th><Th>Status</Th><Th>Break start</Th><Th>Break completed</Th>
            <Th right>Break length</Th><Th>Test start</Th><Th>Test end</Th><Th right>Span</Th><Th right>Accuracy</Th><Th>{''}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-navy-850">
              <Td>{name(s.participant_id)}</Td>
              <Td>{CONDITION_INFO[s.condition].short}</Td>
              <Td right>{s.condition_order}</Td>
              <Td>{STATUS_LABEL[s.status]}</Td>
              <Td>{formatDateTime(s.break_started_at)}</Td>
              <Td>{formatDateTime(s.break_completed_at)}</Td>
              <Td right>{formatDuration(s.actual_break_seconds)}</Td>
              <Td>{formatDateTime(s.test_started_at)}</Td>
              <Td>{formatDateTime(s.test_completed_at)}</Td>
              <Td right>{s.corsi_span ?? '—'}</Td>
              <Td right>{formatPct(s.accuracy)}</Td>
              <Td><button className="text-accent hover:underline" onClick={() => onOpen(s)}>Details</button></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParticipantDetail({
  pid,
  data,
  deleter,
  onBack,
  selectedSession,
  onSelectSession
}: {
  pid: string;
  data: AdminData;
  deleter: ReturnType<typeof useDeleter>;
  onBack: () => void;
  selectedSession: string | null;
  onSelectSession: (id: string | null) => void;
}) {
  const p = data.participants.find((x) => x.id === pid);
  if (!p) return null;
  const ps = data.sessions.filter((s) => s.participant_id === pid).sort((a, b) => a.condition_order - b.condition_order);
  const sel = ps.find((s) => s.id === selectedSession) ?? null;
  const st = sel ? data.trials.filter((t) => t.session_id === sel.id).sort((a, b) => a.trial_number - b.trial_number) : [];
  const ev = sel ? data.events.filter((e) => e.session_id === sel.id) : [];

  return (
    <div className="space-y-5">
      <button className="text-sm text-accent hover:underline" onClick={onBack}>← All participants</button>
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">
            {p.first_name} {p.last_name}
            {p.is_test ? <span className="ml-2 align-middle rounded-full bg-amber-300/15 px-2 py-0.5 text-xs font-semibold uppercase text-amber-100">Test run</span> : null}
          </h2>
          <DeleteButton
            label="Delete participant & all attempts"
            busy={deleter.busy === p.id}
            onClick={async () => {
              if (await deleter.run('participant', p.id, `${p.first_name} ${p.last_name}`)) onBack();
            }}
          />
        </div>
        <div className="mt-2 grid gap-1 text-sm muted sm:grid-cols-2">
          <p>Registered: {formatDateTime(p.created_at)}</p>
          <p>Consent (all three): {p.consent_participation && p.consent_quiet_environment && p.consent_guidelines ? 'Yes' : 'No'} · {formatDateTime(p.consented_at)}</p>
          <p>Assigned (counterbalanced) order: {p.assigned_order.map((c) => CONDITION_INFO[c as Condition].short).join(' → ')}</p>
          <p>Actual order: {ps.map((s) => CONDITION_INFO[s.condition].short).join(' → ') || '—'}</p>
          <p>Access code: <span className="font-mono text-ink">{p.access_code}</span></p>
          <p>Experiment completed: {p.experiment_completed ? formatDateTime(p.experiment_completed_at) : 'No'}</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {CONDITIONS.map((c) => {
          const s = ps.find((x) => x.condition === c);
          return (
            <button
              key={c}
              disabled={!s}
              onClick={() => s && onSelectSession(s.id)}
              className={`glass rounded-2xl p-5 text-left ${sel?.id === s?.id && s ? 'ring-2 ring-accent' : ''} ${!s ? 'opacity-60' : 'hover:bg-white/10'}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold"><ConditionIcon condition={c} className="h-5 w-5" style={{ color: CONDITION_INFO[c].accent }} />{CONDITION_INFO[c].short}</span>
                <StatusPill status={!s ? 'not_started' : s.status === 'completed' ? 'completed' : 'in_progress'} />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{s?.corsi_span ?? '--'}</p>
              <p className="text-xs muted">{s ? `#${s.condition_order} · ${formatPct(s.accuracy)} accuracy` : 'Not started'}</p>
            </button>
          );
        })}
      </div>
      {sel ? (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{CONDITION_INFO[sel.condition].title} — exact timestamps</h3>
              <DeleteButton
                label="Delete this attempt"
                busy={deleter.busy === sel.id}
                testId="delete-session"
                onClick={async () => {
                  if (await deleter.run('session', sel.id, `${p.first_name} ${p.last_name} · ${CONDITION_INFO[sel.condition].short}`))
                    onSelectSession(null);
                }}
              />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ['Status', STATUS_LABEL[sel.status]],
                ['Break started', formatDateTime(sel.break_started_at)],
                ['Break scheduled end', formatDateTime(sel.break_ends_at)],
                ['Break completed', formatDateTime(sel.break_completed_at)],
                ['Expected break', formatDuration(sel.expected_break_seconds)],
                ['Actual break', formatDuration(sel.actual_break_seconds)],
                ['Test started', formatDateTime(sel.test_started_at)],
                ['Test completed', formatDateTime(sel.test_completed_at)],
                ['Test duration', formatDuration(sel.test_duration_seconds)],
                ['Break interruptions', sel.break_interruptions],
                ['Break skipped (test mode)', sel.break_skipped ? 'Yes' : 'No'],
                ['Test interruptions', sel.test_interruptions],
                ['Span / total score', `${sel.corsi_span ?? '—'} / ${sel.total_score ?? '—'}`],
                ['Correct / incorrect / attempts', `${sel.correct_trials ?? '—'} / ${sel.incorrect_trials ?? '—'} / ${sel.total_attempts ?? '—'}`],
                ['Accuracy', formatPct(sel.accuracy)]
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3 border-b border-line py-1">
                  <dt className="muted">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {ev.length ? (
              <p className="mt-3 text-xs muted">
                Break events: {ev.map((e) => `${e.event_type.replace('_', ' ')} @ ${new Date(e.occurred_at).toLocaleTimeString()}`).join(' · ')}
              </p>
            ) : null}
          </div>
          <div className="glass overflow-x-auto rounded-2xl p-3">
            <h3 className="px-3 pt-3 font-semibold">Trial-by-trial results</h3>
            {st.length === 0 ? (
              <p className="p-6 text-center muted">No trials recorded.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs font-medium text-ink-3">
                  <tr><Th>#</Th><Th right>Length</Th><Th right>Attempt</Th><Th>Sequence (1–9)</Th><Th>Response</Th><Th>Result</Th><Th right>RT</Th><Th>Presented</Th><Th>Responded</Th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {st.map((t) => (
                    <tr key={t.id}>
                      <Td>{t.trial_number}</Td>
                      <Td right>{t.sequence_length}</Td>
                      <Td right>{t.attempt_at_length}</Td>
                      <Td mono>{t.sequence.map((b) => b + 1).join('-')}</Td>
                      <Td mono>{t.response.map((b) => b + 1).join('-')}</Td>
                      <Td><span className={t.is_correct ? 'text-emerald-300' : 'text-red-300'}>{t.is_correct ? 'Correct' : 'Incorrect'}</span></Td>
                      <Td right>{t.response_time_ms != null ? `${t.response_time_ms} ms` : '—'}</Td>
                      <Td>{formatDateTime(t.presented_at)}</Td>
                      <Td>{formatDateTime(t.responded_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm muted">Select a condition above to see timestamps and trial-by-trial data.</p>
      )}
    </div>
  );
}

function ExportPanel() {
  const [withTest, setWithTest] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) return setMsg({ tone: 'error', text: 'Use at least 12 characters.' });
    if (pw !== pw2) return setMsg({ tone: 'error', text: 'Passwords do not match.' });
    const { error } = await browserClient().auth.updateUser({ password: pw });
    setMsg(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Password updated.' });
    if (!error) {
      setPw('');
      setPw2('');
    }
  }

  const exports: [string, string, string][] = [
    ['sessions', 'Sessions', 'One row per participant × condition: all timestamps and scores.'],
    ['trials', 'Trials', 'Every trial: sequence, response, correctness, response time.'],
    ['participants', 'Participants', 'Names, consent, counterbalanced order, completion.'],
    ['break-events', 'Break events', 'Page opened/closed and tab hidden/visible log.']
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Export CSV</h2>
        <label className="mt-2 flex items-center gap-2 text-sm muted">
          <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} className="h-4 w-4 accent-amber-300" />
          Include admin test runs (marked with is_test = true)
        </label>
        <div className="mt-4 space-y-3">
          {exports.map(([type, label, desc]) => (
            <a key={type} href={`/api/admin/export?type=${type}${withTest ? '&include_test=1' : ''}`} className="glass-soft flex items-center justify-between gap-3 rounded-2xl p-4 hover:bg-white/10" download>
              <span>
                <span className="block font-medium">{label}.csv</span>
                <span className="block text-xs muted">{desc}</span>
              </span>
              <span className="text-sm text-accent">Download</span>
            </a>
          ))}
        </div>
      </div>
      <form onSubmit={changePassword} className="glass space-y-3 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Change administrator password</h2>
        <input type="password" className="input" placeholder="New password (12+ characters)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className="input" placeholder="Repeat new password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        <button className="btn btn-primary">Update password</button>
      </form>
    </div>
  );
}
