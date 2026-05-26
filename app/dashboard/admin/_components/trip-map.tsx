'use client';

// Leaflet map rendered for a single trip. Loaded via dynamic import on the
// parent (ssr: false) because leaflet pokes `window` at module scope and
// would otherwise blow up during server prerendering.

import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon URLs point at assets bundled inside the
// `leaflet` package; webpack rewrites them in a way that breaks. Wire them
// up explicitly so the markers actually render.
const DEFAULT_ICON = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DEFAULT_ICON;

type Waypoint = { lat: number; lng: number };

function FitBounds({ points }: { points: Waypoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export function TripMap({
  start,
  end,
  waypoints,
}: {
  start: Waypoint;
  end: Waypoint | null;
  waypoints: Waypoint[];
}) {
  // Compose the polyline from waypoints if we have them; fall back to a
  // start→end straight line so we always show something useful on the map.
  const trail =
    waypoints.length > 0
      ? waypoints
      : end
        ? [start, end]
        : [start];

  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={14}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%', borderRadius: 8 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={trail.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#006B3F', weight: 4 }} />
      <Marker position={[start.lat, start.lng]} />
      {end ? <Marker position={[end.lat, end.lng]} /> : null}
      <FitBounds points={trail} />
    </MapContainer>
  );
}
