import type { ReactNode } from 'react';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-[28px] p-6 sm:p-8 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">{children}</p>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass-soft rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wider muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs muted">{hint}</p> : null}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const styles = {
    error: 'border-red-300/30 bg-red-400/10 text-red-100',
    info: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
    success: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      {label}
    </div>
  );
}

export function StatusPill({ status }: { status: 'completed' | 'in_progress' | 'not_started' }) {
  const map = {
    completed: ['Completed', 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30'],
    in_progress: ['In progress', 'bg-amber-400/15 text-amber-100 border-amber-300/30'],
    not_started: ['Not started', 'bg-white/5 text-white/60 border-white/15']
  } as const;
  const [label, cls] = map[status];
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
