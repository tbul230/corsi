import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyse,
  chi2Survival,
  fSurvival,
  formatP,
  friedman,
  holm,
  pairedTTest,
  repeatedMeasuresAnova,
  tQuantile,
  tTwoSidedP,
  wilcoxonSignedRank
} from '../src/lib/inference.ts';

// Reference values computed with SciPy 1.x (ttest_rel, wilcoxon, friedmanchisquare) and pingouin rm_anova.
type Ref = {
  name: string;
  m: number[][];
  pairs: { i: number; j: number; t: number; p_t: number; ci: [number, number]; dz: number; p_w: number }[];
  omni: { F: number; p: number; eps: number; p_gg: number; chi: number; p_fr: number };
};
const refs: Ref[] = JSON.parse(readFileSync(new URL('./inference-reference.json', import.meta.url), 'utf8'));
const close = (got: number, want: number, tol: number, what: string) =>
  assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want}`);

test('distribution functions match SciPy', () => {
  close(tTwoSidedP(2.0, 10), 0.07338803477074037, 1e-9, 't p');
  close(fSurvival(4.1, 2, 10), 0.050077548481083874, 1e-9, 'F p');
  close(chi2Survival(3.3, 1), 0.06927988322120171, 1e-7, 'chi2 p');
  close(tQuantile(0.975, 4), 2.7764451051977934, 1e-6, 't quantile');
});

for (const r of refs) {
  test(`paired tests match SciPy (${r.name})`, () => {
    for (const p of r.pairs) {
      const a = r.m.map((row) => row[p.i]);
      const b = r.m.map((row) => row[p.j]);
      const t = pairedTTest(a, b)!;
      close(t.statistic!, p.t, 1e-9, 't');
      close(t.p, p.p_t, 1e-9, 'p (t)');
      close(t.ci95![0], p.ci[0], 1e-6, 'CI low');
      close(t.ci95![1], p.ci[1], 1e-6, 'CI high');
      close(t.effect!, p.dz, 1e-9, 'dz');
      close(wilcoxonSignedRank(a, b)!.p, p.p_w, 1e-6, 'p (Wilcoxon)');
    }
  });
  test(`omnibus tests match pingouin/SciPy (${r.name})`, () => {
    const aov = repeatedMeasuresAnova(r.m)!;
    close(aov.statistic, r.omni.F, 1e-9, 'F');
    close(aov.p, r.omni.p, 1e-9, 'p (ANOVA)');
    close(aov.epsilon!, r.omni.eps, 1e-9, 'GG epsilon');
    close(aov.pCorrected!, r.omni.p_gg, 1e-9, 'p (GG)');
    const fr = friedman(r.m)!;
    close(fr.statistic, r.omni.chi, 1e-9, 'Friedman chi2');
    close(fr.p, r.omni.p_fr, 1e-9, 'p (Friedman)');
  });
}

test('Holm adjustment', () => {
  assert.deepEqual(holm([0.01, 0.04, 0.03]).map((x) => +x.toFixed(4)), [0.03, 0.06, 0.06]);
});

test('analyse pairs participants and skips incomplete pairs', () => {
  const rows = [
    { participant: '#1', condition: 'video_game', condition_order: 1, corsi_span: 6, accuracy: 70 },
    { participant: '#1', condition: 'youtube', condition_order: 2, corsi_span: 5, accuracy: 60 },
    { participant: '#2', condition: 'video_game', condition_order: 1, corsi_span: 7, accuracy: 75 },
    { participant: '#2', condition: 'youtube', condition_order: 2, corsi_span: 5, accuracy: 55 },
    { participant: '#3', condition: 'video_game', condition_order: 1, corsi_span: 5, accuracy: 65 }
  ] as const;
  const a = analyse([...rows], { measure: 'corsi_span', family: 'parametric', correction: 'none' });
  const vgYt = a.pairs.find((p) => p.a === 'video_game' && p.b === 'youtube')!;
  assert.equal(vgYt.result!.n, 2);
  assert.equal(a.completeCases, 0);
  assert.equal(a.pairs.find((p) => p.b === 'no_screen')!.result, null);
});

test('formatP never shows 0', () => {
  assert.equal(formatP(0), '< .001');
  assert.equal(formatP(0.0432), '.043');
  assert.equal(formatP(0.25), '.25');
});
