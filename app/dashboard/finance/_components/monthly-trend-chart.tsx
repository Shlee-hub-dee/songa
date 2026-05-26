'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
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

export type MonthlyPoint = { label: string; amount: number };

export function MonthlyTrendChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#64748B' }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
          interval="preserveStartEnd"
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
          cursor={{ stroke: '#7AB648', strokeWidth: 1 }}
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
        <Line
          type="monotone"
          dataKey="amount"
          stroke="#006B3F"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#006B3F' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
