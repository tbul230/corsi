'use client';

import { useMemo, useState } from 'react';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import { overall, participantMatrix, type ResultRow } from '@/lib/stats';
import { CHARTS, DARK } from './charts/StudyCharts';
import PValueCalculator from './PValueCalculator';
import { Stat } from './ui';

function ChartCard({
  title,
  subtitle,
  children,
  className = ''
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl p-5 sm:p-6 ${className}`}>
      <h3 className="text-base font-semibold">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ResultsCharts({
  rows,
  totalParticipants,
  participantLabel = 'Participant',
  highlight
}: {
  rows: ResultRow[];
  totalParticipants: number;
  participantLabel?: string;
  /** Label of the viewer's own results (e.g. "You"), emphasised in the charts. */
  highlight?: string;
}) {
  const [activeConditions, setActiveConditions] = useState<Condition[]>([...CONDITIONS]);
  const [participant, setParticipant] = useState<string>('all');
  const [showTable, setShowTable] = useState(false);

  const participants = useMemo(
    () => [...new Set(rows.map((r) => r.participant))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => activeConditions.includes(r.condition) && (participant === 'all' || r.participant === participant)
      ),
    [rows, activeConditions, participant]
  );

  const matrix = useMemo(() => participantMatrix(filtered), [filtered]);
  const totals = useMemo(() => overall(filtered), [filtered]);

  // Clicking a bar focuses on that break type; clicking it again shows all three.
  const pickCondition = (c: Condition) =>
    setActiveConditions((cur) => (cur.length === 1 && cur[0] === c ? [...CONDITIONS] : [c]));

  const toggleCondition = (c: Condition) =>
    setActiveConditions((cur) =>
      cur.includes(c) ? (cur.length === 1 ? cur : cur.filter((x) => x !== c)) : CONDITIONS.filter((x) => x === c || cur.includes(x))
    );

  if (rows.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center" data-testid="results-empty">
        <p className="text-lg font-semibold">No completed tests yet</p>
        <p className="mt-1 text-sm muted">
          Charts appear automatically as soon as the first participant finishes a Corsi test.
          {totalParticipants > 0 ? ` ${totalParticipants} participant(s) registered so far.` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="results-charts">
      {/* Filters — one row above the charts */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-navy-900 p-3">
        <span className="px-2 text-xs font-medium text-ink-3">Conditions</span>
        {CONDITIONS.map((c) => {
          const on = activeConditions.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggleCondition(c)}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${on ? 'border-line-strong bg-navy-800 text-ink' : 'border-line text-ink-3'}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? CONDITION_INFO[c].accent : 'transparent', border: `1.5px solid ${CONDITION_INFO[c].accent}` }} />
              {CONDITION_INFO[c].short}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor="pfilter" className="text-xs font-medium text-ink-3">
            {participantLabel}
          </label>
          <select
            id="pfilter"
            value={participant}
            onChange={(e) => setParticipant(e.target.value)}
            className="rounded-full border border-line-strong bg-navy-950 px-3 py-1.5">
            <option value="all">All</option>
            {participants.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Chart 4: overall */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total participants" value={participant === 'all' ? totalParticipants : 1} hint="registered" />
        <Stat label="Completed tests" value={totals.completedTests} hint={`${totals.participantsWithResults} with results`} />
        <Stat label="Average span" value={totals.meanSpan ?? '—'} hint="blocks" />
        <Stat label="Highest span" value={totals.maxSpan ?? '—'} hint="blocks" />
        <Stat label="Average accuracy" value={totals.meanAccuracy != null ? `${totals.meanAccuracy}%` : '—'} />
      </div>

      <p className="-mt-1 text-xs muted">Hover or tap a chart for exact values. Click a bar to focus on that break type; click it again to show all.</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {CHARTS.map(({ id, title, caption, Chart, wide }) => (
          <ChartCard key={id} title={title} subtitle={caption} className={wide ? 'lg:col-span-2' : ''}>
            <div data-testid={`chart-${id}`}>
              <Chart rows={filtered} palette={DARK} conditions={activeConditions} highlight={highlight} onPickCondition={pickCondition} />
            </div>
          </ChartCard>
        ))}
      </div>

      {/* Significance tests use every participant (not the participant filter), for the selected break types. */}
      <PValueCalculator rows={rows} conditions={activeConditions} />

      <div>
        <button className="btn btn-glass text-sm" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
          {showTable ? 'Hide' : 'Show'} data table
        </button>
        {showTable ? (
          <div className="glass mt-3 overflow-x-auto rounded-2xl p-4">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs font-medium text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-medium">{participantLabel}</th>
                  {activeConditions.map((c) => (
                    <th key={c} className="px-3 py-2 text-right font-medium">{CONDITION_INFO[c].short} span</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matrix.map((m) => (
                  <tr key={m.participant}>
                    <td className="px-3 py-2">{m.participant}</td>
                    {activeConditions.map((c) => (
                      <td key={c} className="px-3 py-2 text-right tabular-nums">{m[c] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
