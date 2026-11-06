'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import {
  overall,
  participantMatrix,
  summariseByCondition,
  summariseByOrder,
  type ResultRow
} from '@/lib/stats';
import { Stat } from './ui';

const AXIS = { stroke: 'rgba(220,232,255,0.55)', fontSize: 12 };
const GRID = 'rgba(255,255,255,0.08)';
const SURFACE = '#0a1430';

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(8,18,44,0.95)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 14,
    color: '#f3f7ff',
    boxShadow: '0 12px 30px rgba(0,0,0,0.5)'
  },
  labelStyle: { color: '#f3f7ff', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#dce8ff' },
  cursor: { fill: 'rgba(255,255,255,0.06)' }
};

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

function Empty({ text }: { text: string }) {
  return <div className="grid h-[260px] place-items-center rounded-2xl border border-dashed border-line-strong text-sm muted">{text}</div>;
}

function LegendText({ value }: { value: string }) {
  return <span style={{ color: '#dce8ff', fontSize: 12 }}>{value}</span>;
}

export default function ResultsCharts({
  rows,
  totalParticipants,
  participantLabel = 'Participant'
}: {
  rows: ResultRow[];
  totalParticipants: number;
  participantLabel?: string;
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

  const byCondition = useMemo(
    () => summariseByCondition(filtered).filter((s) => activeConditions.includes(s.condition)),
    [filtered, activeConditions]
  );
  const matrix = useMemo(() => participantMatrix(filtered), [filtered]);
  const totals = useMemo(() => overall(filtered), [filtered]);
  const byOrder = useMemo(() => summariseByOrder(filtered), [filtered]);

  const conditionData = byCondition.map((s) => ({
    name: `${CONDITION_INFO[s.condition].short} (n=${s.n})`,
    condition: s.condition,
    meanSpan: s.meanSpan,
    meanAccuracy: s.meanAccuracy,
    sd: s.sdSpan,
    n: s.n,
    accuracyN: s.accuracyN,
    fill: CONDITION_INFO[s.condition].accent
  }));

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

  const groupedWidth = Math.max(matrix.length * 70, 320);

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

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Average Corsi span by break type"
          subtitle="Mean span (blocks). n = completed tests in each condition. Conditions without data show no bar — missing is not zero.">
          <div className="h-[280px]">
            <ResponsiveContainer>
              <BarChart data={conditionData} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, _n, item) => {
                    const p = item.payload as { sd: number | null; n: number };
                    return [v == null ? 'No data' : `${v} blocks${p.sd != null ? ` (SD ${p.sd})` : ''} · n=${p.n}`, 'Mean span'];
                  }}
                />
                <Bar dataKey="meanSpan" radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={2} animationDuration={900} animationEasing="ease-out">
                  {conditionData.map((d) => (
                    <Cell key={d.condition} fill={d.fill} />
                  ))}
                  <LabelList dataKey="meanSpan" position="top" fill="#f3f7ff" fontSize={12} formatter={(v) => (v == null ? 'no data' : String(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Accuracy comparison"
          subtitle="Mean % of trials answered correctly in each condition (n shown per bar).">
          <div className="h-[280px]">
            <ResponsiveContainer>
              <BarChart data={conditionData} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, _n, item) => [
                    v == null ? 'No data' : `${v}% · n=${(item.payload as { accuracyN: number }).accuracyN}`,
                    'Mean accuracy'
                  ]}
                />
                <Bar dataKey="meanAccuracy" radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={2} animationDuration={900} animationEasing="ease-out">
                  {conditionData.map((d) => (
                    <Cell key={d.condition} fill={d.fill} />
                  ))}
                  <LabelList dataKey="meanAccuracy" position="top" fill="#f3f7ff" fontSize={12} formatter={(v) => (v == null ? 'no data' : `${v}%`)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Individual participant comparison"
        subtitle="Each participant's Corsi span in every condition they have completed. A missing bar means that condition is not completed yet.">
        {matrix.length === 0 ? (
          <Empty text="No results match the current filters." />
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: groupedWidth }} className="h-[320px]">
              <ResponsiveContainer>
                <BarChart data={matrix} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="participant" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v, name) => [v == null ? 'Not completed' : `${v} blocks`, name]}
                  />
                  <Legend formatter={(value) => <LegendText value={String(value)} />} iconType="circle" />
                  {activeConditions.map((c) => (
                    <Bar
                      key={c}
                      dataKey={c}
                      name={CONDITION_INFO[c].short}
                      fill={CONDITION_INFO[c].accent}
                      radius={[4, 4, 0, 0]}
                      animationDuration={900} animationEasing="ease-out"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Practice-effect check: span by completion order"
        subtitle="Mean span on participants' 1st, 2nd and 3rd condition, regardless of break type. A rising trend suggests practice effects.">
        <div className="h-[220px]">
          <ResponsiveContainer>
            <BarChart
              data={byOrder.map((o) => ({ name: `${['1st', '2nd', '3rd'][o.order - 1]} (n=${o.n})`, meanSpan: o.meanSpan }))}
              margin={{ top: 24, right: 8, left: -12, bottom: 0 }}
              barCategoryGap="35%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
              <Tooltip {...tooltipStyle} formatter={(v) => [v == null ? 'No data' : `${v} blocks`, 'Mean span']} />
              <Bar dataKey="meanSpan" fill="#8ec5ff" radius={[4, 4, 0, 0]} animationDuration={900} animationEasing="ease-out">
                <LabelList dataKey="meanSpan" position="top" fill="#f3f7ff" fontSize={12} formatter={(v) => (v == null ? 'no data' : String(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

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
