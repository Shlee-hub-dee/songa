'use client';

import { useMemo, useState } from 'react';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { StatusPill } from '@/components/trip/status-pill';
import { cn } from '@/lib/utils';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export type TeamTripRow = {
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

const STATUS_OPTIONS = [
  ['ALL', 'All statuses'],
  ['DRAFT', 'Draft'],
  ['PENDING', 'Pending'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['REIMBURSED', 'Disbursed'],
] as const;

// Direct-report trip table filterable by status, officer name (substring),
// and date range. Server-fetched in one go; filtering is in-memory because
// the row count per approver is bounded by their team size.
export function TeamReportSection({
  rows,
  onOpen,
}: {
  rows: TeamTripRow[];
  onOpen: (id: string) => void;
}) {
  const [status, setStatus] = useState<string>('ALL');
  const [name, setName] = useState('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const officerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.officer.id, r.officer.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
    const q = name.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (q && !r.officer.name.toLowerCase().includes(q) && r.officer.id !== name) {
        return false;
      }
      const d = new Date(r.startTimeIso);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [rows, status, name, from, to]);

  return (
    <section className="mt-6" aria-label="Team report">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground sm:text-lg">
          Team report
        </h2>
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </p>
      </header>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-2 gap-2 tablet:grid-cols-4">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Officer">
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All officers</option>
            {officerOptions.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
      </div>

      {/* Mobile cards / table */}
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No trips match these filters.
        </p>
      ) : (
        <>
          <ul className="grid gap-2 tablet:hidden">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-surface/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {DATE.format(new Date(t.startTimeIso))}
                    </p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.officer.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ROLE_LABEL[t.officer.role]}
                      {t.officer.organisationalUnit
                        ? ` · ${t.officer.organisationalUnit}`
                        : ''}
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
                  <th className="px-3 py-2.5">Officer</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Unit</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5 text-right">Distance</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onOpen(t.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-brand-surface/40')}
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {t.officer.name}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {ROLE_LABEL[t.officer.role]}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {t.officer.organisationalUnit ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">{t.typeLabel}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {t.distanceKm.toFixed(2)} km
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {KES.format(t.amountKes)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {DATE.format(new Date(t.startTimeIso))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
