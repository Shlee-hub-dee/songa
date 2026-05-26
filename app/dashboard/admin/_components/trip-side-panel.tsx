'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { StatusPill } from './status-pill';

// Lazy-load the map: leaflet touches `window` at module scope and would
// otherwise break SSR.
const TripMap = dynamic(() => import('./trip-map').then((m) => m.TripMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

type TripDetail = {
  id: string;
  typeLabel: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
  distanceKm: number;
  ratePerKm: number;
  amountKes: number;
  currency: string;
  startTime: string;
  endTime: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  reimbursedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number } | null;
  gpsAccuracyM: number | null;
  gpsPointCount: number;
  gpsTrail: unknown; // [{lat, lng, ts, accuracy}, ...] or null
  officer: { name: string; role: Role; organisationalUnit: string | null };
  approverName: string | null;
  payment: {
    mpesaRef: string;
    amountKes: number;
    recipientPhone: string;
    paidAt: string;
  } | null;
};

function parseTrail(raw: unknown): { lat: number; lng: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { lat: number; lng: number }[] = [];
  for (const wp of raw) {
    if (
      wp &&
      typeof wp === 'object' &&
      typeof (wp as { lat?: unknown }).lat === 'number' &&
      typeof (wp as { lng?: unknown }).lng === 'number'
    ) {
      out.push({
        lat: (wp as { lat: number }).lat,
        lng: (wp as { lng: number }).lng,
      });
    }
  }
  return out;
}

const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const DATE_TIME = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function TripSidePanel({
  tripId,
  onClose,
}: {
  tripId: string | null;
  onClose: () => void;
}) {
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) {
      setTrip(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/trips/${tripId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Could not load trip (${res.status})`);
        }
        return res.json();
      })
      .then((data: { trip: TripDetail }) => {
        if (!cancelled) setTrip(data.trip);
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
  }, [tripId]);

  // Close on Escape
  useEffect(() => {
    if (!tripId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tripId, onClose]);

  const open = tripId !== null;
  const trail = trip ? parseTrail(trip.gpsTrail) : [];

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Trip detail"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand">
              Trip detail
            </p>
            <p className="text-sm font-medium text-foreground">
              {trip ? trip.typeLabel : tripId ? 'Loading…' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip detail"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-surface hover:text-brand"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : trip ? (
            <div className="space-y-4 p-4">
              {/* Map */}
              <div className="h-56 overflow-hidden rounded-md border bg-muted/30">
                <TripMap
                  start={trip.start}
                  end={trip.end}
                  waypoints={trail}
                />
              </div>

              {/* Summary */}
              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {trip.officer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[trip.officer.role]}
                      {trip.officer.organisationalUnit
                        ? ` · ${trip.officer.organisationalUnit}`
                        : ''}
                    </p>
                  </div>
                  <StatusPill status={trip.status} />
                </div>
              </section>

              {/* Stats */}
              <section className="grid grid-cols-2 gap-3 rounded-md border bg-card p-3">
                <Stat label="Distance" value={`${trip.distanceKm.toFixed(2)} km`} />
                <Stat label="Amount" value={KES.format(trip.amountKes)} />
                <Stat label="Rate" value={`${KES.format(trip.ratePerKm)} / km`} />
                <Stat
                  label="GPS points"
                  value={`${trip.gpsPointCount}${trip.gpsAccuracyM ? ` · ${trip.gpsAccuracyM.toFixed(0)}m` : ''}`}
                />
              </section>

              {/* Timeline */}
              <section className="rounded-md border bg-card p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Timeline
                </p>
                <ul className="space-y-1 text-xs">
                  <TimelineRow label="Started" iso={trip.startTime} />
                  {trip.endTime ? <TimelineRow label="Ended" iso={trip.endTime} /> : null}
                  {trip.submittedAt ? (
                    <TimelineRow label="Submitted" iso={trip.submittedAt} />
                  ) : null}
                  {trip.approvedAt ? (
                    <TimelineRow
                      label="Approved"
                      iso={trip.approvedAt}
                      extra={trip.approverName ? `by ${trip.approverName}` : undefined}
                    />
                  ) : null}
                  {trip.rejectedAt ? (
                    <TimelineRow
                      label="Rejected"
                      iso={trip.rejectedAt}
                      extra={trip.rejectionReason ?? undefined}
                    />
                  ) : null}
                  {trip.reimbursedAt ? (
                    <TimelineRow label="Disbursed" iso={trip.reimbursedAt} />
                  ) : null}
                </ul>
              </section>

              {trip.payment ? (
                <section className="rounded-md border bg-card p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Payment
                  </p>
                  <dl className="grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">M-Pesa ref</dt>
                    <dd className="text-right font-mono">{trip.payment.mpesaRef}</dd>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="text-right tabular-nums">
                      {KES.format(trip.payment.amountKes)}
                    </dd>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-right">{trip.payment.recipientPhone}</dd>
                  </dl>
                </section>
              ) : null}

              {trip.notes ? (
                <section className="rounded-md border bg-card p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </p>
                  <p className="text-sm text-foreground">{trip.notes}</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function TimelineRow({
  label,
  iso,
  extra,
}: {
  label: string;
  iso: string;
  extra?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-foreground">
          {DATE_TIME.format(new Date(iso))}
        </span>
        {extra ? (
          <span className="ml-1 text-muted-foreground">— {extra}</span>
        ) : null}
      </span>
    </li>
  );
}
