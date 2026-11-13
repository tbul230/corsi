'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toBlob, toPng } from 'html-to-image';
import { Alert, Spinner } from '@/components/ui';
import { CHARTS, DARK, LIGHT, type ChartPalette } from '@/components/charts/StudyCharts';
import type { ResultRow } from '@/lib/stats';
import { buildSummary, summaryCsv, summaryHtml, summaryTsv, SummaryTableView } from '@/components/charts/SummaryTable';

const TABLE_TITLE = 'Corsi span by break type: summary and significance tests';

const REFRESH_MS = 10_000;

type Data = { total_participants: number; sessions: ResultRow[]; generated_at: string };

function stamp(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Waits until the browser has painted the latest chart state (two animation frames). */
const painted = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Renders a chart frame to a PNG at 2× resolution. Buttons (class "no-export") are left out of the image. */
function renderOptions(p: ChartPalette) {
  return {
    pixelRatio: 2,
    backgroundColor: p.background,
    cacheBust: true,
    filter: (node: HTMLElement) => !(node.classList?.contains('no-export') || node.classList?.contains('recharts-tooltip-wrapper'))
  };
}

function footerText(data: { sessions: ResultRow[]; generated_at: string }, includeTest = false) {
  const rows = data.sessions;
  return `n = ${new Set(rows.map((r) => r.participant)).size} participants · ${rows.length} completed tests${includeTest ? ' · includes admin test runs' : ''} · ${new Date(data.generated_at).toLocaleString()}`;
}

export default function AdminCharts({ includeTest }: { includeTest: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<ChartPalette>(DARK);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const frames = useRef(new Map<string, HTMLDivElement>());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/results${includeTest ? '?include_test=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load the chart data.');
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(`${(err as Error).message} Retrying automatically…`);
    }
  }, [includeTest]);

  useEffect(() => {
    void load();
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  function note(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  async function download(id: string) {
    const el = frames.current.get(id);
    if (!el) return;
    setBusy(id);
    try {
      await painted();
      const url = await toPng(el, renderOptions(palette));
      const a = document.createElement('a');
      a.href = url;
      a.download = `corsi-${id}-${palette.name}-${stamp()}.png`;
      a.click();
    } catch {
      note('Could not create the image. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string) {
    const el = frames.current.get(id);
    if (!el) return;
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) {
      note('Copying images is not supported in this browser. Use PNG instead.');
      return;
    }
    setBusy(id);
    try {
      // The ClipboardItem must be created right away (Safari requires it inside the click); the image fills in after.
      const blob = painted().then(() => toBlob(el, renderOptions(palette))).then((b) => {
        if (!b) throw new Error('empty image');
        return b;
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      note('Image copied — paste it into Canva, your slides or a document.');
    } catch {
      note('Could not copy the image (your browser may have blocked clipboard access). Use PNG instead.');
    } finally {
      setBusy(null);
    }
  }

  /** Copies the summary as a real table (HTML) plus tab-separated text, so it pastes as an editable table. */
  async function copyTable() {
    if (!data) return;
    const s = buildSummary(data.sessions);
    const html = summaryHtml(s, TABLE_TITLE, footerText(data, includeTest));
    const text = summaryTsv(s, TABLE_TITLE, footerText(data, includeTest));
    try {
      if ('ClipboardItem' in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      note('Table copied — paste it into Google Slides, PowerPoint, Docs or Sheets as an editable table.');
    } catch {
      note('Could not copy the table (your browser may have blocked clipboard access). Use CSV instead.');
    }
  }

  function downloadCsv() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([summaryCsv(buildSummary(data.sessions))], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `corsi-summary-table-${stamp()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadAll() {
    setBusy('all');
    for (const c of [{ id: 'summary-table' }, ...CHARTS]) {
      // eslint-disable-next-line no-await-in-loop
      await download(c.id);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300)); // browsers throttle rapid multiple downloads
    }
    setBusy(null);
  }

  if (!data) return error ? <Alert>{error}</Alert> : <Spinner label="Loading charts…" />;

  const rows = data.sessions;
  const updated = new Date(data.generated_at).toLocaleTimeString();
  const footer = footerText(data, includeTest);
  const summary = buildSummary(rows);
  const btnBorder = { borderColor: palette.name === 'dark' ? 'rgba(255,255,255,0.2)' : '#cbd5e1' };

  return (
    <div className="space-y-5" data-testid="admin-charts">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-navy-900 p-3">
        <span className="flex items-center gap-2 px-1 text-sm" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          Live · updated {updated}
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-lg border border-line p-1 text-sm" role="group" aria-label="Image style">
          {[DARK, LIGHT].map((p) => (
            <button
              key={p.name}
              onClick={() => setPalette(p)}
              aria-pressed={palette.name === p.name}
              data-testid={`palette-${p.name}`}
              className={`rounded-md px-3 py-1 ${palette.name === p.name ? 'bg-navy-700 text-ink' : 'text-ink-3 hover:text-ink'}`}>
              {p.name === 'dark' ? 'Dark' : 'Light (print)'}
            </button>
          ))}
        </span>
        <button className="btn btn-primary text-sm" onClick={downloadAll} disabled={busy !== null || rows.length === 0} data-testid="download-all">
          {busy === 'all' ? 'Preparing…' : 'Download all as PNG'}
        </button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {flash ? <Alert tone="info">{flash}</Alert> : null}

      {rows.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-lg font-semibold">No completed tests yet</p>
          <p className="mt-1 text-sm muted">The charts appear here automatically as soon as the first participant finishes.</p>
        </div>
      ) : (
        <>
        <div
          ref={(el) => {
            if (el) frames.current.set('summary-table', el);
            else frames.current.delete('summary-table');
          }}
          data-testid="admin-summary-table"
          className="rounded-2xl border p-5 sm:p-6"
          style={{ background: palette.background, color: palette.text, borderColor: palette.name === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{TABLE_TITLE}</h3>
              <p className="mt-0.5 text-xs" style={{ color: palette.muted }}>
                Pairwise comparisons are paired t-tests on participants who completed both breaks, Holm-adjusted for three comparisons.
              </p>
            </div>
            <div className="no-export flex shrink-0 flex-wrap gap-1.5">
              <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: '#3b82f6' }} onClick={copyTable} data-testid="copy-table">
                Copy table
              </button>
              <button className="rounded-lg border px-2.5 py-1 text-xs font-medium" style={btnBorder} onClick={() => copy('summary-table')} disabled={busy !== null} data-testid="copy-table-image">
                Copy image
              </button>
              <button className="rounded-lg border px-2.5 py-1 text-xs font-medium" style={btnBorder} onClick={() => download('summary-table')} disabled={busy !== null} data-testid="download-summary-table">
                {busy === 'summary-table' ? '…' : 'PNG'}
              </button>
              <button className="rounded-lg border px-2.5 py-1 text-xs font-medium" style={btnBorder} onClick={downloadCsv} data-testid="download-table-csv">
                CSV
              </button>
            </div>
          </div>
          <div className="mt-4">
            <SummaryTableView s={summary} palette={palette} />
          </div>
          <p className="mt-3 text-[11px]" style={{ color: palette.muted }}>
            {footer}
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {CHARTS.map(({ id, title, caption, Chart, wide }) => (
            <div
              key={id}
              ref={(el) => {
                if (el) frames.current.set(id, el);
                else frames.current.delete(id);
              }}
              data-testid={`admin-chart-${id}`}
              className={`rounded-2xl border p-5 sm:p-6 ${wide ? 'lg:col-span-2' : ''}`}
              style={{ background: palette.background, color: palette.text, borderColor: palette.name === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-0.5 text-xs" style={{ color: palette.muted }}>
                    {caption}
                  </p>
                </div>
                <div className="no-export flex shrink-0 gap-1.5">
                  <button
                    className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                    style={{ borderColor: palette.name === 'dark' ? 'rgba(255,255,255,0.2)' : '#cbd5e1' }}
                    onClick={() => copy(id)}
                    disabled={busy !== null}>
                    Copy
                  </button>
                  <button
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ background: '#3b82f6' }}
                    onClick={() => download(id)}
                    disabled={busy !== null}
                    data-testid={`download-${id}`}>
                    {busy === id ? '…' : 'PNG'}
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <Chart rows={rows} palette={palette} animate={false} />
              </div>
              <p className="mt-3 text-[11px]" style={{ color: palette.muted }}>
                {footer}
              </p>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
