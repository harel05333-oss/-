import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { fetchStravaRuns, type StravaRun } from '@/lib/api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(distanceKm: number, seconds: number): string {
  if (distanceKm <= 0) return '--:--';
  const paceSecPerKm = seconds / distanceKm;
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/ק"מ`;
}

export default function StravaHistoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [runs, setRuns] = useState<StravaRun[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return fetchStravaRuns()
      .then(setRuns)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title="היסטוריית ריצות מסטראבה" />

      {error ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            לא ניתן היה לטעון את הריצות מסטראבה.
          </Text>
          <Pressable onPress={load}>
            <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
          </Pressable>
        </View>
      ) : !runs ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : runs.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            עדיין אין ריצות בסטראבה.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {runs.map((run) => {
            const hasDeviceData = run.averageHeartrate !== null || run.averageCadence !== null;
            return (
              <Pressable
                key={run.id}
                onPress={() =>
                  router.push({ pathname: '/run-detail', params: { source: 'strava', id: String(run.id) } })
                }
              >
              <StarkCard style={styles.card}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: colors.surfaceSelected }]}>
                    <MaterialIcons name="directions-run" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.body}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {run.name}
                    </Text>
                    <Text style={[styles.date, { color: colors.textSecondary }]}>
                      {formatDate(run.startDate)}
                    </Text>
                  </View>
                  <View style={styles.stats}>
                    <Text style={[styles.distance, { color: colors.text }]}>
                      {run.distanceKm.toFixed(2)} ק"מ
                    </Text>
                    <Text style={[styles.subStat, { color: colors.textSecondary }]}>
                      {formatDuration(run.movingTimeS)} · {formatPace(run.distanceKm, run.movingTimeS)}
                    </Text>
                  </View>
                </View>

                {hasDeviceData && (
                  <View style={[styles.deviceRow, { borderTopColor: colors.border }]}>
                    {run.averageHeartrate !== null && (
                      <View style={styles.deviceStat}>
                        <MaterialIcons name="favorite" size={14} color={colors.error} />
                        <Text style={[styles.deviceStatText, { color: colors.textSecondary }]}>
                          {run.averageHeartrate}
                          {run.maxHeartrate !== null ? ` (מקס' ${run.maxHeartrate})` : ''} bpm
                        </Text>
                      </View>
                    )}
                    {run.averageCadence !== null && (
                      <View style={styles.deviceStat}>
                        <MaterialIcons name="directions-walk" size={14} color={colors.secondary} />
                        <Text style={[styles.deviceStatText, { color: colors.textSecondary }]}>
                          {run.averageCadence} spm
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </StarkCard>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  card: { padding: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  deviceRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  deviceStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deviceStatText: { fontFamily: Fonts.medium, fontSize: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  name: { fontFamily: Fonts.medium, fontSize: 14 },
  date: { fontFamily: Fonts.regular, fontSize: 12 },
  stats: { alignItems: 'flex-end', gap: 2 },
  distance: { fontFamily: Fonts.bold, fontSize: 14 },
  subStat: { fontFamily: Fonts.regular, fontSize: 12 },
});
