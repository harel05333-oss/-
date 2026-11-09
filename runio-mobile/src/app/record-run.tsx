import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, type LatLng } from '@/lib/mapKit';

import { PulseRing } from '@/components/ui/PulseRing';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { saveSoloRun, type RoutePoint } from '@/lib/api';
import { formatElapsed, formatLivePace, haversineMeters } from '@/lib/geo';
import { DARK_MAP_STYLE } from '@/lib/mapStyle';

type Phase =
  | 'requesting'
  | 'denied'
  | 'ready'
  | 'running'
  | 'paused'
  | 'saving'
  | 'save-error'
  | 'finished';

const REGION_DELTA = 0.006;
// Window used to compute "current" (rolling) pace, distinct from the
// lifetime average — falls back to the average once there isn't enough
// recent data yet (start of the run, or just after resuming).
const PACE_WINDOW_MS = 30000;

export default function RecordRunScreen() {
  const router = useRouter();
  // Explicit insets rather than relying only on <SafeAreaView edges={['top']}>
  // — this screen is presented as a fullScreenModal, and the safe-area
  // context doesn't always report correctly for the top bar in that
  // presentation mode, leaving the close button flush against the
  // notch/status bar and hard to tap.
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [phase, setPhase] = useState<Phase>('requesting');
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedS, setElapsedS] = useState(0);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [currentPaceLabel, setCurrentPaceLabel] = useState('--:--');
  const [initialRegion, setInitialRegion] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const elapsedSRef = useRef(0);
  const distanceMRef = useRef(0);
  const routeRef = useRef<RoutePoint[]>([]);
  const lastAltitudeRef = useRef<number | null>(null);
  const elevationGainRef = useRef(0);
  const recentSamplesRef = useRef<{ t: number; distM: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPhase('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setInitialRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setPhase('ready');
    })();

    return () => {
      watchRef.current?.remove();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const stopTracking = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const beginTracking = useCallback(async () => {
    setPhase('running');

    tickRef.current = setInterval(() => {
      elapsedSRef.current += 1;
      setElapsedS(elapsedSRef.current);
    }, 1000);

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (pos) => {
        const rawAltitude = pos.coords.altitude;
        const point: RoutePoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: pos.timestamp,
          alt: typeof rawAltitude === 'number' && Number.isFinite(rawAltitude) ? rawAltitude : null,
        };
        const prev = routeRef.current[routeRef.current.length - 1];
        if (prev) {
          distanceMRef.current += haversineMeters(prev, point);
        }
        setDistanceM(distanceMRef.current);
        routeRef.current = [...routeRef.current, point];
        setRoute(routeRef.current);

        if (point.alt !== null && point.alt !== undefined) {
          if (lastAltitudeRef.current !== null) {
            const delta = point.alt - lastAltitudeRef.current;
            if (delta > 0) {
              elevationGainRef.current += delta;
              setElevationGainM(elevationGainRef.current);
            }
          }
          lastAltitudeRef.current = point.alt;
        }

        recentSamplesRef.current = [
          ...recentSamplesRef.current,
          { t: point.t, distM: distanceMRef.current },
        ].filter((s) => point.t - s.t <= PACE_WINDOW_MS);

        const windowStart = recentSamplesRef.current[0];
        const windowDistM = distanceMRef.current - windowStart.distM;
        const windowTimeS = (point.t - windowStart.t) / 1000;
        if (windowDistM > 15 && windowTimeS > 3) {
          setCurrentPaceLabel(formatLivePace(windowDistM / 1000, windowTimeS));
        } else {
          setCurrentPaceLabel(formatLivePace(distanceMRef.current / 1000, elapsedSRef.current));
        }
      }
    );
  }, []);

  function handleStart() {
    startedAtRef.current = Date.now();
    elapsedSRef.current = 0;
    distanceMRef.current = 0;
    routeRef.current = [];
    lastAltitudeRef.current = null;
    elevationGainRef.current = 0;
    recentSamplesRef.current = [];
    setRoute([]);
    setDistanceM(0);
    setElapsedS(0);
    setElevationGainM(0);
    setCurrentPaceLabel('--:--');
    beginTracking();
  }

  function handlePause() {
    stopTracking();
    setPhase('paused');
  }

  function handleResume() {
    beginTracking();
  }

  function handleCancel() {
    if (phase === 'ready') {
      router.back();
      return;
    }
    Alert.alert('לבטל את הריצה?', 'הריצה הזו עדיין לא נשמרה ותאבד אם תמשיך.', [
      { text: 'המשך לרוץ', style: 'cancel' },
      {
        text: 'בטל',
        style: 'destructive',
        onPress: () => {
          stopTracking();
          router.back();
        },
      },
    ]);
  }

  async function handleFinish() {
    stopTracking();
    const distanceKm = distanceMRef.current / 1000;

    if (distanceKm < 0.05) {
      Alert.alert(
        'הריצה קצרה מדי לשמירה',
        'הריצה הזו קצרה מ-50 מטר — אין מספיק מרחק כדי לתעד אותה. להמשיך לרוץ, או לבטל אותה?',
        [
          { text: 'המשך לרוץ', onPress: () => beginTracking() },
          {
            text: 'בטל',
            style: 'destructive',
            onPress: () => router.back(),
          },
        ]
      );
      return;
    }

    setPhase('saving');
    try {
      await saveSoloRun({
        distanceKm,
        durationS: elapsedSRef.current,
        startedAt: new Date(startedAtRef.current).toISOString(),
        route: routeRef.current,
      });
      setPhase('finished');
    } catch {
      setPhase('save-error');
    }
  }

  const polylineCoords: LatLng[] = route.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const distanceKm = distanceM / 1000;
  const kmFloor = Math.floor(distanceKm);
  const kmProgress = distanceKm - kmFloor;
  const startLabel = kmFloor === 0 ? 'התחלה' : `${kmFloor} ק"מ`;

  if (phase === 'requesting') {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (phase === 'denied') {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialIcons name="location-off" size={40} color={colors.textSecondary} />
        <Text style={[styles.deniedTitle, { color: colors.text }]}>צריך גישה למיקום</Text>
        <Text style={[styles.deniedBody, { color: colors.textSecondary }]}>
          RACEON צריך את המיקום שלך כדי לעקוב אחרי המסלול והמרחק שרצת.
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={[styles.settingsButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[Typography.label, { color: colors.onPrimary }]}>פתח הגדרות</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginTop: Spacing.three }}>
          <Text style={[Typography.label, { color: colors.textSecondary }]}>ביטול</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (phase === 'paused') {
    return (
      <SafeAreaView style={[styles.pauseScreen, { backgroundColor: colors.background }]}>
        <Text style={[Typography.headlineLg, { color: colors.primary }]}>הריצה מושהית</Text>
        <Text style={[styles.pauseSubtitle, { color: colors.secondary }]}>
          קח נשימה. הנתונים שלך שמורים. מוכן להמשיך?
        </Text>
        <View style={styles.pauseGrid}>
          <Pressable
            onPress={handleResume}
            style={[styles.resumeButton, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="play-arrow" size={36} color={colors.onPrimary} />
            <Text style={[styles.pauseButtonLabel, { color: colors.onPrimary }]}>המשך</Text>
          </Pressable>
          <Pressable
            onPress={handleFinish}
            style={[
              styles.finishGridButton,
              { backgroundColor: colors.surfaceSelected, borderColor: colors.border },
            ]}
          >
            <MaterialIcons name="stop" size={36} color={colors.text} />
            <Text style={[styles.pauseButtonLabel, { color: colors.text }]}>סיום</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'finished') {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialIcons name="check-circle" size={48} color={colors.primary} />
        <Text style={[Typography.headlineLg, { color: colors.text, marginTop: Spacing.three }]}>
          הריצה נשמרה
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {distanceKm.toFixed(2)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>ק״מ</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatElapsed(elapsedS)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>זמן</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatLivePace(distanceKm, elapsedS)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>/ק״מ</Text>
          </View>
        </View>
        <Pressable onPress={() => router.back()} style={[styles.doneButton, { backgroundColor: colors.primary }]}>
          <Text style={[Typography.label, { color: colors.onPrimary }]}>סיימתי</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {initialRegion && (
        <MapView
          style={[styles.flex, { backgroundColor: colors.background }]}
          initialRegion={{
            latitude: initialRegion.latitude,
            longitude: initialRegion.longitude,
            latitudeDelta: REGION_DELTA,
            longitudeDelta: REGION_DELTA,
          }}
          showsUserLocation
          followsUserLocation={phase === 'running'}
          customMapStyle={DARK_MAP_STYLE}
          userInterfaceStyle="dark"
        >
          {polylineCoords.length > 1 && (
            <Polyline coordinates={polylineCoords} strokeColor={colors.primary} strokeWidth={5} />
          )}
          {polylineCoords.length > 0 && (
            <Marker coordinate={polylineCoords[0]} pinColor={colors.primary} title="התחלה" />
          )}
        </MapView>
      )}

      {/* Minimal top bar during recording — a persistent brand pill next to
          the map is decorative clutter once the run is actually the focus;
          just leave a way out. */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.three }]} pointerEvents="box-none">
        <View style={styles.topBarRow}>
          <View />
          <Pressable
            onPress={handleCancel}
            style={[styles.closeButton, { backgroundColor: colors.surfaceElevated }]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="סגור"
          >
            <MaterialIcons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* One grounded metrics sheet docked to the bottom (distance as the
          hero number, time/pace/elev as a stat row beneath it) rather than
          several small cards floating separately over the map — this is
          the layout convention Strava/other run trackers use. */}
      <SafeAreaView style={styles.sheetWrap} edges={['bottom']} pointerEvents="box-none">
        {(phase === 'ready' || phase === 'running') && (
          <BlurView intensity={60} tint="dark" style={[styles.sheet, { borderColor: colors.glassBorder }]}>
            <View style={styles.heroRow}>
              <Text style={[styles.heroValue, { color: colors.text }]}>{distanceKm.toFixed(2)}</Text>
              <Text style={[styles.heroUnit, { color: colors.textSecondary }]}>ק״מ</Text>
            </View>

            {phase === 'running' && (
              <>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSelected }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${kmProgress * 100}%`, backgroundColor: colors.primary },
                    ]}
                  />
                </View>
                <View style={styles.progressLabelsRow}>
                  <Text style={[styles.progressLabelSmall, { color: `${colors.textSecondary}99` }]}>
                    {startLabel}
                  </Text>
                  <Text style={[styles.progressLabelSmall, { color: `${colors.textSecondary}99` }]}>
                    הבא: {kmFloor + 1} ק״מ
                  </Text>
                </View>

                <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>זמן</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {formatElapsed(elapsedS)}
                    </Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>קצב /ק״מ</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{currentPaceLabel}</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>עלייה</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      +{Math.round(elevationGainM)}m
                    </Text>
                  </View>
                </View>
              </>
            )}

            <View style={styles.controlsRow}>
              {phase === 'ready' && (
                <Pressable onPress={handleStart} style={[styles.startButton, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="play-arrow" size={26} color={colors.onPrimary} />
                  <Text style={[Typography.label, { color: colors.onPrimary }]}>התחל ריצה</Text>
                </Pressable>
              )}
              {phase === 'running' && (
                <View style={styles.pauseButtonWrap}>
                  <PulseRing color={`${colors.primary}55`} />
                  <Pressable
                    onPress={handlePause}
                    style={[styles.pauseButton, { backgroundColor: colors.primary, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6 }]}
                    accessibilityRole="button"
                    accessibilityLabel="השהה"
                  >
                    <MaterialIcons name="pause" size={32} color={colors.onPrimary} />
                  </Pressable>
                </View>
              )}
            </View>
          </BlurView>
        )}

        {phase === 'saving' && (
          <View style={[styles.savingRow, { backgroundColor: colors.surfaceElevated }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.savingText, { color: colors.textSecondary }]}>שומר את הריצה…</Text>
          </View>
        )}
        {phase === 'save-error' && (
          <View style={[styles.savingRow, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.savingText, { color: colors.error }]}>לא הצלחנו לשמור.</Text>
            <Pressable onPress={handleFinish}>
              <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  deniedTitle: { fontFamily: Fonts.headline, fontSize: 20, marginTop: Spacing.two },
  deniedBody: { fontFamily: Fonts.regular, fontSize: 14, textAlign: 'center' },
  settingsButton: {
    marginTop: Spacing.four,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.two,
  },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.three },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    overflow: 'hidden',
  },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: Spacing.one },
  heroValue: {
    fontFamily: Fonts.headlineBlack,
    fontSize: 64,
    lineHeight: 68,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: { fontFamily: Fonts.semiBold, fontSize: 20 },
  progressTrack: {
    marginTop: Spacing.three,
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: Radius.full },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  progressLabelSmall: {
    fontFamily: Fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.five,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 32 },
  statLabel: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: { fontFamily: Fonts.headline, fontSize: 18, fontVariant: ['tabular-nums'] },
  controlsRow: { alignItems: 'center', marginTop: Spacing.five },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    width: '100%',
    borderRadius: Radius.full,
    paddingVertical: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  pauseButtonWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.four,
  },
  savingText: { fontFamily: Fonts.medium, fontSize: 14 },
  pauseScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  pauseSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: Spacing.two,
    marginBottom: Spacing.six,
  },
  pauseGrid: { flexDirection: 'row', gap: Spacing.four, width: '100%', maxWidth: 360 },
  resumeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  finishGridButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.four,
    borderWidth: 1,
  },
  pauseButtonLabel: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.five,
    marginTop: Spacing.four,
    marginBottom: Spacing.five,
  },
  summaryStat: { alignItems: 'center' },
  summaryValue: { fontFamily: Fonts.headlineBlack, fontSize: 22 },
  summaryLabel: { fontFamily: Fonts.medium, fontSize: 12, marginTop: 2 },
  doneButton: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
  },
});
