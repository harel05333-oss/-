// Dark Google Maps style (Android's default provider) — iOS's default Apple
// Maps provider uses the MapView `userInterfaceStyle="dark"` prop instead.
// Shared between record-run.tsx (live tracking) and the run detail screen
// (route playback) so both maps look the same.
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#191c1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#191c1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3a0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#272a2b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#191c1d' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c0f10' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#191c1d' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#191c1d' }] },
];
