'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

// Trip-counts-per-time-bucket chart. Server passes the per-day rollup; this
// component bucketises into month/quarter on demand.

export type DailyCount = { dateIso: string; count: number };

type Granularity = 'day' | 'month' | 'quarter';

const FORMATTERS: Record<Granularity, (d: Date) => string> = {
  day: new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
  }).format,
  month: new Intl.DateTimeFormat('en-KE', { month: 'short', year: '2-digit' })
    .format,
  quarter: (d: Date) =>
    `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(-2)}`,
};

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === 'day') return date.toISOString().slice(0, 10);
  if (granularity === 'month') return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3)}`;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  if (granularity === 'day') {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  const qStart = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStart, 1);
}

export function BusiestChart({ daily }: { daily: DailyCount[] }) {
  const [granularity, setGranularity] = useState<Granularity>('day');

  const data = useMemo(() => {
    // Group the per-day rollup into the requested bucket.
    const buckets = new Map<string, { start: Date; count: number }>();
    for (const row of daily) {
      const d = new Date(row.dateIso);
      const key = bucketKey(d, granularity);
      const existing = buckets.get(key);
      if (existing) {
        existing.count += row.count;
      } else {
        buckets.set(key, { start: bucketStart(d, granularity), count: row.count });
      }
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((b) => ({ label: FORMATTERS[granularity](b.start), count: b.count }));
  }, [daily, granularity]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {granularity === 'day'
            ? 'Trips per day · last 30 days'
            : granularity === 'month'
              ? 'Trips per month · last 30 days'
              : 'Trips per quarter · last 30 days'}
        </p>
        <div
          role="tablist"
          aria-label="Granularity"
          className="inline-flex rounded-md border bg-card p-0.5 text-xs font-medium"
        >
          {(['day', 'month', 'quarter'] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={granularity === g}
              onClick={() => setGranularity(g)}
              className={cn(
                'rounded px-2.5 py-1 capitalize transition-colors',
                granularity === g
                  ? 'bg-brand text-white'
                  : 'text-muted-foreground hover:text-brand',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: '#F2F7F4' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                fontSize: 12,
              }}
              formatter={(value) => [String(value ?? 0), 'Trips']}
            />
            <Bar
              dataKey="count"
              fill="#006B3F"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
