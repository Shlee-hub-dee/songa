'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export type UnitSpend = { unit: string; amount: number };

export function SpendByUnitChart({ data }: { data: UnitSpend[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No spend data for this period.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="unit"
          tick={{ fontSize: 11, fill: '#64748B' }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748B' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
          }
        />
        <Tooltip
          cursor={{ fill: '#F2F7F4' }}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            fontSize: 12,
          }}
          formatter={(value) => [
            KES.format(typeof value === 'number' ? value : 0),
            'Spend',
          ]}
        />
        <Bar dataKey="amount" fill="#006B3F" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
