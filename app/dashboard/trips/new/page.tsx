'use client';

// NOTE: server-side role gate lives in [layout.tsx](./layout.tsx) below — RM /
// FM / ADMIN never reach the client component because the layout redirects
// them to /dashboard?blocked=trip-log. Middleware also blocks the route as a
// belt-and-braces second layer.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ACTIVE_TRIP_KEY,
  TRIP_TYPE_LABEL,
  type ActiveTrip,
  type TripType,
  type Waypoint,
  clearActiveTrip,
  loadActiveTrip,
  saveActiveTrip,
} from '@/lib/active-trip';
import {
  ACCURACY_THRESHOLD_M,
  accuracyTier,
  formatElapsed,
  haversineKm,
  type AccuracyTier,
} from '@/lib/geo';

const TRIP_TYPES: TripType[] = [
  'FARMER_ENROLLMENT',
  'GROUP_TRAINING',
  'LOAN_FOLLOWUP',
  'INPUT_DISTRIBUTION',
  'OTHER',
];

const TIER_STYLES: Record<AccuracyTier, { dot: string; label: string }> = {
  excellent: { dot: 'bg-brand', label: 'Excellent GPS' },
  good: { dot: 'bg-brand-secondary', label: 'Good GPS' },
  acceptable: { dot: 'bg-brand-accent', label: 'Acceptable GPS' },
  rejected: { dot: 'bg-red-500', label: 'Poor — rejected' },
  unknown: { dot: 'bg-gray-300', label: 'Waiting for GPS…' },
};

const CONFIRM_END_TIMEOUT_MS = 4000;

export default function NewTripPage() {
  const router = useRouter();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [tripType, setTripType] = useState<TripType>('FARMER_ENROLLMENT');
  const [notes, setNotes] = useState('');
  const [now, setNow] = useState<number>(() => Date.now());
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [rejectedRecently, setRejectedRecently] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejectFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref mirror of `trip` so the geolocation callback (which is registered
  // once at trip start) reads the latest value without restarting watchPosition.
  const tripRef = useRef<ActiveTrip | null>(null);

  // ── Lifecycle: restore active trip on mount and on visibility change ─────
  useEffect(() => {
    const restored = loadActiveTrip();
    if (restored) {
      setTrip(restored);
      tripRef.current = restored;
      startWatch();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const fresh = loadActiveTrip();
        if (fresh) {
          setTrip(fresh);
          tripRef.current = fresh;
          // If we lost the watcher while backgrounded, resume it.
          if (watchIdRef.current == null) startWatch();
        }
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_TRIP_KEY) {
        const fresh = loadActiveTrip();
        setTrip(fresh);
        tripRef.current = fresh;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      stopWatch();
      if (tickRef.current) clearInterval(tickRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (rejectFlashRef.current) clearTimeout(rejectFlashRef.current);
    };
    // startWatch/stopWatch are stable closures — intentionally only run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed timer — only ticks while a trip is active.
  useEffect(() => {
    if (!trip) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    setNow(Date.now());
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [trip?.id]);

  // ── Geolocation watcher ──────────────────────────────────────────────────
  const onPosition = useCallback((pos: GeolocationPosition) => {
    const current = tripRef.current;
    if (!current) return;

    const wp: Waypoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ts: pos.timestamp,
      accuracy: pos.coords.accuracy,
    };

    // Always remember the latest accuracy reading for the badge, even if rejected.
    let next: ActiveTrip = { ...current, lastAccuracy: wp.accuracy };

    if (wp.accuracy > ACCURACY_THRESHOLD_M) {
      // Reject: too imprecise to trust.
      setRejectedRecently(true);
      if (rejectFlashRef.current) clearTimeout(rejectFlashRef.current);
      rejectFlashRef.current = setTimeout(() => setRejectedRecently(false), 2500);
    } else {
      const prev = current.waypoints[current.waypoints.length - 1];
      const addedKm = prev ? haversineKm(prev, wp) : 0;
      next = {
        ...next,
        waypoints: [...current.waypoints, wp],
        distanceKm: current.distanceKm + addedKm,
        bestAccuracy:
          current.bestAccuracy == null
            ? wp.accuracy
            : Math.min(current.bestAccuracy, wp.accuracy),
      };
    }

    tripRef.current = next;
    setTrip(next);
    saveActiveTrip(next);
  }, []);

  const onPositionError = useCallback((err: GeolocationPositionError) => {
    setGpsError(err.message || 'Unable to read GPS');
  }, []);

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not available on this device');
      return;
    }
    if (watchIdRef.current != null) return;
    setGpsError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
  }, [onPosition, onPositionError]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    const newTrip: ActiveTrip = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `trip_${Date.now()}`,
      type: tripType,
      notes: notes.trim(),
      startTime: Date.now(),
      waypoints: [],
      distanceKm: 0,
      bestAccuracy: null,
      lastAccuracy: null,
    };
    // Persist BEFORE starting the watcher so a navigation away can't lose the trip.
    saveActiveTrip(newTrip);
    tripRef.current = newTrip;
    setTrip(newTrip);
    startWatch();
  };

  const handleEndTap = async () => {
    if (submitting) return;
    if (!confirmingEnd) {
      setConfirmingEnd(true);
      confirmTimerRef.current = setTimeout(() => setConfirmingEnd(false), CONFIRM_END_TIMEOUT_MS);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingEnd(false);

    const current = tripRef.current;
    if (!current) return;

    // Stop GPS first — the trip is over from the user's perspective.
    stopWatch();
    setSubmitting(true);
    setSubmitError(null);

    const first = current.waypoints[0];
    const last = current.waypoints[current.waypoints.length - 1];

    try {
      // Server resolves rate + amount; we never send ratePerKm or amountKes.
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: current.type,
          notes: current.notes || undefined,
          startTime: new Date(current.startTime).toISOString(),
          endTime: new Date().toISOString(),
          startLat: first?.lat ?? 0,
          startLng: first?.lng ?? 0,
          endLat: last?.lat,
          endLng: last?.lng,
          distanceKm: current.distanceKm,
          gpsAccuracyM: current.bestAccuracy ?? undefined,
          gpsPointCount: current.waypoints.length,
          gpsTrail: current.waypoints,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        // Keep localStorage so the officer can retry without losing the trip.
        setSubmitError(body?.error ?? `Could not save trip (${res.status})`);
        return;
      }

      const data = (await res.json()) as { trip: { id: string } };
      // Now it's safe to drop the local copy — the canonical trip lives in the DB.
      clearActiveTrip();
      tripRef.current = null;
      setTrip(null);
      setNotes('');
      router.push(`/dashboard/trips/${data.trip.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save trip');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (!trip) {
    return (
      <main className="mx-auto max-w-md p-4 sm:p-6">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">New trip</p>
          <h1 className="text-2xl font-bold text-foreground">Log a field trip</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll track your route via GPS. Keep this page open while you drive.
          </p>
        </header>

        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <label htmlFor="trip-type" className="text-sm font-medium">
              Trip type
            </label>
            <select
              id="trip-type"
              value={tripType}
              onChange={(e) => setTripType(e.target.value as TripType)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TRIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRIP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Purpose, farmer group, etc."
              className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button size="lg" className="h-14 w-full text-base" onClick={handleStart}>
            Start trip
          </Button>

          {gpsError ? (
            <p className="text-sm text-destructive">{gpsError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You&apos;ll be asked for location permission. Accuracy below{' '}
              {ACCURACY_THRESHOLD_M}m is required.
            </p>
          )}
        </form>
      </main>
    );
  }

  // ── Active recording ─────────────────────────────────────────────────────
  const elapsedMs = now - trip.startTime;
  const tier = accuracyTier(trip.lastAccuracy);
  const tierStyle = TIER_STYLES[tier];

  return (
    <main className="mx-auto max-w-md p-4 sm:p-6">
      {/* Sticky banner — always visible while a trip is active */}
      <div className="sticky top-0 -mx-4 mb-4 border-l-4 border-brand bg-brand-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand">Active trip</p>
            <p className="text-sm font-semibold text-foreground">
              {TRIP_TYPE_LABEL[trip.type]}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium shadow-sm">
            <span className={cn('h-2 w-2 rounded-full', tierStyle.dot)} aria-hidden />
            {trip.lastAccuracy != null ? `${trip.lastAccuracy.toFixed(0)} m` : '—'}
          </span>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Distance
          </p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {formatElapsed(elapsedMs)}
          </p>
        </div>
        <p className="mt-1 text-5xl font-bold tabular-nums text-brand">
          {trip.distanceKm.toFixed(2)}
          <span className="ml-1 text-xl font-semibold text-muted-foreground">km</span>
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
          <Stat label="Waypoints" value={trip.waypoints.length.toString()} />
          <Stat
            label="Best GPS"
            value={trip.bestAccuracy != null ? `${trip.bestAccuracy.toFixed(0)} m` : '—'}
          />
          <Stat label="Status" value={tierStyle.label} small />
        </div>
      </section>

      {rejectedRecently ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Low-accuracy reading ignored (&gt; {ACCURACY_THRESHOLD_M}m). Move to open sky.
        </p>
      ) : null}
      {gpsError ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{gpsError}</p>
      ) : null}

      <div className="mt-6 space-y-2">
        <Button
          size="lg"
          variant={confirmingEnd ? 'destructive' : 'outline'}
          className={cn('h-14 w-full text-base', confirmingEnd && 'animate-pulse')}
          onClick={handleEndTap}
          disabled={submitting}
        >
          {submitting
            ? 'Saving trip…'
            : confirmingEnd
              ? 'Tap again to confirm end'
              : 'End trip'}
        </Button>
        {confirmingEnd && !submitting ? (
          <p className="text-center text-xs text-muted-foreground">
            Cancels automatically in a few seconds.
          </p>
        ) : null}
        {submitError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError} Your waypoints are still saved locally — tap End trip again to retry.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-semibold tabular-nums text-foreground',
          small ? 'text-xs leading-tight' : 'text-lg',
        )}
      >
        {value}
      </p>
    </div>
  );
}
