// Geospatial + GPS helpers. Pure functions, no side effects — easy to unit-test.

export const ACCURACY_THRESHOLD_M = 50;

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export type AccuracyTier = 'excellent' | 'good' | 'acceptable' | 'rejected' | 'unknown';

export function accuracyTier(accuracyM: number | null | undefined): AccuracyTier {
  if (accuracyM == null) return 'unknown';
  if (accuracyM <= 10) return 'excellent';
  if (accuracyM <= 25) return 'good';
  if (accuracyM <= ACCURACY_THRESHOLD_M) return 'acceptable';
  return 'rejected';
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
