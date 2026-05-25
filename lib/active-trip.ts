// Persistence layer for the in-progress trip. The page mounts/unmounts and the
// tab can be backgrounded, so the only source of truth for "is a trip running"
// is localStorage.

export const ACTIVE_TRIP_KEY = 'songa_active_trip';

export type TripType =
  | 'FARMER_ENROLLMENT'
  | 'GROUP_TRAINING'
  | 'LOAN_FOLLOWUP'
  | 'INPUT_DISTRIBUTION'
  | 'OTHER';

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  FARMER_ENROLLMENT: 'Farmer Enrollment',
  GROUP_TRAINING: 'Group Training',
  LOAN_FOLLOWUP: 'Loan Follow-up',
  INPUT_DISTRIBUTION: 'Input Distribution',
  OTHER: 'Other',
};

export type Waypoint = {
  lat: number;
  lng: number;
  ts: number;
  accuracy: number;
};

export type ActiveTrip = {
  id: string;
  type: TripType;
  notes: string;
  startTime: number;
  waypoints: Waypoint[];
  distanceKm: number;
  bestAccuracy: number | null;
  lastAccuracy: number | null;
};

export function loadActiveTrip(): ActiveTrip | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTrip;
    if (!parsed?.id || !parsed?.startTime || !Array.isArray(parsed.waypoints)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveTrip(trip: ActiveTrip): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));
}

export function clearActiveTrip(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_TRIP_KEY);
}
