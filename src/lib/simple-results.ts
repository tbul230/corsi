/**
 * Plain-language results for students (7th grade): average/highest score per break, and for each pair of
 * breaks a p-value with a "real difference or just luck?" verdict. The p-values come from a paired t-test
 * (each student compared with themselves), without any multiple-comparison adjustment.
 */
import { CONDITIONS, CONDITION_INFO, type Condition } from './constants.ts';
import { pairedTTest } from './inference.ts';
import type { ResultRow } from './stats.ts';

export const P_CUTOFF = 0.05;

/** p-value the way it is written in school: 0.12, 0.003, "less than 0.001". */
export function pText(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—';
  if (p < 0.001) return 'less than 0.001';
  if (p >= 0.995) return '1.00';
  // Never round onto the 0.05 cut-off (0.0496 must not read "0.05"): add digits until it is clearly above or below.
  let digits = p < 0.01 ? 3 : 2;
  while (digits < 6 && Number(p.toFixed(digits)) === P_CUTOFF && p !== P_CUTOFF) digits++;
  return p.toFixed(digits);
}

/** "p = 0.12" or "p < 0.001". */
export function pEquals(p: number | null | undefined): string {
  const t = pText(p);
  return t.startsWith('less') ? 'p < 0.001' : `p = ${t}`;
}

/** Same rounding as the charts and number tiles (2 decimals, no trailing zeros: 6, 5.5, 5.33). */
const round1 = (x: number) => String(Math.round(x * 100) / 100);

export interface BreakSummary {
  condition: Condition;
  name: string;
  students: number;
  average: string;
  highest: string;
}

export interface PairSummary {
  a: Condition;
  b: Condition;
  label: string;
  students: number;
  averageA: string;
  averageB: string;
  /** e.g. "Video Game, by 0.7 blocks" */
  better: string;
  p: number | null;
  /** true = probably real, false = could be luck, null = not enough data */
  real: boolean | null;
  verdict: string;
}

export function breakSummaries(rows: ResultRow[]): BreakSummary[] {
  return CONDITIONS.map((c) => {
    const spans = rows.filter((r) => r.condition === c).map((r) => Number(r.corsi_span));
    return {
      condition: c,
      name: CONDITION_INFO[c].short,
      students: spans.length,
      average: spans.length ? round1(spans.reduce((x, y) => x + y, 0) / spans.length) : '—',
      highest: spans.length ? String(Math.max(...spans)) : '—'
    };
  });
}

export function pairSummaries(rows: ResultRow[], conditions: Condition[] = [...CONDITIONS]): PairSummary[] {
  const people = new Map<string, Partial<Record<Condition, number>>>();
  for (const r of rows) {
    const e = people.get(r.participant) ?? {};
    e[r.condition] = Number(r.corsi_span);
    people.set(r.participant, e);
  }
  const out: PairSummary[] = [];
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const a = conditions[i];
      const b = conditions[j];
      const both = [...people.values()].filter((p) => p[a] != null && p[b] != null);
      const res = pairedTTest(both.map((p) => p[a]!), both.map((p) => p[b]!));
      const A = CONDITION_INFO[a].short;
      const B = CONDITION_INFO[b].short;
      const diff = res ? res.meanDiff : 0;
      const better = !res ? '—' : Math.abs(diff) < 0.05 ? 'About the same' : `${diff > 0 ? A : B}, by ${round1(Math.abs(diff))} blocks`;
      const real = res ? res.p < P_CUTOFF : null;
      out.push({
        a,
        b,
        label: `${A} vs ${B}`,
        students: both.length,
        averageA: res ? round1(res.meanA) : '—',
        averageB: res ? round1(res.meanB) : '—',
        better,
        p: res ? res.p : null,
        real,
        verdict: real == null ? 'Not enough data yet' : real ? 'Yes, probably a real difference' : 'No, could just be luck'
      });
    }
  }
  return out;
}

/** Plain text for pasting anywhere (Canva text box, Slides, Docs). */
export function pValuesText(pairs: PairSummary[]): string {
  return pairs
    .map((p) => (p.p == null ? `${p.label}: not enough data yet` : `${p.label}: ${pEquals(p.p)} (${p.real ? 'probably a real difference' : 'could just be luck'})`))
    .join('\n');
}
