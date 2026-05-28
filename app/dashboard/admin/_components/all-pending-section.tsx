'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
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

export type PendingTripRow = {
  id: string;
  typeLabel: string;
  distanceKm: number;
  amountKes: number;
  submittedAtIso: string | null;
  officer: {
    id: string;
    name: string;
    role: Role;
    organisationalUnit: string | null;
  };
};

// Admin-only org-wide PENDING-trip listing. Rendered on the admin overview.
// Approve / Reject buttons hit the same /api/claims/[id]/{approve,reject}
// routes used by ZS/AC/RM — those routes now bypass the direct-report and
// role-tier checks when the actor is ADMIN, so any pending trip in the org
// can be actioned from here.
export function AllPendingSection({ trips }: { trips: PendingTripRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function approve(tripId: string) {
    setBusy(tripId);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${tripId}/approve`, { method: 'PATCH' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Approve failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function reject(tripId: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required to reject.');
      return;
    }
    setBusy(tripId);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${tripId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Reject failed (${res.status})`);
      }
      setRejecting(null);
      setReason('');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function stop(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  if (trips.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Nothing pending across the organisation right now.
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {/* Mobile cards */}
      <ul className="grid gap-2 tablet:hidden">
        {trips.map((t) => {
          const isBusy = busy === t.id;
          const isRejecting = rejecting === t.id;
          return (
            <li key={t.id}>
              <article
                onClick={() => setOpenId(t.id)}
                className="cursor-pointer rounded-lg border border-l-4 border-l-amber-400 bg-card p-3 shadow-sm transition-colors hover:bg-brand-surface/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t.officer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="rounded-full bg-brand-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                        {ROLE_LABEL[t.officer.role]}
                      </span>
                      {t.officer.organisationalUnit
                        ? ` · ${t.officer.organisationalUnit}`
                        : ''}
                    </p>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums">
                    {KES.format(t.amountKes)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.typeLabel} · {t.distanceKm.toFixed(1)} km
                  {t.submittedAtIso ? (
                    <> · {DATE.format(new Date(t.submittedAtIso))}</>
                  ) : null}
                </p>
                {isRejecting ? (
                  <div className="mt-2 space-y-2" onClick={stop}>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      onClick={stop}
                      rows={2}
                      placeholder="Reason for rejection"
                      className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          stop(e);
                          reject(t.id);
                        }}
                        disabled={isBusy || !reason.trim()}
                        className="h-9 flex-1 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                      >
                        {isBusy ? 'Rejecting…' : 'Confirm reject'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          stop(e);
                          setRejecting(null);
                          setReason('');
                        }}
                        disabled={isBusy}
                        className="h-9 flex-1 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2" onClick={stop}>
                    <button
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        approve(t.id);
                      }}
                      disabled={isBusy}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      {isBusy && busy === t.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        setError(null);
                        setReason('');
                        setRejecting(t.id);
                      }}
                      disabled={isBusy}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Reject
                    </button>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      {/* Tablet+ table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-sm tablet:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-3 py-2.5">Officer</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Distance</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Submitted</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {trips.map((t) => {
              const isBusy = busy === t.id;
              const isRejecting = rejecting === t.id;
              return (
                <>
                  <tr
                    key={t.id}
                    onClick={() => setOpenId(t.id)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      openId === t.id
                        ? 'bg-brand-surface/60'
                        : 'hover:bg-brand-surface/40',
                    )}
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
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {KES.format(t.amountKes)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {t.submittedAtIso ? DATE.format(new Date(t.submittedAtIso)) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5" onClick={stop}>
                        <button
                          type="button"
                          onClick={(e) => {
                            stop(e);
                            approve(t.id);
                          }}
                          disabled={isBusy}
                          aria-label={`Approve ${t.officer.name}'s trip`}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-brand px-2.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          {isBusy ? '…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            stop(e);
                            setError(null);
                            setReason('');
                            setRejecting(t.id);
                          }}
                          disabled={isBusy}
                          aria-label={`Reject ${t.officer.name}'s trip`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isRejecting ? (
                    <tr key={`${t.id}-reject`} className="bg-amber-50/40">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="space-y-2" onClick={stop}>
                          <label className="text-xs font-medium text-foreground">
                            Reason for rejecting {t.officer.name}&apos;s trip
                          </label>
                          <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            onClick={stop}
                            rows={2}
                            placeholder="Tell the officer what to fix."
                            className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                stop(e);
                                reject(t.id);
                              }}
                              disabled={isBusy || !reason.trim()}
                              className="h-9 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                            >
                              {isBusy ? 'Rejecting…' : 'Confirm reject'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                stop(e);
                                setRejecting(null);
                                setReason('');
                              }}
                              disabled={isBusy}
                              className="h-9 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <TripSidePanel
        tripId={openId}
        onClose={() => setOpenId(null)}
        approver={{ onChanged: () => startTransition(() => router.refresh()) }}
      />
    </>
  );
}
