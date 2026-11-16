'use client';

import { CONDITIONS, CONDITION_INFO } from '@/lib/constants';
import { breakSummaries, pairSummaries, pText, P_CUTOFF } from '@/lib/simple-results';
import type { ResultRow } from '@/lib/stats';
import type { ChartPalette } from './StudyCharts';

export interface SummaryTables {
  breaksTitle: string;
  breaks: string[][];
  comparisonsTitle: string;
  comparisons: string[][];
  note: string;
}

/** Two simple tables for a class presentation. Score = how many blocks a student remembered (Corsi span). */
export function buildSummary(rows: ResultRow[]): SummaryTables {
  const breaks: string[][] = [['Break', 'Students tested', 'Average score', 'Highest score']];
  for (const b of breakSummaries(rows)) breaks.push([b.name, String(b.students), b.average, b.highest]);

  const comparisons: string[][] = [['Breaks compared', 'Which did better?', 'p-value', 'Real difference?']];
  for (const p of pairSummaries(rows)) comparisons.push([p.label, p.better, pText(p.p), p.p == null ? 'Not enough data yet' : p.real ? 'Yes' : 'No, could be luck']);

  return {
    breaksTitle: 'Average score after each break',
    breaks,
    comparisonsTitle: 'Is the difference real, or just luck?',
    comparisons,
    note: `Score = how many blocks in a row a student remembered. If the p-value is less than ${P_CUTOFF}, the difference is probably real and not just luck.`
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** HTML for pasting as a real, editable table (Google Slides/Docs, PowerPoint, Word, Sheets, Excel). */
export function summaryHtml(s: SummaryTables, footer: string) {
  const font = 'font-family:Arial,sans-serif';
  const table = (rows: string[][]) =>
    `<table style="border-collapse:collapse;${font};font-size:12pt">` +
    rows
      .map(
        (r, i) =>
          `<tr>${r
            .map((cell, j) =>
              i === 0
                ? `<th style="border:1px solid #cbd5e1;padding:6px 10px;background:#f1f5f9;text-align:${j ? 'center' : 'left'}">${esc(cell)}</th>`
                : `<td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:${j ? 'center' : 'left'}">${esc(cell)}</td>`
            )
            .join('')}</tr>`
      )
      .join('') +
    `</table>`;
  return (
    `<meta charset="utf-8">` +
    `<p style="${font};font-size:14pt"><b>${esc(s.breaksTitle)}</b></p>${table(s.breaks)}` +
    `<p style="${font};font-size:14pt"><b>${esc(s.comparisonsTitle)}</b></p>${table(s.comparisons)}` +
    `<p style="${font};font-size:11pt">${esc(s.note)}</p><p style="${font};color:#64748b;font-size:9pt">${esc(footer)}</p>`
  );
}

/** Tab-separated text (pastes into cells in Sheets/Excel, and as text anywhere else). */
export function summaryTsv(s: SummaryTables, footer: string) {
  const t = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n');
  return `${s.breaksTitle}\n${t(s.breaks)}\n\n${s.comparisonsTitle}\n${t(s.comparisons)}\n\n${s.note}\n${footer}`;
}

export function summaryCsv(s: SummaryTables) {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const t = (rows: string[][]) => rows.map((r) => r.map(q).join(',')).join('\n');
  return `${q(s.breaksTitle)}\n${t(s.breaks)}\n\n${q(s.comparisonsTitle)}\n${t(s.comparisons)}\n\n${q(s.note)}\n`;
}

/** On-screen / picture version of the tables, styled with the chart palette. */
export function SummaryTableView({ s, palette: p }: { s: SummaryTables; palette: ChartPalette }) {
  const border = p.name === 'dark' ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const head = p.name === 'dark' ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const good = p.name === 'dark' ? '#6ee7b7' : '#047857';
  const T = ({ title, rows, testId }: { title: string; rows: string[][]; testId: string }) => (
    <div>
      <p className="mb-2 text-base font-semibold" style={{ color: p.text }}>
        {title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[15px] tabular-nums" data-testid={testId}>
          <thead>
            <tr style={{ background: head }}>
              {rows[0].map((h, j) => (
                <th key={h} className={`px-3 py-2.5 font-semibold ${j ? 'text-center' : 'text-left'}`} style={{ borderBottom: `1px solid ${border}`, color: p.text }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r) => (
              <tr key={r[0]}>
                {r.map((cell, j) => {
                  const condition = j === 0 ? CONDITIONS.find((c) => CONDITION_INFO[c].short === cell) : undefined;
                  const yes = cell === 'Yes';
                  return (
                    <td
                      key={j}
                      className={`px-3 py-2.5 ${j ? 'text-center' : 'text-left font-medium'}`}
                      style={{ borderBottom: `1px solid ${border}`, color: yes ? good : p.text, fontWeight: yes ? 700 : undefined }}>
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
    </div>
  );
  return (
    <div className="space-y-5">
      <T title={s.breaksTitle} rows={s.breaks} testId="summary-breaks" />
      <T title={s.comparisonsTitle} rows={s.comparisons} testId="summary-comparisons" />
      <p className="text-sm" style={{ color: p.text }}>
        {s.note}
      </p>
    </div>
  );
}
