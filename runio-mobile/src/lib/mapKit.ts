// Thin re-export so run-detail.tsx/record-run.tsx import from here instead
// of 'react-native-maps' directly — Metro then picks this file on native and
// mapKit.web.ts on web (react-native-maps has no web build at all, and since
// Expo Router eagerly imports every route to build its route table, one
// unconditional native-only import in any single screen broke the ENTIRE
// web bundle, not just that screen).
export { default, Marker, Polyline } from 'react-native-maps';
export type { LatLng } from 'react-native-maps';
