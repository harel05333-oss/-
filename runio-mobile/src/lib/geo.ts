const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two points, in meters.
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatLivePace(distanceKm: number, elapsedS: number): string {
  if (distanceKm <= 0.02) return '--:--';
  const paceSecPerKm = elapsedS / distanceKm;
  if (!Number.isFinite(paceSecPerKm)) return '--:--';
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Decodes Strava's Google-encoded polyline format into [lat, lng] pairs.
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

export type Split = {
  km: number;
  paceLabel: string;
  elevationDifferenceM: number | null;
};

// Derives real per-km splits from a recorded route's own points — no
// server round trip needed, since app-recorded runs already have the full
// timestamped (and, since the elevation-tracking build, altitude-tagged)
// route client-side.
export function computeSplitsFromRoute(
  route: { lat: number; lng: number; t: number; alt?: number | null }[]
): Split[] {
  if (route.length < 2) return [];

  const splits: Split[] = [];
  let kmStartIdx = 0;
  let cumDistM = 0;
  let kmBoundaryDistM = 1000;

  for (let i = 1; i < route.length; i++) {
    cumDistM += haversineMeters(route[i - 1], route[i]);

    if (cumDistM >= kmBoundaryDistM) {
      const start = route[kmStartIdx];
      const end = route[i];
      const elapsedS = (end.t - start.t) / 1000;
      const hasAlt = typeof start.alt === 'number' && typeof end.alt === 'number';
      splits.push({
        km: splits.length + 1,
        paceLabel: formatLivePace(1, elapsedS),
        elevationDifferenceM: hasAlt ? Math.round((end.alt as number) - (start.alt as number)) : null,
      });
      kmStartIdx = i;
      kmBoundaryDistM += 1000;
    }
  }

  return splits;
}
