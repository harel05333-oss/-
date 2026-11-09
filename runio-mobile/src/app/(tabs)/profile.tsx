import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '@/components/ui/Avatar';
import { StarkCard } from '@/components/ui/StarkCard';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { BottomTabInset, Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { TIER_LABEL_HE } from '@/lib/labels';
import {
  fetchCurrentUser,
  fetchDevices,
  fetchMyRaces,
  fetchMyWorldRank,
  fetchSoloRuns,
  fetchStravaRuns,
  uploadAvatar,
  type ConnectedDevice,
  type CurrentUser,
  type MyRaceRegistration,
  type MyWorldRank,
  type SoloRun,
  type StravaRun,
} from '@/lib/api';

type ActivityRow = {
  id: string;
  rawId: string;
  source: 'app' | 'strava' | 'race';
  name: string;
  date: string;
  distanceKm: number;
  // null for races: registration data has no finish time, only the app's
  // own recorded runs and Strava activities do — never fabricate one.
  durationS: number | null;
};

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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [myRank, setMyRank] = useState<MyWorldRank | null>(null);
  const [myRaces, setMyRaces] = useState<MyRaceRegistration[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    return Promise.all([fetchCurrentUser(), fetchMyWorldRank(), fetchMyRaces(), fetchDevices()])
      .then(([u, rank, races, devices]) => {
        setError(false);
        setUser(u);
        setMyRank(rank);
        setMyRaces(races);
        return loadActivity(races, devices);
      })
      .catch(() => setError(true));
  }, []);

  function loadActivity(races: MyRaceRegistration[], devices: ConnectedDevice[]) {
    const stravaConnected = devices.find((d) => d.provider === 'strava')?.connected ?? false;
    return Promise.all([
      fetchSoloRuns().catch(() => [] as SoloRun[]),
      stravaConnected ? fetchStravaRuns().catch(() => [] as StravaRun[]) : Promise.resolve([] as StravaRun[]),
    ]).then(([solo, strava]) => {
      const rows: ActivityRow[] = [
        ...solo.map((r) => ({
          id: `app-${r.id}`,
          rawId: r.id,
          source: 'app' as const,
          name: 'ריצה מוקלטת',
          date: r.startedAt,
          distanceKm: r.distanceKm,
          durationS: r.durationS,
        })),
        ...strava.map((r) => ({
          id: `strava-${r.id}`,
          rawId: String(r.id),
          source: 'strava' as const,
          name: r.name,
          date: r.startDate,
          distanceKm: r.distanceKm,
          durationS: r.movingTimeS,
        })),
        // Race registrations, past ones only — this feed is a log of what
        // the runner has done, not a to-do list of upcoming races (those
        // already live under My Races). No finish time is tracked here,
        // only that they ran it and at what distance/date.
        ...races
          .filter((reg) => new Date(reg.race.startsAt).getTime() <= Date.now())
          .map((reg) => ({
            id: `race-${reg.raceId}`,
            rawId: reg.raceId,
            source: 'race' as const,
            name: reg.race.title.he,
            date: reg.race.startsAt,
            distanceKm: reg.race.distanceKm,
            durationS: null,
          })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivity(rows.slice(0, 6));
    });
  }

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleChangePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const { avatarUrl } = await uploadAvatar(result.assets[0].uri);
      setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
    } catch {
      // Upload failing is non-fatal — the previous avatar just stays put.
    } finally {
      setUploadingAvatar(false);
    }
  }

  const settingsButton = (
    <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.settingsButton}>
      <MaterialIcons name="settings" size={18} color={colors.primary} />
    </Pressable>
  );

  if (error) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          לא ניתן היה לטעון את הפרופיל שלך.
        </Text>
        <Pressable onPress={load}>
          <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!user || !myRank || !myRaces) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const stats = [
    { label: 'דירוג עולמי', value: `#${myRank.rank}`, icon: 'trending-up' as const },
    { label: 'נקודות', value: myRank.points.toLocaleString(), icon: 'bolt' as const },
    { label: 'דרגה', value: TIER_LABEL_HE[myRank.tier], icon: 'military-tech' as const },
    { label: 'מירוצים', value: String(myRaces.length), icon: 'directions-run' as const },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <TabScreenHeader avatarUrl={user.avatarUrl} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.five }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <StarkCard style={styles.hero}>
          {settingsButton}
          <Pressable onPress={handleChangePhoto} disabled={uploadingAvatar} style={styles.avatarWrap}>
            <Avatar uri={user.avatarUrl} size={88} style={[styles.avatar, { borderColor: colors.primary }]} />
            {uploadingAvatar ? (
              <View style={[styles.avatar, { borderColor: colors.primary }, styles.avatarUploadingOverlay]}>
                <ActivityIndicator color={colors.text} size="small" />
              </View>
            ) : (
              <View style={[styles.editBadge, { borderColor: colors.surfaceElevated, backgroundColor: colors.primary }]}>
                <MaterialIcons name="photo-camera" size={13} color={colors.background} />
              </View>
            )}
          </Pressable>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {user.name}
          </Text>
          <View style={[styles.tierPill, { borderColor: `${colors.primary}4D` }]}>
            <Text style={[styles.tierPillText, { color: colors.primary }]}>ספורטאי דרגת {TIER_LABEL_HE[myRank.tier]}</Text>
          </View>
          <Text style={[styles.email, { color: colors.textSecondary }]}>{user.email}</Text>
        </StarkCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>ביצועים לאורך הקריירה</Text>
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <StarkCard key={stat.label} style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{stat.label}</Text>
                <MaterialIcons name={stat.icon} size={16} color={colors.primary} />
              </View>
              <Text style={[Typography.statValue, { color: colors.primary }]} numberOfLines={1}>
                {stat.value}
              </Text>
            </StarkCard>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>פעילות אחרונה</Text>
        {!activity ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.three }} />
        ) : activity.length === 0 ? (
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            אין עדיין ריצות מוקלטות או פעילות מסטראבה.
          </Text>
        ) : (
          <View style={styles.activityList}>
            {activity.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => {
                  if (a.source === 'race') {
                    router.push(`/races/${a.rawId}`);
                  } else {
                    router.push({ pathname: '/run-detail', params: { source: a.source, id: a.rawId } });
                  }
                }}
              >
                <StarkCard style={styles.activityRow}>
                  <View
                    style={[
                      styles.activityIcon,
                      { backgroundColor: `${colors.primary}1A`, borderColor: `${colors.primary}33` },
                    ]}
                  >
                    <MaterialIcons
                      name={
                        a.source === 'strava'
                          ? 'directions-run'
                          : a.source === 'race'
                            ? 'emoji-events'
                            : 'fiber-manual-record'
                      }
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.activityBody}>
                    <Text style={[styles.activityName, { color: colors.text }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={[styles.activityMeta, { color: colors.textSecondary }]}>
                      {timeAgo(a.date)} · {a.distanceKm.toFixed(2)} ק"מ
                      {a.durationS !== null ? ` · ${formatDuration(a.durationS)}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.activityPace, { color: colors.primary }]}>
                    {a.durationS !== null ? formatPace(a.distanceKm, a.durationS) : 'מירוץ'}
                  </Text>
                </StarkCard>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  hero: {
    alignItems: 'center',
    padding: Spacing.five,
    gap: 4,
    position: 'relative',
  },
  settingsButton: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    padding: 6,
  },
  avatarWrap: { position: 'relative', marginBottom: Spacing.two },
  avatar: {
    borderWidth: 2,
  },
  avatarUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(10,12,16,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: Fonts.headlineBlack, fontSize: 24 },
  tierPill: {
    marginTop: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tierPillText: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  email: { fontFamily: Fonts.medium, fontSize: 13, marginTop: Spacing.two },
  sectionTitle: {
    fontFamily: Fonts.headline,
    fontSize: 18,
    marginTop: Spacing.five,
    marginBottom: Spacing.three,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  statCard: { flexBasis: '46%', flexGrow: 1, padding: Spacing.three, gap: Spacing.two },
  statHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activityList: { gap: Spacing.two },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, gap: Spacing.three },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: { flex: 1, gap: 2 },
  activityName: { fontFamily: Fonts.bold, fontSize: 14 },
  activityMeta: { fontFamily: Fonts.labelBold, fontSize: 10, textTransform: 'uppercase' },
  activityPace: { fontFamily: Fonts.labelBold, fontSize: 12, fontWeight: '700' },
});
