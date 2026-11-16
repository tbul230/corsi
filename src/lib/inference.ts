/**
 * Significance tests for the within-subjects design (every participant does every break).
 * Pure TypeScript, no dependencies; checked against SciPy/statsmodels in tests/inference.test.ts.
 */
import { CONDITIONS, type Condition } from './constants.ts';
import type { ResultRow } from './stats.ts';

// ------------------------------------------------------------------ distributions

/** log Γ(x), Lanczos approximation (|error| < 1e-14 for x > 0). */
export function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betacf(x: number, a: number, b: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betacf(x, a, b)) / a : 1 - (front * betacf(1 - x, b, a)) / b;
}

/** Two-sided p-value for Student's t. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

/** Upper quantile of t (e.g. 0.975 for a 95% interval), by bisection. */
export function tQuantile(p: number, df: number): number {
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    // P(T > mid) = tTwoSidedP(mid)/2
    if (1 - tTwoSidedP(mid, df) / 2 < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** P(F > f) for the F distribution. */
export function fSurvival(f: number, d1: number, d2: number): number {
  if (!Number.isFinite(f)) return 0;
  if (f <= 0) return 1;
  return ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

/** Regularised upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** P(χ² > x) with df degrees of freedom. */
export function chi2Survival(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

/** Standard normal CDF (via the complementary error function, |error| < 1.2e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(z / Math.SQRT2));
  const y =
    t *
    Math.exp(
      -(z * z) / 2 -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return z >= 0 ? 1 - y / 2 : y / 2;
}

// ------------------------------------------------------------------ helpers

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function sd(v: number[]) {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}

/** Ranks with ties averaged (1-based), plus the tie-group sizes. */
function rank(values: number[]) {
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  const ties: number[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}

// ------------------------------------------------------------------ tests

export interface PairedResult {
  n: number;
  meanA: number;
  meanB: number;
  /** Mean of (A − B). */
  meanDiff: number;
  p: number;
  /** t (paired t-test) or z (Wilcoxon, normal approximation; null when exact). */
  statistic: number | null;
  statisticLabel: string;
  df: number | null;
  ci95: [number, number] | null;
  /** Cohen's dz (t-test) or matched-pairs rank-biserial r (Wilcoxon). */
  effect: number | null;
  effectLabel: string;
  method: string;
}

/** Paired-samples t-test of A vs B. */
export function pairedTTest(a: number[], b: number[]): PairedResult | null {
  const n = a.length;
  if (n < 2) return null;
  const d = a.map((x, i) => x - b[i]);
  const md = mean(d);
  const s = sd(d);
  const base = { n, meanA: mean(a), meanB: mean(b), meanDiff: md, statisticLabel: 't', df: n - 1, effectLabel: "Cohen's dz", method: 'Paired t-test' };
  if (s === 0) {
    // Every participant changed by exactly the same amount.
    return { ...base, p: md === 0 ? 1 : 0, statistic: md === 0 ? 0 : Infinity, ci95: [md, md], effect: md === 0 ? 0 : null };
  }
  const se = s / Math.sqrt(n);
  const t = md / se;
  const q = tQuantile(0.975, n - 1);
  return { ...base, p: tTwoSidedP(t, n - 1), statistic: t, ci95: [md - q * se, md + q * se], effect: md / s };
}

/** Number of subsets of {1..n} with each rank sum (for the exact Wilcoxon distribution). */
function signedRankCounts(n: number) {
  const max = (n * (n + 1)) / 2;
  let counts = new Array<number>(max + 1).fill(0);
  counts[0] = 1;
  for (let k = 1; k <= n; k++) {
    const next = counts.slice();
    for (let s = k; s <= max; s++) next[s] += counts[s - k];
    counts = next;
  }
  return counts;
}

/**
 * Wilcoxon signed-rank test (zero differences dropped). Exact when there are no ties/zeros and n ≤ 50;
 * exact by enumeration when there are ties/zeros and n ≤ 13; otherwise the normal approximation with
 * tie correction — the same choices as scipy.stats.wilcoxon(method='auto').
 */
export function wilcoxonSignedRank(a: number[], b: number[]): PairedResult | null {
  const all = a.map((x, i) => x - b[i]);
  const d = all.filter((x) => x !== 0);
  const n = d.length;
  const base = {
    n: a.length,
    meanA: a.length ? mean(a) : 0,
    meanB: b.length ? mean(b) : 0,
    meanDiff: a.length ? mean(all) : 0,
    df: null,
    ci95: null,
    effectLabel: 'rank-biserial r',
    method: 'Wilcoxon signed-rank'
  };
  if (a.length < 2) return null;
  if (n === 0) return { ...base, p: 1, statistic: null, statisticLabel: 'z', effect: 0 };
  const { ranks, ties } = rank(d.map(Math.abs));
  const wPlus = ranks.reduce((acc, r, i) => acc + (d[i] > 0 ? r : 0), 0);
  const total = (n * (n + 1)) / 2;
  const effect = (wPlus - (total - wPlus)) / total;
  if ((ties.length > 0 || n < a.length) && a.length <= 13) {
    // Ties or zero differences with a small sample: exact test by enumerating every sign pattern.
    let lower = 0;
    let upper = 0;
    const eps = 1e-9 * total;
    for (let mask = 0; mask < 1 << n; mask++) {
      let w = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) w += ranks[i];
      if (w <= wPlus + eps) lower++;
      if (w >= wPlus - eps) upper++;
    }
    const all2 = 2 ** n;
    return {
      ...base,
      p: Math.min(1, (2 * Math.min(lower, upper)) / all2),
      statistic: wPlus,
      statisticLabel: 'W+',
      effect,
      method: 'Wilcoxon signed-rank (exact, ties)'
    };
  }
  if (ties.length === 0 && n === a.length && n <= 50) {
    const counts = signedRankCounts(n);
    const totalCount = 2 ** n;
    const lower = counts.slice(0, Math.floor(wPlus) + 1).reduce((x, y) => x + y, 0) / totalCount;
    const upper = counts.slice(Math.ceil(wPlus)).reduce((x, y) => x + y, 0) / totalCount;
    return { ...base, p: Math.min(1, 2 * Math.min(lower, upper)), statistic: wPlus, statisticLabel: 'W+', effect, method: 'Wilcoxon signed-rank (exact)' };
  }
  const mu = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - ties.reduce((acc, t) => acc + (t ** 3 - t), 0) / 48;
  if (variance <= 0) return { ...base, p: 1, statistic: 0, statisticLabel: 'z', effect };
  const z = (wPlus - mu) / Math.sqrt(variance);
  return { ...base, p: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))), statistic: z, statisticLabel: 'z', effect, method: 'Wilcoxon signed-rank (normal approx.)' };
}

export interface OmnibusResult {
  n: number;
  k: number;
  statistic: number;
  statisticLabel: string;
  df: [number, number] | [number];
  p: number;
  effect: number | null;
  effectLabel: string;
  method: string;
  /** Greenhouse–Geisser epsilon and corrected p (repeated-measures ANOVA only). */
  epsilon?: number;
  pCorrected?: number;
}

/** One-way repeated-measures ANOVA on complete cases (rows = participants, columns = conditions). */
export function repeatedMeasuresAnova(m: number[][]): OmnibusResult | null {
  const n = m.length;
  const k = m[0]?.length ?? 0;
  if (n < 2 || k < 2) return null;
  const all = m.flat();
  const G = mean(all);
  const colMeans = Array.from({ length: k }, (_, j) => mean(m.map((r) => r[j])));
  const rowMeans = m.map(mean);
  const ssCond = n * colMeans.reduce((a, c) => a + (c - G) ** 2, 0);
  const ssSubj = k * rowMeans.reduce((a, r) => a + (r - G) ** 2, 0);
  const ssTotal = all.reduce((a, x) => a + (x - G) ** 2, 0);
  const ssErr = Math.max(0, ssTotal - ssCond - ssSubj);
  const df1 = k - 1;
  const df2 = (k - 1) * (n - 1);
  const base = { n, k, statisticLabel: 'F', df: [df1, df2] as [number, number], effectLabel: 'partial η²', method: 'Repeated-measures ANOVA' };
  if (ssErr < 1e-12) {
    return { ...base, statistic: ssCond < 1e-12 ? 0 : Infinity, p: ssCond < 1e-12 ? 1 : 0, effect: ssCond < 1e-12 ? 0 : 1 };
  }
  const F = ssCond / df1 / (ssErr / df2);
  const p = fSurvival(F, df1, df2);
  // Greenhouse–Geisser epsilon from the double-centred covariance matrix of the conditions.
  const cov = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => m.reduce((a, r) => a + (r[i] - colMeans[i]) * (r[j] - colMeans[j]), 0) / (n - 1))
  );
  const rowM = cov.map(mean);
  const gm = mean(rowM);
  const dc = cov.map((r, i) => r.map((v, j) => v - rowM[i] - rowM[j] + gm));
  const tr = dc.reduce((a, r, i) => a + r[i], 0);
  const sq = dc.flat().reduce((a, v) => a + v * v, 0);
  const epsilon = sq > 0 ? Math.min(1, Math.max(1 / df1, (tr * tr) / (df1 * sq))) : 1;
  return { ...base, statistic: F, p, effect: ssCond / (ssCond + ssErr), epsilon, pCorrected: fSurvival(F, df1 * epsilon, df2 * epsilon) };
}

/** Friedman test on complete cases (rank-based alternative to the RM ANOVA), with tie correction. */
export function friedman(m: number[][]): OmnibusResult | null {
  const n = m.length;
  const k = m[0]?.length ?? 0;
  if (n < 2 || k < 2) return null;
  const sums = new Array<number>(k).fill(0);
  let tieSum = 0;
  for (const row of m) {
    const { ranks, ties } = rank(row);
    ranks.forEach((r, j) => (sums[j] += r));
    tieSum += ties.reduce((a, t) => a + (t ** 3 - t), 0);
  }
  const chi = (12 / (n * k * (k + 1))) * sums.reduce((a, s) => a + s * s, 0) - 3 * n * (k + 1);
  const correction = 1 - tieSum / (n * (k ** 3 - k));
  const base = { n, k, statisticLabel: 'χ²', df: [k - 1] as [number], effectLabel: "Kendall's W", method: 'Friedman test' };
  if (correction <= 0) return { ...base, statistic: 0, p: 1, effect: 0 };
  const stat = chi / correction;
  return { ...base, statistic: stat, p: chi2Survival(stat, k - 1), effect: stat / (n * (k - 1)) };
}

/** Holm–Bonferroni adjusted p-values (same order as the input). */
export function holm(ps: number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(ps.length);
  let running = 0;
  order.forEach(([p, i], rankIdx) => {
    running = Math.max(running, Math.min(1, (ps.length - rankIdx) * p));
    out[i] = running;
  });
  return out;
}

export function bonferroni(ps: number[]): number[] {
  return ps.map((p) => Math.min(1, p * ps.length));
}

// ------------------------------------------------------------------ study-level analysis

export type Measure = 'corsi_span' | 'accuracy';
export type TestFamily = 'parametric' | 'nonparametric';
export type Correction = 'holm' | 'bonferroni' | 'none';

export interface PairComparison {
  a: Condition;
  b: Condition;
  result: PairedResult | null;
  pAdjusted: number | null;
}

export interface Analysis {
  measure: Measure;
  family: TestFamily;
  correction: Correction;
  conditions: Condition[];
  participants: number;
  completeCases: number;
  omnibus: OmnibusResult | null;
  pairs: PairComparison[];
}

/** Values per participant per condition for the chosen measure. */
function byParticipant(rows: ResultRow[], measure: Measure) {
  const map = new Map<string, Partial<Record<Condition, number>>>();
  for (const r of rows) {
    const v = measure === 'accuracy' ? r.accuracy : r.corsi_span;
    if (v == null || !Number.isFinite(Number(v))) continue;
    const entry = map.get(r.participant) ?? {};
    entry[r.condition] = Number(v);
    map.set(r.participant, entry);
  }
  return map;
}

/** Runs the omnibus test and every pairwise comparison for the selected conditions. */
export function analyse(
  rows: ResultRow[],
  opts: { measure: Measure; family: TestFamily; correction: Correction; conditions?: Condition[] }
): Analysis {
  const conditions = (opts.conditions ?? [...CONDITIONS]).filter((c) => CONDITIONS.includes(c));
  const people = byParticipant(rows, opts.measure);
  const complete = [...people.values()].filter((p) => conditions.every((c) => p[c] != null)).map((p) => conditions.map((c) => p[c]!));
  const omnibus =
    conditions.length >= 2 ? (opts.family === 'parametric' ? repeatedMeasuresAnova(complete) : friedman(complete)) : null;

  const pairs: PairComparison[] = [];
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const a = conditions[i];
      const b = conditions[j];
      const both = [...people.values()].filter((p) => p[a] != null && p[b] != null);
      const xs = both.map((p) => p[a]!);
      const ys = both.map((p) => p[b]!);
      pairs.push({ a, b, result: opts.family === 'parametric' ? pairedTTest(xs, ys) : wilcoxonSignedRank(xs, ys), pAdjusted: null });
    }
  }
  const tested = pairs.filter((p) => p.result);
  const raw = tested.map((p) => p.result!.p);
  const adjusted = opts.correction === 'holm' ? holm(raw) : opts.correction === 'bonferroni' ? bonferroni(raw) : raw;
  tested.forEach((p, i) => (p.pAdjusted = adjusted[i]));

  return {
    measure: opts.measure,
    family: opts.family,
    correction: opts.correction,
    conditions,
    participants: people.size,
    completeCases: complete.length,
    omnibus,
    pairs
  };
}

/** p-values for display: "< .001" style, never "0". */
export function formatP(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—';
  if (p < 0.001) return '< .001';
  if (p >= 0.995) return '1.00';
  return p < 0.01 ? p.toFixed(3).replace(/^0/, '') : p.toFixed(p < 0.1 ? 3 : 2).replace(/^0/, '');
}
