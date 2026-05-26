'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type MonthlyEarnings = {
  key: string;
  label: string;
  claimed: number;
  received: number;
};

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export function EarningsChart({ data }: { data: MonthlyEarnings[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: '#64748B' }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
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
          formatter={(value, name) => [
            KES.format(typeof value === 'number' ? value : 0),
            name,
          ]}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: '#475569' }}
        />
        <Bar
          dataKey="claimed"
          name="Claimed"
          fill="#7AB648"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
        <Bar
          dataKey="received"
          name="Received"
          fill="#006B3F"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
