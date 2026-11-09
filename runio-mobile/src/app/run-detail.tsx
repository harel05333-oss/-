import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import MapView, { Polyline, type LatLng } from '@/lib/mapKit';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { DARK_MAP_STYLE } from '@/lib/mapStyle';
import { computeSplitsFromRoute, decodePolyline, formatElapsed, formatLivePace } from '@/lib/geo';
import { fetchSoloRun, fetchStravaRunDetail, type StravaSplit } from '@/lib/api';

type DetailRow = {
  name: string;
  date: string;
  distanceKm: number;
  durationS: number;
  elevationGainM: number | null;
  averageHeartrate: number | null;
  coords: LatLng[];
  splits: { km: number; paceLabel: string; elevationDifferenceM: number | null; hr: number | null }[];
};

function regionFromCoords(coords: LatLng[]) {
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  // Padding so the route isn't flush against the map edges; a floor keeps a
  // very short/straight route from zooming in absurdly tight.
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.006);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.006);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function RunDetailScreen() {
  const { source, id } = useLocalSearchParams<{ source: string; id: string }>();
  const colors = useThemeColors();
  const [run, setRun] = useState<DetailRow | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (source === 'strava') {
      fetchStravaRunDetail(Number(id))
        .then((r) => {
          const coords = r.polyline ? decodePolyline(r.polyline) : [];
          setRun({
            name: r.name,
            date: r.startDate,
            distanceKm: r.distanceKm,
            durationS: r.movingTimeS,
            elevationGainM: r.elevationGainM,
            averageHeartrate: r.averageHeartrate,
            coords,
            splits: r.splits.map((s: StravaSplit) => ({
              km: s.km,
              paceLabel: formatLivePace(1, s.movingTimeS),
              elevationDifferenceM: s.elevationDifferenceM,
              hr: s.averageHeartrate,
            })),
          });
        })
        .catch(() => setError(true));
    } else {
      fetchSoloRun(String(id))
        .then((r) => {
          const coords = r.route.map((p) => ({ latitude: p.lat, longitude: p.lng }));
          const hasAlt = r.route.some((p) => typeof p.alt === 'number');
          let elevationGainM: number | null = null;
          if (hasAlt) {
            let gain = 0;
            let last: number | null = null;
            for (const p of r.route) {
              if (typeof p.alt !== 'number') continue;
              if (last !== null && p.alt > last) gain += p.alt - last;
              last = p.alt;
            }
            elevationGainM = Math.round(gain);
          }
          setRun({
            name: 'ריצה מוקלטת',
            date: r.startedAt,
            distanceKm: r.distanceKm,
            durationS: r.durationS,
            elevationGainM,
            averageHeartrate: null, // phone GPS has no heart-rate sensor — never fabricated
            coords,
            splits: computeSplitsFromRoute(r.route).map((s) => ({
              km: s.km,
              paceLabel: s.paceLabel,
              elevationDifferenceM: s.elevationDifferenceM,
              hr: null,
            })),
          });
        })
        .catch(() => setError(true));
    }
  }, [source, id]);

  if (error) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          לא ניתן היה לטעון את הריצה הזו.
        </Text>
      </SafeAreaView>
    );
  }

  if (!run) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const hasRoute = run.coords.length > 1;
  const hasHr = run.splits.some((s) => s.hr !== null);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title={run.name} eyebrow={formatDate(run.date)} />

      <ScrollView contentContainerStyle={styles.content}>
        {hasRoute ? (
          <View style={[styles.mapWrap, { borderColor: colors.glassBorder }]}>
            <MapView
              style={styles.map}
              initialRegion={regionFromCoords(run.coords)}
              customMapStyle={DARK_MAP_STYLE}
              userInterfaceStyle="dark"
              scrollEnabled={false}
              zoomEnabled={false}
              pointerEvents="none"
            >
              <Polyline coordinates={run.coords} strokeColor={colors.primary} strokeWidth={4} />
            </MapView>
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          <StarkCard style={styles.statCard}>
            <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>מרחק</Text>
            <Text style={[Typography.statValue, { color: colors.primary }]}>
              {run.distanceKm.toFixed(2)} ק"מ
            </Text>
          </StarkCard>
          <StarkCard style={styles.statCard}>
            <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>זמן</Text>
            <Text style={[Typography.statValue, { color: colors.primary }]}>
              {formatElapsed(run.durationS)}
            </Text>
          </StarkCard>
          <StarkCard style={styles.statCard}>
            <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>קצב ממוצע</Text>
            <Text style={[Typography.statValue, { color: colors.primary }]}>
              {formatLivePace(run.distanceKm, run.durationS)}
            </Text>
          </StarkCard>
          <StarkCard style={styles.statCard}>
            <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>עלייה</Text>
            <Text style={[Typography.statValue, { color: colors.primary }]}>
              {run.elevationGainM !== null ? `+${run.elevationGainM}m` : '—'}
            </Text>
          </StarkCard>
        </View>

        {run.splits.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>פרקים</Text>
            <StarkCard style={styles.splitsCard}>
              <View style={[styles.splitsHeaderRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.splitsHeaderCell, styles.kmCol, { color: colors.textSecondary }]}>
                  ק"מ
                </Text>
                <Text style={[styles.splitsHeaderCell, styles.paceCol, { color: colors.textSecondary }]}>
                  קצב
                </Text>
                <Text style={[styles.splitsHeaderCell, styles.elevCol, { color: colors.textSecondary }]}>
                  עלייה
                </Text>
                {hasHr && (
                  <Text style={[styles.splitsHeaderCell, styles.hrCol, { color: colors.textSecondary }]}>
                    דופק
                  </Text>
                )}
              </View>
              {run.splits.map((s) => (
                <View key={s.km} style={styles.splitRow}>
                  <Text style={[styles.splitCell, styles.kmCol, { color: colors.text }]}>{s.km}</Text>
                  <Text style={[styles.splitCell, styles.paceCol, { color: colors.text }]}>
                    {s.paceLabel}/ק"מ
                  </Text>
                  <Text style={[styles.splitCell, styles.elevCol, { color: colors.textSecondary }]}>
                    {s.elevationDifferenceM !== null
                      ? `${s.elevationDifferenceM > 0 ? '+' : ''}${s.elevationDifferenceM}m`
                      : '—'}
                  </Text>
                  {hasHr && (
                    <Text style={[styles.splitCell, styles.hrCol, { color: colors.error }]}>
                      {s.hr !== null ? `${s.hr}` : '—'}
                    </Text>
                  )}
                </View>
              ))}
            </StarkCard>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
  mapWrap: {
    height: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  statCard: { flexBasis: '46%', flexGrow: 1, padding: Spacing.three, gap: Spacing.two },
  sectionTitle: {
    fontFamily: Fonts.headline,
    fontSize: 18,
    marginTop: Spacing.two,
  },
  splitsCard: { padding: Spacing.three, gap: Spacing.two },
  splitsHeaderRow: {
    flexDirection: 'row',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  splitsHeaderCell: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  splitRow: { flexDirection: 'row', paddingVertical: 6 },
  splitCell: { fontFamily: Fonts.medium, fontSize: 14 },
  kmCol: { width: 32 },
  paceCol: { flex: 1 },
  elevCol: { width: 64 },
  hrCol: { width: 48, textAlign: 'right' },
});
