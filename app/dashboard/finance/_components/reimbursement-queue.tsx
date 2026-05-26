'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { TripSidePanel } from '@/components/trip/trip-side-panel';
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

export type OfficerGroup = {
  officerId: string;
  name: string;
  role: Role;
  organisationalUnit: string | null;
  phone: string | null;
  mpesaNumber: string | null;
  tripCount: number;
  totalAmount: number;
  oldestSubmittedIso: string | null;
  tripIds: string[];
  trips: {
    id: string;
    typeLabel: string;
    distanceKm: number;
    amountKes: number;
    startTimeIso: string;
    mpesaRef: string | null;
  }[];
};

export function ReimbursementQueue({
  groups,
  onViewStatement,
}: {
  groups: OfficerGroup[];
  onViewStatement: (officerId: string) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // officerId or 'bulk'
  const [error, setError] = useState<string | null>(null);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const allSelected = groups.length > 0 && selected.size === groups.length;
  const someSelected = selected.size > 0;

  const selectedSummary = useMemo(() => {
    let trips = 0;
    let amount = 0;
    for (const g of groups) {
      if (selected.has(g.officerId)) {
        trips += g.tripCount;
        amount += g.totalAmount;
      }
    }
    return { trips, amount };
  }, [groups, selected]);

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(groups.map((g) => g.officerId)));
  }

  function toggleOne(officerId: string) {
    const next = new Set(selected);
    if (next.has(officerId)) next.delete(officerId);
    else next.add(officerId);
    setSelected(next);
  }

  function toggleExpand(officerId: string) {
    const next = new Set(expanded);
    if (next.has(officerId)) next.delete(officerId);
    else next.add(officerId);
    setExpanded(next);
  }

  async function disburse(tripIds: string[], busyKey: string) {
    if (tripIds.length === 0) return;
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch('/api/claims/reimburse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripIds }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Disbursement failed (${res.status})`);
      }
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function disburseSelected() {
    const ids: string[] = [];
    for (const g of groups) {
      if (selected.has(g.officerId)) ids.push(...g.tripIds);
    }
    disburse(ids, 'bulk');
  }

  return (
    <>
      {/* Bulk action bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={groups.length === 0}
            className="h-4 w-4 rounded border-input accent-brand"
            aria-label="Select all officers"
          />
          <span className="text-muted-foreground">
            {someSelected
              ? `${selected.size} officer${selected.size === 1 ? '' : 's'} · ${selectedSummary.trips} trips · ${KES.format(selectedSummary.amount)}`
              : 'Select all'}
          </span>
        </label>
        <button
          type="button"
          onClick={disburseSelected}
          disabled={!someSelected || busy !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {busy === 'bulk' ? 'Disbursing…' : `Disburse selected`}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No approved claims awaiting disbursement.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
              <tr>
                <th className="w-10 px-3 py-2.5"></th>
                <th className="w-10 px-3 py-2.5"></th>
                <th className="px-3 py-2.5">Officer</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Unit</th>
                <th className="px-3 py-2.5 text-right">Trips</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5">Oldest</th>
                <th className="px-3 py-2.5">M-Pesa</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => {
                const isExpanded = expanded.has(g.officerId);
                const isBusy = busy === g.officerId || busy === 'bulk';
                return (
                  <>
                    <tr key={g.officerId} className="hover:bg-brand-surface/40">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(g.officerId)}
                          onChange={() => toggleOne(g.officerId)}
                          disabled={isBusy}
                          className="h-4 w-4 rounded border-input accent-brand"
                          aria-label={`Select ${g.name}`}
                        />
                      </td>
                      <td className="px-1 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleExpand(g.officerId)}
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-brand-surface hover:text-brand"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        <button
                          type="button"
                          onClick={() => onViewStatement(g.officerId)}
                          className="text-left hover:text-brand hover:underline"
                        >
                          {g.name}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-brand-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                          {ROLE_LABEL[g.role]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {g.organisationalUnit ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{g.tripCount}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-brand">
                        {KES.format(g.totalAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {g.oldestSubmittedIso ? DATE.format(new Date(g.oldestSubmittedIso)) : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {g.mpesaNumber ?? g.phone ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => disburse(g.tripIds, g.officerId)}
                          disabled={isBusy}
                          className="inline-flex h-8 items-center rounded-md border border-brand/40 px-3 text-xs font-medium text-brand hover:bg-brand-surface disabled:opacity-50"
                        >
                          {busy === g.officerId ? 'Disbursing…' : 'Disburse'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-brand-surface/20">
                        <td colSpan={10} className="px-6 py-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {g.trips.length} trip{g.trips.length === 1 ? '' : 's'} awaiting disbursement
                          </p>
                          <ul className="divide-y rounded-md border bg-card">
                            {g.trips.map((t) => (
                              <li
                                key={t.id}
                                className={cn(
                                  'flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-surface/40',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenTripId(t.id)}
                                  className="flex flex-1 items-baseline justify-between gap-3 text-left"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-foreground">{t.typeLabel}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {DATE.format(new Date(t.startTimeIso))} ·{' '}
                                      {t.distanceKm.toFixed(2)} km
                                      {t.mpesaRef ? (
                                        <>
                                          {' '}
                                          · <span className="font-mono">{t.mpesaRef}</span>
                                        </>
                                      ) : null}
                                    </p>
                                  </div>
                                  <p className="text-right text-sm font-medium tabular-nums">
                                    {KES.format(t.amountKes)}
                                  </p>
                                </button>
                                <span className="text-xs text-brand">View map →</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TripSidePanel tripId={openTripId} onClose={() => setOpenTripId(null)} />
    </>
  );
}
