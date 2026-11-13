'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { CONDITIONS, CONDITION_INFO, type Condition } from '@/lib/constants';
import {
  cumulativeTimeline,
  participantMatrix,
  spanDistribution,
  summariseByCondition,
  summariseByOrder,
  type ResultRow
} from '@/lib/stats';

/** Colours for one chart theme. "dark" matches the site; "light" is for printing and slides. */
export interface ChartPalette {
  name: 'dark' | 'light';
  background: string;
  text: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  cursor: string;
  neutral: string;
}

export const DARK: ChartPalette = {
  name: 'dark',
  background: '#0a1430',
  text: '#f3f7ff',
  muted: 'rgba(220,232,255,0.6)',
  grid: 'rgba(255,255,255,0.08)',
  tooltipBg: 'rgba(8,18,44,0.96)',
  tooltipBorder: 'rgba(255,255,255,0.18)',
  cursor: 'rgba(255,255,255,0.06)',
  neutral: '#8ec5ff'
};

export const LIGHT: ChartPalette = {
  name: 'light',
  background: '#ffffff',
  text: '#0f172a',
  muted: '#475569',
  grid: '#e2e8f0',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  cursor: 'rgba(15,23,42,0.05)',
  neutral: '#2563eb'
};

export interface ChartProps {
  rows: ResultRow[];
  palette: ChartPalette;
  /** Conditions to show (defaults to all three). */
  conditions?: Condition[];
  /** Participant label to emphasise (e.g. "You"). */
  highlight?: string;
  /** Clicking a condition's bar calls this (used for click-to-filter). */
  onPickCondition?: (c: Condition) => void;
  height?: number;
  /** Grow-in animation. Off for exported charts: labels are hidden while an animation runs. */
  animate?: boolean;
}

const anim = (on: boolean) =>
  on ? { animationDuration: 800, animationEasing: 'ease-out' as const } : { isAnimationActive: false as const };

function axis(p: ChartPalette) {
  return { stroke: p.muted, fontSize: 12, fill: p.muted };
}

function tooltip(p: ChartPalette) {
  return {
    contentStyle: {
      background: p.tooltipBg,
      border: `1px solid ${p.tooltipBorder}`,
      borderRadius: 12,
      color: p.text,
      boxShadow: p.name === 'dark' ? '0 12px 30px rgba(0,0,0,0.5)' : '0 8px 24px rgba(15,23,42,0.12)'
    },
    labelStyle: { color: p.text, fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: p.text },
    cursor: { fill: p.cursor }
  };
}

function legend(p: ChartPalette) {
  return {
    iconType: 'circle' as const,
    formatter: (value: unknown) => <span style={{ color: p.text, fontSize: 12 }}>{String(value)}</span>
  };
}

function conditionSummaryData(rows: ResultRow[], conditions: Condition[]) {
  return summariseByCondition(rows)
    .filter((s) => conditions.includes(s.condition))
    .map((s) => ({
      name: `${CONDITION_INFO[s.condition].short} (n=${s.n})`,
      condition: s.condition,
      meanSpan: s.meanSpan,
      sd: s.sdSpan ?? 0,
      sdText: s.sdSpan,
      n: s.n,
      meanAccuracy: s.meanAccuracy,
      accuracyN: s.accuracyN
    }));
}

/** Mean span per break type, with ±1 SD error bars. */
export function MeanSpanChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], onPickCondition, height = 280 }: ChartProps) {
  const data = conditionSummaryData(rows, conditions);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="name" tick={axis(p)} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={axis(p)} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
          <Tooltip
            {...tooltip(p)}
            formatter={(v, _n, item) => {
              const d = item.payload as { sdText: number | null; n: number };
              return [v == null ? 'No data' : `${v} blocks${d.sdText != null ? ` (SD ${d.sdText})` : ''} · n=${d.n}`, 'Mean span'];
            }}
          />
          <Bar
            dataKey="meanSpan"
            radius={[4, 4, 0, 0]}
            {...anim(animate)}
            cursor={onPickCondition ? 'pointer' : undefined}
            onClick={(d) => onPickCondition?.((d as unknown as { condition: Condition }).condition)}>
            {data.map((d) => (
              <Cell key={d.condition} fill={CONDITION_INFO[d.condition].accent} />
            ))}
            <ErrorBar dataKey="sd" width={6} strokeWidth={1.5} stroke={p.muted} direction="y" />
            <LabelList dataKey="meanSpan" position="insideBottom" offset={10} fill="#fff" fontSize={13} fontWeight={700} formatter={(v) => (v == null ? '' : String(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mean % of trials correct per break type. */
export function AccuracyChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], onPickCondition, height = 280 }: ChartProps) {
  const data = conditionSummaryData(rows, conditions);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="name" tick={axis(p)} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={axis(p)} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" />
          <Tooltip
            {...tooltip(p)}
            formatter={(v, _n, item) => [v == null ? 'No data' : `${v}% · n=${(item.payload as { accuracyN: number }).accuracyN}`, 'Mean accuracy']}
          />
          <Bar
            dataKey="meanAccuracy"
            radius={[4, 4, 0, 0]}
            {...anim(animate)}
            cursor={onPickCondition ? 'pointer' : undefined}
            onClick={(d) => onPickCondition?.((d as unknown as { condition: Condition }).condition)}>
            {data.map((d) => (
              <Cell key={d.condition} fill={CONDITION_INFO[d.condition].accent} />
            ))}
            <LabelList dataKey="meanAccuracy" position="top" fill={p.text} fontSize={12} formatter={(v) => (v == null ? 'no data' : `${v}%`)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Each participant's span in each condition (grouped bars). */
export function ParticipantChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], highlight, height = 320 }: ChartProps) {
  const matrix = participantMatrix(rows);
  const width = Math.max(matrix.length * 70, 320);
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: width, height }}>
        <ResponsiveContainer>
          <BarChart data={matrix} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={p.grid} vertical={false} />
            <XAxis
              dataKey="participant"
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => {
                const v = String(props.payload?.value ?? '');
                return (
                <text
                  x={Number(props.x)}
                  y={Number(props.y) + 12}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={v === highlight ? 700 : 400}
                  fill={v === highlight ? p.text : p.muted}>
                  {v}
                </text>
                );
              }}
            />
            <YAxis tick={axis(p)} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
            <Tooltip {...tooltip(p)} formatter={(v, name) => [v == null ? 'Not completed' : `${v} blocks`, name]} />
            <Legend {...legend(p)} />
            {conditions.map((c) => (
              <Bar key={c} dataKey={c} name={CONDITION_INFO[c].short} fill={CONDITION_INFO[c].accent} radius={[4, 4, 0, 0]} {...anim(animate)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** One line per participant across the three breaks, plus the group mean: shows within-person change. */
export function WithinPersonChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], highlight, height = 300 }: ChartProps) {
  const matrix = participantMatrix(rows);
  const means = summariseByCondition(rows);
  const data = conditions.map((c) => {
    const point: Record<string, number | string | null> = { name: CONDITION_INFO[c].short, Mean: means.find((m) => m.condition === c)?.meanSpan ?? null };
    for (const m of matrix) point[m.participant] = m[c] ?? null;
    return point;
  });
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 20, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="name" tick={axis(p)} axisLine={false} tickLine={false} padding={{ left: 30, right: 30 }} />
          <YAxis tick={axis(p)} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
          <Tooltip
            {...tooltip(p)}
            cursor={{ stroke: p.grid }}
            itemSorter={(item) => (item.name === 'Mean' ? -1 : item.name === highlight ? 0 : 1)}
            formatter={(v, name) => [v == null ? 'Not completed' : `${v} blocks`, name]}
          />
          {matrix.map((m) => {
            const me = m.participant === highlight;
            return (
              <Line
                key={m.participant}
                dataKey={m.participant}
                stroke={me ? '#facc15' : p.muted}
                strokeOpacity={me ? 1 : 0.35}
                strokeWidth={me ? 3 : 1.25}
                dot={{ r: me ? 4 : 2.5, strokeWidth: 0, fill: me ? '#facc15' : p.muted }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            );
          })}
          <Line dataKey="Mean" stroke={p.neutral} strokeWidth={3.5} strokeDasharray="7 4" dot={{ r: 5, fill: p.neutral, strokeWidth: 0 }} {...anim(animate)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** How many tests ended at each span, per condition. */
export function DistributionChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], height = 280 }: ChartProps) {
  const data = spanDistribution(rows);
  const max = Math.max(1, ...data.flatMap((d) => conditions.map((c) => d[c] ?? 0)));
  const last = Math.max(4, ...rows.map((r) => Number(r.corsi_span))) + 1;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data.slice(0, Math.min(10, last + 1))} margin={{ top: 8, right: 8, left: -12, bottom: 12 }} barGap={1} barCategoryGap="18%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="span" tick={axis(p)} axisLine={false} tickLine={false} label={{ value: 'Corsi span (blocks)', position: 'insideBottom', offset: -8, fill: p.muted, fontSize: 12 }} />
          <YAxis tick={axis(p)} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, max]} />
          <Tooltip {...tooltip(p)} labelFormatter={(l) => `Span ${l}`} formatter={(v, name) => [`${v} test${v === 1 ? '' : 's'}`, name]} />
          <Legend {...legend(p)} verticalAlign="top" height={28} />
          {conditions.map((c) => (
            <Bar key={c} dataKey={c} name={CONDITION_INFO[c].short} fill={CONDITION_INFO[c].accent} radius={[3, 3, 0, 0]} {...anim(animate)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mean span by completion position (1st, 2nd, 3rd condition): practice effects. */
export function OrderChart({ rows, palette: p, animate = true, height = 240 }: ChartProps) {
  const data = summariseByOrder(rows).map((o) => ({ name: `${['1st', '2nd', '3rd'][o.order - 1]} (n=${o.n})`, meanSpan: o.meanSpan }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="35%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="name" tick={axis(p)} axisLine={false} tickLine={false} />
          <YAxis tick={axis(p)} axisLine={false} tickLine={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
          <Tooltip {...tooltip(p)} formatter={(v) => [v == null ? 'No data' : `${v} blocks`, 'Mean span']} />
          <Bar dataKey="meanSpan" fill={p.neutral} radius={[4, 4, 0, 0]} {...anim(animate)}>
            <LabelList dataKey="meanSpan" position="top" fill={p.text} fontSize={12} formatter={(v) => (v == null ? 'no data' : String(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Running mean span per condition as tests come in, with the running test count. */
export function TimelineChart({ rows, palette: p, animate = true, conditions = [...CONDITIONS], height = 280 }: ChartProps) {
  const data = cumulativeTimeline(rows);
  const span = data.length ? data[data.length - 1].t - data[0].t : 0;
  const fmt = (t: number) =>
    span > 36 * 3600_000
      ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmt} tick={axis(p)} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis yAxisId="span" tick={axis(p)} axisLine={false} tickLine={false} domain={[0, 9]} ticks={[0, 3, 6, 9]} />
          <YAxis yAxisId="n" orientation="right" tick={axis(p)} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            {...tooltip(p)}
            cursor={{ stroke: p.grid }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            formatter={(v, name) => [name === 'Tests completed' ? String(v) : `${v} blocks`, name]}
          />
          <Legend {...legend(p)} verticalAlign="top" height={28} />
          <Line yAxisId="n" dataKey="tests" name="Tests completed" stroke={p.muted} strokeDasharray="3 3" dot={false} type="stepAfter" {...anim(animate)} />
          {conditions.map((c) => (
            <Line key={c} yAxisId="span" dataKey={c} name={`${CONDITION_INFO[c].short} mean`} stroke={CONDITION_INFO[c].accent} strokeWidth={2.5} dot={false} connectNulls {...anim(animate)} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Every chart, in display order, with its title and caption (used by the results page and the admin tab). */
export const CHARTS = [
  {
    id: 'mean-span',
    title: 'Average Corsi span by break type',
    caption: 'Mean span (blocks) with ±1 SD error bars. n = completed tests per condition. Missing data shows no bar, never zero.',
    Chart: MeanSpanChart,
    wide: false
  },
  {
    id: 'accuracy',
    title: 'Accuracy by break type',
    caption: 'Mean % of trials answered correctly in each condition.',
    Chart: AccuracyChart,
    wide: false
  },
  {
    id: 'within-person',
    title: 'Each participant across the three breaks',
    caption: 'One faint line per participant; the dashed line is the group mean. Gaps are conditions not yet completed.',
    Chart: WithinPersonChart,
    wide: false
  },
  {
    id: 'distribution',
    title: 'Distribution of spans',
    caption: 'How many tests ended at each span, per break type.',
    Chart: DistributionChart,
    wide: false
  },
  {
    id: 'participants',
    title: 'Individual participant comparison',
    caption: "Each participant's span in every condition they have completed.",
    Chart: ParticipantChart,
    wide: true
  },
  {
    id: 'timeline',
    title: 'Results over time',
    caption: 'Running mean span per break type as tests are completed (left axis), and total tests completed (right axis, dashed).',
    Chart: TimelineChart,
    wide: false
  },
  {
    id: 'order',
    title: 'Practice-effect check: span by completion order',
    caption: "Mean span on participants' 1st, 2nd and 3rd condition regardless of break type. A rising trend suggests practice effects.",
    Chart: OrderChart,
    wide: false
  }
] as const;
