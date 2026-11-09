// Web has no react-native-maps build — this is a placeholder so importing
// screens (run-detail.tsx, record-run.tsx) still bundle for web instead of
// crashing the whole app there. Native/iOS/Android use mapKit.ts (the real
// thing) instead; Metro picks this file automatically for web builds only.
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export default function MapView({ style }: ViewProps) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.text}>Map preview unavailable on web</Text>
    </View>
  );
}

export function Marker() {
  return null;
}

export function Polyline() {
  return null;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d2021',
  },
  text: {
    color: '#94a3a0',
    fontSize: 12,
  },
});
