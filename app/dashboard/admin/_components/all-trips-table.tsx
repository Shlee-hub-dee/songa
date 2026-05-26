'use client';

import { useMemo, useState } from 'react';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/trip/status-pill';
import { TripSidePanel } from '@/components/trip/trip-side-panel';

export type TripRow = {
  id: string;
  typeLabel: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
  distanceKm: number;
  amountKes: number;
  startTimeIso: string;
  officer: {
    id: string;
    name: string;
    role: Role;
    organisationalUnit: string | null;
  };
};

type Period = 'all' | 'today' | 'week' | 'month' | 'quarter';

const PERIOD_LABEL: Record<Period, string> = {
  all: 'All time',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
};

function inPeriod(iso: string, period: Period): boolean {
  if (period === 'all') return true;
  const d = new Date(iso);
  const now = new Date();
  if (period === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return d >= start;
  }
  if (period === 'month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  // quarter
  const q = Math.floor(now.getMonth() / 3);
  const dq = Math.floor(d.getMonth() / 3);
  return dq === q && d.getFullYear() === now.getFullYear();
}

const DATE_SHORT = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export function AllTripsTable({
  trips,
  organisationalUnits,
}: {
  trips: TripRow[];
  organisationalUnits: string[];
}) {
  const [status, setStatus] = useState<string>('ALL');
  const [role, setRole] = useState<string>('ALL');
  const [unit, setUnit] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      if (status !== 'ALL' && t.status !== status) return false;
      if (role !== 'ALL' && t.officer.role !== role) return false;
      if (unit !== 'ALL' && t.officer.organisationalUnit !== unit) return false;
      if (!inPeriod(t.startTimeIso, period)) return false;
      return true;
    });
  }, [trips, status, role, unit, period]);

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="mb-3 grid grid-cols-2 gap-2 tablet:grid-cols-4">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ['ALL', 'All statuses'],
            ['DRAFT', 'Draft'],
            ['PENDING', 'Pending'],
            ['APPROVED', 'Approved'],
            ['REJECTED', 'Rejected'],
            ['REIMBURSED', 'Disbursed'],
          ]}
        />
        <FilterSelect
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            ['ALL', 'All roles'],
            ['TUPANDE_AGENT', ROLE_LABEL.TUPANDE_AGENT],
            ['ZONE_SUPERVISOR', ROLE_LABEL.ZONE_SUPERVISOR],
            ['AREA_COORDINATOR', ROLE_LABEL.AREA_COORDINATOR],
            ['REGIONAL_MANAGER', ROLE_LABEL.REGIONAL_MANAGER],
          ]}
        />
        <FilterSelect
          label="Unit"
          value={unit}
          onChange={setUnit}
          options={[
            ['ALL', 'All units'],
            ...organisationalUnits.map((u) => [u, u] as [string, string]),
          ]}
        />
        <FilterSelect
          label="Period"
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={(['all', 'today', 'week', 'month', 'quarter'] as Period[]).map(
            (p) => [p, PERIOD_LABEL[p]] as [string, string],
          )}
        />
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Showing {filtered.length} of {trips.length} trips
      </p>

      {/* ── Mobile cards / tablet+ table ── */}
      <ul className="grid gap-2 tablet:hidden">
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setSelected(t.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-surface/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {DATE_SHORT.format(new Date(t.startTimeIso))}
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {t.officer.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[t.officer.role]}
                  {t.officer.organisationalUnit ? ` · ${t.officer.organisationalUnit}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.typeLabel} · {t.distanceKm.toFixed(1)} km · {KES.format(t.amountKes)}
                </p>
              </div>
              <StatusPill status={t.status} />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border bg-card shadow-sm tablet:block">
        <table className="w-full text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-4 py-2.5">Officer</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Distance</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((t) => (
              <tr
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  'cursor-pointer transition-colors',
                  selected === t.id
                    ? 'bg-brand-surface/60'
                    : 'hover:bg-brand-surface/40',
                )}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {t.officer.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {ROLE_LABEL[t.officer.role]}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.officer.organisationalUnit ?? '—'}
                </td>
                <td className="px-4 py-3">{t.typeLabel}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {t.distanceKm.toFixed(2)} km
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {KES.format(t.amountKes)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={t.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {DATE_SHORT.format(new Date(t.startTimeIso))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TripSidePanel tripId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
