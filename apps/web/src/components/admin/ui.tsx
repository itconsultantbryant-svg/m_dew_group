'use client';

import { useRelativeTime } from '@/lib/use-live';

export function LiveBar({
  updatedAt,
  live,
  onToggle,
  onRefresh,
  error,
}: {
  updatedAt: number | null;
  live: boolean;
  onToggle: (value: boolean) => void;
  onRefresh: () => void;
  error?: string | null;
}) {
  const relative = useRelativeTime(updatedAt);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-forest-900/10 bg-white px-4 py-2 text-sm">
      <button
        type="button"
        onClick={() => onToggle(!live)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
          live ? 'bg-success-surface text-success' : 'bg-charcoal-800/5 text-charcoal-600'
        }`}
        aria-pressed={live}
      >
        <span className="relative flex h-2 w-2">
          {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /> : null}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-success' : 'bg-charcoal-500'}`} />
        </span>
        {live ? 'Live' : 'Paused'}
      </button>
      <span className="text-charcoal-500">Updated {relative}</span>
      {error ? <span className="font-medium text-danger">{error}</span> : null}
      <button type="button" onClick={onRefresh} className="ml-auto rounded-md border border-forest-900/20 px-3 py-1 text-xs font-semibold text-forest-900 hover:bg-forest-900/5">
        Refresh now
      </button>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const tones: Record<string, string> = {
    default: 'text-forest-900',
    positive: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  };
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-charcoal-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-charcoal-500">{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-forest-900">{title}</h2>
          {subtitle ? <p className="text-xs text-charcoal-500">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-charcoal-500">{children}</p>;
}
