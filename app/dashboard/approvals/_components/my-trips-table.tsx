'use client';

import { StatusPill } from '@/components/trip/status-pill';

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

export type MyTripRow = {
  id: string;
  typeLabel: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
  distanceKm: number;
  amountKes: number;
  startTimeIso: string;
};

// Compact list of the current user's own trips. ZS / AC see this on their
// "My Trips" tab — they can log trips themselves and want to track their
// own submissions without leaving the approvals page.
export function MyTripsTable({
  rows,
  onOpen,
}: {
  rows: MyTripRow[];
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        You haven&apos;t logged any trips yet.
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-2 tablet:hidden">
        {rows.map((t) => (
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
                  {t.typeLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.distanceKm.toFixed(1)} km · {KES.format(t.amountKes)}
                </p>
              </div>
              <StatusPill status={t.status} />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-sm tablet:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Distance</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="cursor-pointer transition-colors hover:bg-brand-surface/40"
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {DATE.format(new Date(t.startTimeIso))}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{t.typeLabel}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {t.distanceKm.toFixed(2)} km
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {KES.format(t.amountKes)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
