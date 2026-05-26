export function KpiCard({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: 'brand' | 'amber' | 'neutral';
}) {
  const ring =
    highlight === 'brand'
      ? 'border-brand/40 bg-brand-surface'
      : highlight === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-border bg-card';
  const valueColor =
    highlight === 'brand'
      ? 'text-brand'
      : highlight === 'amber'
        ? 'text-amber-900'
        : 'text-foreground';

  return (
    <div className={`rounded-xl border p-4 shadow-sm transition-colors ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-xl font-bold tabular-nums sm:text-2xl ${valueColor}`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-xs font-medium text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}
