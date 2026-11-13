'use client';

import { CONDITIONS, CONDITION_INFO } from '@/lib/constants';
import { analyse, formatP } from '@/lib/inference';
import type { ResultRow } from '@/lib/stats';
import type { ChartPalette } from './StudyCharts';

export interface SummaryTables {
  breaks: string[][];
  comparisons: string[][];
  overall: string;
}

const f = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));

function stats(values: number[]) {
  if (!values.length) return { n: 0, mean: null, sd: null, median: null, max: null };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : null;
  const s = [...values].sort((a, b) => a - b);
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, mean, sd, median, max: s[n - 1] };
}

/** The two presentation tables (per break, and pairwise significance), as plain text cells. */
export function buildSummary(rows: ResultRow[]): SummaryTables {
  const breaks: string[][] = [['Break', 'Tests (n)', 'Mean span (SD)', 'Median span', 'Highest span', 'Mean accuracy % (SD)']];
  for (const c of CONDITIONS) {
    const r = rows.filter((x) => x.condition === c);
    const span = stats(r.map((x) => Number(x.corsi_span)));
    const acc = stats(r.filter((x) => x.accuracy != null).map((x) => Number(x.accuracy)));
    breaks.push([
      CONDITION_INFO[c].title,
      String(span.n),
      span.n ? `${f(span.mean)} (${f(span.sd)})` : '—',
      span.n ? f(span.median, span.median! % 1 ? 1 : 0) : '—',
      span.n ? String(span.max) : '—',
      acc.n ? `${f(acc.mean, 1)} (${f(acc.sd, 1)})` : '—'
    ]);
  }

  const a = analyse(rows, { measure: 'corsi_span', family: 'parametric', correction: 'holm' });
  const comparisons: string[][] = [['Comparison (Corsi span)', 'Pairs (n)', 'Mean difference [95% CI]', 't (df)', 'p (Holm)', "Cohen's dz", 'Significant (α = .05)']];
  for (const p of a.pairs) {
    const r = p.result;
    comparisons.push([
      `${CONDITION_INFO[p.a].short} vs ${CONDITION_INFO[p.b].short}`,
      String(r?.n ?? 0),
      r?.ci95 ? `${r.meanDiff > 0 ? '+' : ''}${f(r.meanDiff)} [${f(r.ci95[0])}, ${f(r.ci95[1])}]` : '—',
      r && r.statistic != null ? `${f(r.statistic)} (${r.df})` : '—',
      p.pAdjusted != null ? formatP(p.pAdjusted) : '—',
      r ? f(r.effect) : '—',
      p.pAdjusted == null ? 'Not enough data' : p.pAdjusted < 0.05 ? 'Yes' : 'No'
    ]);
  }

  const o = a.omnibus;
  const gg = o?.epsilon != null && o.epsilon < 0.999 && o.pCorrected != null;
  const overall = o
    ? `Overall (repeated-measures ANOVA, n = ${o.n} who completed all three): F(${gg ? `${f(o.df[0] * o.epsilon!)}, ${f((o.df[1] ?? 0) * o.epsilon!)}` : `${o.df[0]}, ${o.df[1]}`}) = ${f(o.statistic)}, p = ${formatP(gg ? o.pCorrected : o.p)}${gg ? ' (Greenhouse–Geisser corrected)' : ''}, partial η² = ${f(o.effect)}.`
    : 'Overall test: needs at least 2 participants who completed all three breaks.';

  return { breaks, comparisons, overall };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** HTML for pasting as a real, editable table (Google Slides/Docs, PowerPoint, Word, Sheets, Excel). */
export function summaryHtml(s: SummaryTables, title: string, footer: string) {
  const table = (rows: string[][]) =>
    `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt">` +
    rows
      .map(
        (r, i) =>
          `<tr>${r
            .map((cell, j) =>
              i === 0
                ? `<th style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9;text-align:${j ? 'right' : 'left'}">${esc(cell)}</th>`
                : `<td style="border:1px solid #cbd5e1;padding:4px 8px;text-align:${j ? 'right' : 'left'}">${esc(cell)}</td>`
            )
            .join('')}</tr>`
      )
      .join('') +
    `</table>`;
  const font = 'font-family:Arial,sans-serif';
  return `<meta charset="utf-8"><p style="${font};font-size:13pt"><b>${esc(title)}</b></p>${table(s.breaks)}<br>${table(s.comparisons)}<p style="${font};font-size:11pt">${esc(s.overall)}</p><p style="${font};color:#64748b;font-size:9pt">${esc(footer)}</p>`;
}

/** Tab-separated text (pastes into cells in Sheets/Excel, and as text anywhere else). */
export function summaryTsv(s: SummaryTables, title: string, footer: string) {
  const t = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n');
  return `${title}\n\n${t(s.breaks)}\n\n${t(s.comparisons)}\n\n${s.overall}\n${footer}`;
}

export function summaryCsv(s: SummaryTables) {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const t = (rows: string[][]) => rows.map((r) => r.map(q).join(',')).join('\n');
  return `${t(s.breaks)}\n\n${t(s.comparisons)}\n\n${q(s.overall)}\n`;
}

/** On-screen / image version of the tables, styled with the chart palette. */
export function SummaryTableView({ s, palette: p }: { s: SummaryTables; palette: ChartPalette }) {
  const border = p.name === 'dark' ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const head = p.name === 'dark' ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const T = ({ rows, testId }: { rows: string[][]; testId: string }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm tabular-nums" data-testid={testId}>
        <thead>
          <tr style={{ background: head }}>
            {rows[0].map((h, j) => (
              <th key={h} className={`px-3 py-2 font-semibold ${j ? 'text-right' : 'text-left'}`} style={{ borderBottom: `1px solid ${border}`, color: p.text }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r) => (
            <tr key={r[0]}>
              {r.map((cell, j) => {
                const condition = j === 0 ? CONDITIONS.find((c) => CONDITION_INFO[c].title === cell) : undefined;
                const yes = cell === 'Yes';
                return (
                  <td
                    key={j}
                    className={`px-3 py-2 ${j ? 'text-right' : 'text-left font-medium'}`}
                    style={{ borderBottom: `1px solid ${border}`, color: yes ? (p.name === 'dark' ? '#6ee7b7' : '#047857') : p.text, fontWeight: yes ? 700 : undefined }}>
                    {condition ? <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONDITION_INFO[condition].accent }} /> : null}
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      <T rows={s.breaks} testId="summary-breaks" />
      <T rows={s.comparisons} testId="summary-comparisons" />
      <p className="text-sm" style={{ color: p.text }}>
        {s.overall}
      </p>
    </div>
  );
}
