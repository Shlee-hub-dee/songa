'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { cn } from '@/lib/utils';

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const DATE_TIME = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_PILL: Record<
  'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED',
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-900' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-900' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-900' },
  REIMBURSED: { label: 'Disbursed', className: 'bg-brand text-white' },
};

type Statement = {
  officer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: Role;
    organisationalUnit: string | null;
    managerName: string | null;
  };
  summary: {
    outstandingBalance: number;
    lifetimeReimbursed: number;
    totalTrips: number;
    pendingTripsCount: number;
  };
  trips: {
    id: string;
    typeLabel: string;
    status: keyof typeof STATUS_PILL;
    distanceKm: number;
    amountKes: number;
    startTime: string;
    submittedAt: string | null;
    approvedAt: string | null;
    reimbursedAt: string | null;
    rejectedAt: string | null;
  }[];
  payments: {
    id: string;
    mpesaRef: string;
    amountKes: number;
    recipientPhone: string;
    paidAt: string;
    direction: 'paid-out' | 'received';
    tripId: string;
  }[];
};

export function OfficerStatementPanel({
  officerId,
  onClose,
}: {
  officerId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!officerId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/finance/statement/${officerId}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `Could not load statement (${res.status})`);
        }
        return res.json();
      })
      .then((d: Statement) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [officerId]);

  // Close on Escape
  useEffect(() => {
    if (!officerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [officerId, onClose]);

  // PDF: window.print() with print-only CSS. The print stylesheet hides the
  // page chrome and just renders the statement card — Chromium / Edge / Safari
  // all expose "Save as PDF" from the print dialog so this gives the user a
  // sharp vector PDF without bundling a heavy PDF library.
  function printStatement() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  const open = officerId !== null;

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity print:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Officer statement"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-card shadow-xl transition-transform duration-200 print:relative print:inset-auto print:w-full print:max-w-none print:shadow-none print:duration-0',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 print:hidden">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand">
              Officer statement
            </p>
            <p className="text-sm font-medium text-foreground">
              {data ? data.officer.name : officerId ? 'Loading…' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={printStatement}
              disabled={!data}
              aria-label="Print / Save as PDF"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden /> PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-surface hover:text-brand"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div
          ref={printRef}
          className="print-area flex-1 overflow-y-auto print:overflow-visible"
        >
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : data ? (
            <div className="space-y-4 p-4">
              {/* Header card */}
              <section className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-brand">
                  Songa statement · Tupande
                </p>
                <h2 className="mt-1 text-xl font-bold text-foreground">
                  {data.officer.name}
                </h2>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd>{ROLE_LABEL[data.officer.role]}</dd>
                  <dt className="text-muted-foreground">Unit</dt>
                  <dd>{data.officer.organisationalUnit ?? '—'}</dd>
                  <dt className="text-muted-foreground">Manager</dt>
                  <dd>{data.officer.managerName ?? '—'}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate">{data.officer.email}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{data.officer.phone ?? '—'}</dd>
                </dl>
              </section>

              {/* Summary */}
              <section className="rounded-lg border border-l-4 border-l-brand bg-brand-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-brand">
                  Outstanding balance owed
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-brand">
                  {KES.format(data.summary.outstandingBalance)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.summary.pendingTripsCount} approved trip
                  {data.summary.pendingTripsCount === 1 ? '' : 's'} pending disbursement
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Lifetime reimbursed:{' '}
                  <span className="font-medium text-foreground">
                    {KES.format(data.summary.lifetimeReimbursed)}
                  </span>
                  {' '}across {data.summary.totalTrips} trip
                  {data.summary.totalTrips === 1 ? '' : 's'} total.
                </p>
              </section>

              {/* Trips */}
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Trip history
                </h3>
                {data.trips.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card p-3 text-xs text-muted-foreground">
                    No trips logged.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border bg-card">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2 text-right">Distance</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.trips.map((t) => (
                          <tr key={t.id}>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {DATE_TIME.format(new Date(t.startTime))}
                            </td>
                            <td className="px-3 py-1.5">{t.typeLabel}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {t.distanceKm.toFixed(2)} km
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {KES.format(t.amountKes)}
                            </td>
                            <td className="px-3 py-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[t.status].className}`}
                              >
                                {STATUS_PILL[t.status].label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Payments */}
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Payments
                </h3>
                {data.payments.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card p-3 text-xs text-muted-foreground">
                    No payments recorded.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border bg-card">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Direction</th>
                          <th className="px-3 py-2">M-Pesa ref</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {DATE_TIME.format(new Date(p.paidAt))}
                            </td>
                            <td className="px-3 py-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  p.direction === 'received'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {p.direction === 'received' ? 'Received' : 'Paid out'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono">{p.mpesaRef}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {KES.format(p.amountKes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p className="text-[10px] text-muted-foreground">
                Generated {DATE_TIME.format(new Date())} from Songa.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
