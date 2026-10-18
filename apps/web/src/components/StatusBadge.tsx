const TONES: Record<string, string> = {
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
  info: 'bg-info-surface text-info',
  neutral: 'bg-charcoal-800/5 text-charcoal-700',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone] ?? TONES.neutral}`}>
      {label}
    </span>
  );
}
