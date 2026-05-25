'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Datum = { day: string; date: string; count: number };

export function TripsPerDayChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 12, fill: '#64748B' }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: '#64748B' }}
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
          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
          formatter={(value) => [String(value ?? 0), 'Trips']}
        />
        <Bar dataKey="count" fill="#006B3F" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
