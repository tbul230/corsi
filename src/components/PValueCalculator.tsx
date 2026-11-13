'use client';

import { useMemo, useState } from 'react';
import { CONDITION_INFO, type Condition } from '@/lib/constants';
import {
  analyse,
  formatP,
  type Correction,
  type Measure,
  type OmnibusResult,
  type PairComparison,
  type TestFamily
} from '@/lib/inference';
import type { ResultRow } from '@/lib/stats';

const ALPHAS = [0.1, 0.05, 0.01] as const;
const UNIT: Record<Measure, string> = { corsi_span: 'blocks', accuracy: 'percentage points' };
/** The measure inside a sentence ("Corsi span" is a name, so it keeps its capital). */
const inSentence = (m: Measure) => (m === 'corsi_span' ? 'Corsi span' : 'accuracy');

const fmt = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const alphaText = (a: number) => String(a).replace(/^0/, '');

function sizeWord(value: number | null, label: string) {
  if (value == null) return '';
  const v = Math.abs(value);
  const cut =
    label === "Cohen's dz" ? [0.2, 0.5, 0.8] : label === 'partial η²' ? [0.01, 0.06, 0.14] : label === "Kendall's W" ? [0.1, 0.3, 0.5] : [0.1, 0.3, 0.5];
  return v < cut[0] ? 'negligible' : v < cut[1] ? 'small' : v < cut[2] ? 'medium' : 'large';
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-3">{label}</p>
      <div className="flex rounded-lg border border-line p-0.5 text-sm" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${value === v ? 'bg-white/12 font-medium text-ink' : 'text-ink-3 hover:text-ink'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Where p falls on a log scale from 1 down to .0001, with the α threshold marked. */
function PMeter({ p, alpha }: { p: number; alpha: number }) {
  const pos = (x: number) => Math.min(100, Math.max(0, (-Math.log10(Math.max(x, 1e-4)) / 4) * 100));
  const sig = p < alpha;
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2 rounded-full bg-white/8">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${sig ? 'bg-emerald-400' : 'bg-white/30'}`}
          style={{ width: `${pos(p)}%` }}
        />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-amber-300" style={{ left: `${pos(alpha)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>p = 1</span>
        <span style={{ marginLeft: `${pos(alpha) - 50}%` }} className="text-amber-200">
          α = {alphaText(alpha)}
        </span>
        <span>.0001</span>
      </div>
    </div>
  );
}

function Verdict({ p, alpha }: { p: number | null; alpha: number }) {
  if (p == null) return <span className="rounded-md bg-white/6 px-2 py-0.5 text-xs text-ink-3">Not enough data</span>;
  return p < alpha ? (
    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Significant</span>
  ) : (
    <span className="rounded-md bg-white/8 px-2 py-0.5 text-xs font-medium text-ink-2">Not significant</span>
  );
}

function Dot({ c }: { c: Condition }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONDITION_INFO[c].accent }} />;
}

function OmnibusCard({ o, alpha, family, measure, k }: { o: OmnibusResult | null; alpha: number; family: TestFamily; measure: Measure; k: number }) {
  const useGG = o?.epsilon != null && o.epsilon < 0.999 && o.pCorrected != null;
  const p = o ? (useGG ? o.pCorrected! : o.p) : null;
  const df = o ? (o.df.length === 2 ? `(${fmt(o.df[0] * (useGG ? o.epsilon! : 1), useGG ? 2 : 0)}, ${fmt(o.df[1] * (useGG ? o.epsilon! : 1), useGG ? 2 : 0)})` : `(${o.df[0]})`) : '';
  return (
    <div className="glass-soft rounded-xl p-4 sm:p-5" data-testid="pcalc-omnibus">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Does break type make any difference overall?</p>
        <Verdict p={p} alpha={alpha} />
      </div>
      {o && p != null ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-3xl font-semibold tabular-nums" data-testid="pcalc-omnibus-p">
              p {formatP(p).startsWith('<') ? formatP(p) : `= ${formatP(p)}`}
            </p>
            <p className="text-sm text-ink-2 tabular-nums">
              {o.method}: {o.statisticLabel}
              {df} = {fmt(o.statistic)} · {o.effectLabel} = {fmt(o.effect)} ({sizeWord(o.effect, o.effectLabel)}) · n = {o.n}
            </p>
          </div>
          <PMeter p={p} alpha={alpha} />
          <p className="mt-3 text-sm text-ink-2">
            {p < alpha
              ? `Across the ${o.n} participants who finished ${k === 3 ? 'all three breaks' : 'these breaks'}, ${inSentence(measure)} differs by break type more than chance alone would usually produce (p < ${alphaText(alpha)}). The comparisons below show which breaks differ.`
              : `Across the ${o.n} participants who finished ${k === 3 ? 'all three breaks' : 'these breaks'}, there is no clear evidence yet that break type changes ${inSentence(measure)} (p ≥ ${alphaText(alpha)}). That is not proof of no effect — it may need more participants.`}
            {useGG ? ` Greenhouse–Geisser sphericity correction applied (ε = ${fmt(o.epsilon)}).` : ''}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-3">
          Needs at least 2 participants who completed {k === 3 ? 'all three breaks' : 'every selected break'}.
          {family === 'parametric' ? ' (Repeated-measures ANOVA)' : ' (Friedman test)'}
        </p>
      )}
    </div>
  );
}

function PairCard({ pair, alpha, measure, correction }: { pair: PairComparison; alpha: number; measure: Measure; correction: Correction }) {
  const r = pair.result;
  const p = pair.pAdjusted;
  const A = CONDITION_INFO[pair.a].short;
  const B = CONDITION_INFO[pair.b].short;
  const unit = UNIT[measure];
  return (
    <div className="glass-soft flex flex-col rounded-xl p-4 sm:p-5" data-testid={`pcalc-${pair.a}-${pair.b}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
          <Dot c={pair.a} /> {A} <span className="font-normal text-ink-3">vs</span> <Dot c={pair.b} /> {B}
        </p>
        <Verdict p={p} alpha={alpha} />
      </div>
      {r && p != null ? (
        <>
          <p className="mt-3 text-3xl font-semibold tabular-nums" data-testid="pcalc-p">
            p {formatP(p).startsWith('<') ? formatP(p) : `= ${formatP(p)}`}
          </p>
          <p className="text-xs text-ink-3">
            {correction === 'none' ? 'unadjusted' : `${correction === 'holm' ? 'Holm' : 'Bonferroni'}-adjusted · raw p = ${formatP(r.p)}`}
          </p>
          <PMeter p={p} alpha={alpha} />
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-ink-3">Mean {A}</dt>
            <dd className="text-right tabular-nums">{fmt(r.meanA)}</dd>
            <dt className="text-ink-3">Mean {B}</dt>
            <dd className="text-right tabular-nums">{fmt(r.meanB)}</dd>
            <dt className="text-ink-3">Difference</dt>
            <dd className="text-right tabular-nums">
              {r.meanDiff > 0 ? '+' : ''}
              {fmt(r.meanDiff)}
              {r.ci95 ? <span className="block text-xs text-ink-3">95% CI {fmt(r.ci95[0])} to {fmt(r.ci95[1])}</span> : null}
            </dd>
            <dt className="text-ink-3">{r.method.startsWith('Paired') ? `t(${r.df})` : r.statisticLabel}</dt>
            <dd className="text-right tabular-nums">{r.statistic == null ? '—' : fmt(r.statistic)}</dd>
            <dt className="text-ink-3">{r.effectLabel}</dt>
            <dd className="text-right tabular-nums">
              {fmt(r.effect)} <span className="text-xs text-ink-3">{sizeWord(r.effect, r.effectLabel)}</span>
            </dd>
            <dt className="text-ink-3">Participants paired</dt>
            <dd className="text-right tabular-nums">{r.n}</dd>
          </dl>
          <p className="mt-3 text-sm text-ink-2">
            {Math.abs(r.meanDiff) < 1e-9
              ? `On average, ${A} and ${B} gave the same ${inSentence(measure)}.`
              : `On average, ${inSentence(measure)} was ${fmt(Math.abs(r.meanDiff))} ${unit} ${r.meanDiff > 0 ? 'higher' : 'lower'} after ${A} than after ${B}.`}{' '}
            {p < alpha
              ? `A difference this large would be unlikely if break type had no effect (p < ${alphaText(alpha)}).`
              : `This could easily be chance (p ≥ ${alphaText(alpha)}).`}
          </p>
          {r.n < 10 ? <p className="mt-2 text-xs text-amber-200">Small sample (n = {r.n}): treat this result with caution.</p> : null}
          <p className="mt-auto pt-3 text-[11px] text-ink-3">{r.method}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-3">
          Needs at least 2 participants who completed both {A} and {B} (currently {r?.n ?? 'fewer than 2'}).
        </p>
      )}
    </div>
  );
}

/** Live significance tests for every pair of breaks, recalculated whenever the results refresh. */
export default function PValueCalculator({ rows, conditions }: { rows: ResultRow[]; conditions: Condition[] }) {
  const [measure, setMeasure] = useState<Measure>('corsi_span');
  const [family, setFamily] = useState<TestFamily>('parametric');
  const [correction, setCorrection] = useState<Correction>('holm');
  const [alpha, setAlpha] = useState<number>(0.05);

  const a = useMemo(() => analyse(rows, { measure, family, correction, conditions }), [rows, measure, family, correction, conditions]);

  return (
    <section className="glass rounded-2xl p-5 sm:p-6" data-testid="pvalue-calculator">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Live p-value calculator</h3>
          <p className="mt-0.5 max-w-3xl text-xs muted">
            Tests whether the differences between breaks are bigger than chance. Because everyone does every break, each test
            compares the <em>same</em> participants across two breaks (paired). Recalculated automatically with every new result.
          </p>
        </div>
        <p className="text-xs text-ink-3 tabular-nums">
          {a.participants} participants with results · {a.completeCases} completed {a.conditions.length === 3 ? 'all three' : 'all selected'}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Segmented label="Measure" value={measure} onChange={setMeasure} options={[['corsi_span', 'Corsi span'], ['accuracy', 'Accuracy']]} />
        <Segmented
          label="Test"
          value={family}
          onChange={setFamily}
          options={[['parametric', 'Paired t-test'], ['nonparametric', 'Wilcoxon (ranks)']]}
        />
        <Segmented
          label="Multiple-comparison correction"
          value={correction}
          onChange={setCorrection}
          options={[['holm', 'Holm'], ['bonferroni', 'Bonferroni'], ['none', 'None']]}
        />
        <Segmented label="Significance level (α)" value={alpha} onChange={setAlpha} options={ALPHAS.map((x) => [x, alphaText(x)] as const)} />
      </div>

      <div className="mt-5 space-y-4">
        {a.conditions.length >= 2 ? (
          <OmnibusCard o={a.omnibus} alpha={alpha} family={family} measure={measure} k={a.conditions.length} />
        ) : (
          <p className="text-sm text-ink-3">Select at least two break types (above the charts) to compare them.</p>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          {a.pairs.map((pair) => (
            <PairCard key={`${pair.a}-${pair.b}`} pair={pair} alpha={alpha} measure={measure} correction={correction} />
          ))}
        </div>
      </div>

      <details className="mt-5 text-sm text-ink-2">
        <summary className="cursor-pointer text-ink">How to read this</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>p-value</strong>: if break type truly made no difference, how often would we see a difference at least this big
            just by chance? Below α (usually .05) is called &quot;significant&quot;.
          </li>
          <li>
            <strong>Paired t-test</strong> compares the average within-person difference. <strong>Wilcoxon</strong> uses ranks instead,
            which is safer for small samples and whole-number scores like Corsi span.
          </li>
          <li>
            Three comparisons at once raise the chance of a false alarm, so p-values are <strong>Holm-adjusted</strong> by default.
          </li>
          <li>
            The overall test is a repeated-measures ANOVA (or Friedman test), run on participants who finished every selected break.
          </li>
          <li>
            &quot;Not significant&quot; does not mean &quot;no effect&quot; — small samples can miss real differences. Effect sizes show how big
            a difference is, separately from whether it is significant. Practice effects (see the completion-order chart) can also
            affect results.
          </li>
        </ul>
      </details>
    </section>
  );
}
