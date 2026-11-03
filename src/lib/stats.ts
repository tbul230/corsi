import { CONDITIONS, type Condition } from './constants.ts';

/** Minimal row shape shared by the public and admin dashboards. */
export interface ResultRow {
  participant: string;
  condition: Condition;
  condition_order: number;
  corsi_span: number;
  accuracy: number | null;
}

export interface ConditionSummary {
  condition: Condition;
  n: number;
  meanSpan: number | null;
  sdSpan: number | null;
  seSpan: number | null;
  maxSpan: number | null;
  accuracyN: number;
  meanAccuracy: number | null;
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function sd(values: number[]) {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

export function round(v: number | null, digits = 2) {
  if (v == null) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Per-condition averages. Conditions with no data return n = 0 and null means (never zero). */
export function summariseByCondition(rows: ResultRow[]): ConditionSummary[] {
  return CONDITIONS.map((condition) => {
    const spans = rows.filter((r) => r.condition === condition).map((r) => Number(r.corsi_span));
    const accs = rows
      .filter((r) => r.condition === condition && r.accuracy != null)
      .map((r) => Number(r.accuracy));
    const s = sd(spans);
    return {
      condition,
      n: spans.length,
      meanSpan: round(mean(spans)),
      sdSpan: round(s),
      seSpan: s == null ? null : round(s / Math.sqrt(spans.length)),
      maxSpan: spans.length ? Math.max(...spans) : null,
      accuracyN: accs.length,
      meanAccuracy: round(mean(accs))
    };
  });
}

export type ParticipantRow = { participant: string } & Partial<Record<Condition, number>>;

/** One row per participant with their span in each condition; missing conditions stay undefined. */
export function participantMatrix(rows: ResultRow[]): ParticipantRow[] {
  const map = new Map<string, ParticipantRow>();
  for (const r of rows) {
    const row = map.get(r.participant) ?? { participant: r.participant };
    row[r.condition] = Number(r.corsi_span);
    map.set(r.participant, row);
  }
  return [...map.values()].sort((a, b) =>
    a.participant.localeCompare(b.participant, undefined, { numeric: true })
  );
}

export function overall(rows: ResultRow[]) {
  const spans = rows.map((r) => Number(r.corsi_span));
  const accs = rows.filter((r) => r.accuracy != null).map((r) => Number(r.accuracy));
  return {
    completedTests: rows.length,
    participantsWithResults: new Set(rows.map((r) => r.participant)).size,
    meanSpan: round(mean(spans)),
    maxSpan: spans.length ? Math.max(...spans) : null,
    meanAccuracy: round(mean(accs))
  };
}

/** Mean span by the position (1st, 2nd, 3rd) in which a condition was completed — practice effects. */
export function summariseByOrder(rows: ResultRow[]) {
  return [1, 2, 3].map((order) => {
    const spans = rows.filter((r) => r.condition_order === order).map((r) => Number(r.corsi_span));
    return { order, n: spans.length, meanSpan: round(mean(spans)) };
  });
}

/** Only participants who completed all three conditions (for within-subject comparison). */
export function completeCasesOnly(rows: ResultRow[]) {
  const counts = new Map<string, Set<Condition>>();
  for (const r of rows) {
    const s = counts.get(r.participant) ?? new Set<Condition>();
    s.add(r.condition);
    counts.set(r.participant, s);
  }
  return rows.filter((r) => counts.get(r.participant)!.size === CONDITIONS.length);
}
