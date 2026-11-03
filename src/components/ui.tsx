import type { ReactNode } from 'react';

/** Page container: fluid up to 1440px so laptops and large screens use the full width. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-1.5 text-[1.65rem] font-semibold sm:text-3xl lg:text-[2.1rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-5 sm:p-6 lg:p-7 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-accent">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass-soft rounded-xl p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const styles = {
    error: 'border-red-400/30 bg-red-500/10 text-red-100',
    info: 'border-accent/30 bg-accent/10 text-sky-100',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-2" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white" />
      {label}
    </div>
  );
}

export function StatusPill({ status }: { status: 'completed' | 'in_progress' | 'not_started' }) {
  const map = {
    completed: ['Completed', 'bg-emerald-500/12 text-emerald-300'],
    in_progress: ['In progress', 'bg-amber-400/12 text-amber-200'],
    not_started: ['Not started', 'bg-white/5 text-ink-3']
  } as const;
  const [label, cls] = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
