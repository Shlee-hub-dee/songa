'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type Datum = { status: string; count: number; color: string };

export function StatusBreakdownChart({ data }: { data: Datum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No trips yet.
      </div>
    );
  }

  // Drop zero-count slices so the legend isn't cluttered with empty rows.
  const visible = data.filter((d) => d.count > 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={visible}
          dataKey="count"
          nameKey="status"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          stroke="#FFFFFF"
        >
          {visible.map((d) => (
            <Cell key={d.status} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
          formatter={(value, _name, ctx) => {
            const n = Number(value ?? 0);
            const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0';
            const label = (ctx as { payload?: { status?: string } })?.payload?.status ?? '';
            return [`${n} (${pct}%)`, label];
          }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
