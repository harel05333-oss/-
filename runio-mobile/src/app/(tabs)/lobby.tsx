import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { AppHeader } from '@/components/ui/AppHeader';
import { Avatar } from '@/components/ui/Avatar';
import { StarkCard } from '@/components/ui/StarkCard';
import { useThemeColors, useThemeMode } from '@/contexts/ThemeContext';
import { useLocale, useT } from '@/contexts/LocaleContext';
import { BottomTabInset, Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { raceLevelLabelHe, REGISTRATION_STATUS_LABEL_HE, TIER_LABEL_HE } from '@/lib/labels';
import {
  clearToken,
  fetchCurrentUser,
  fetchDevices,
  fetchFriends,
  fetchMyRaces,
  fetchMyStats,
  fetchMyWorldRank,
  fetchNotifications,
  fetchRaces,
  fetchRecentSessions,
  type ConnectedDevice,
  type CurrentUser,
  type Friend,
  type MyRaceRegistration,
  type MyStats,
  type MyWorldRank,
  type Race,
  type RecentSession,
} from '@/lib/api';

const REGISTRATION_STATUS_LABEL_EN: Record<'confirmed' | 'pending' | 'waitlisted', string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  waitlisted: 'Waitlisted',
};

const TIER_LABEL_EN: Record<'bronze' | 'silver' | 'gold' | 'platinum', string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

function raceLevelLabelEn(distanceKm: number): string {
  if (distanceKm >= 30) return 'Elite';
  if (distanceKm >= 10) return 'Pro';
  return 'Open';
}

const strings = {
  he: {
    liveNow: 'בשידור חי',
    nextRace: 'המירוץ הבא',
    windowClosesIn: (days: number, hms: string) => `החלון נסגר בעוד ${days > 0 ? `${days} ימים ` : ''}${hms}`,
    days: 'ימים',
    hours: 'שעות',
    minutes: "דק'",
    seconds: "שנ'",
    season: 'עונה 04 של RACEON',
    greeting: (name: string) => `שלום, ${name}`,
    nextRaceStarts: (date: string) => `המירוץ הבא שלך מתחיל ב-${date}`,
    tierPrefix: (tier: string) => `דרגת ${tier}`,
    rank: 'דירוג',
    points: 'נקודות',
    toNextTier: (tier: string) => `עד ${tier}`,
    streakWeeks: (n: number) => `רצף של ${n} שבועות`,
    streakHint: 'רוץ כל שבוע כדי לשמור על הרצף',
    races: 'מירוצים',
    podiums: 'מקומות פרס',
    avgPace: 'קצב ממוצע',
    myRaces: 'המירוצים שלך',
    browseAll: 'עיין בהכל',
    noRacesYet: 'עדיין לא נרשמת למירוץ.',
    browseRaces: 'עיין במירוצים',
    bibNumber: (n: string) => `מספר חזה ${n}`,
    recentActivity: 'פעילות אחרונה',
    placeOutOf: (place: number, total: number) => `מקום #${place} מתוך ${total}`,
    friends: 'חברים',
    seeAll: 'ראה הכל',
    addFriendsHint: 'הוסף חברים כדי לצ׳וטט ולהזמין אותם למירוצים.',
    addFriend: 'הוסף חבר',
    add: 'הוסף',
    upcomingRaces: 'מירוצים קרובים',
    viewAll: 'צפה בהכל ←',
    registrationOpen: 'ההרשמה פתוחה',
    free: 'חינם',
    kmSuffix: 'ק"מ',
    stravaConnected: 'סטראבה מחובר',
    stravaNotConnected: 'סטראבה לא מחובר',
    stravaConnectedHint: ' · סנכרון אוטומטי לצורך אישור מירוצים',
    stravaNotConnectedHint: ' · התחבר כדי לזהות תוצאות מירוץ אוטומטית',
    sessionExpired: 'החיבור פג תוקף.',
    signInAgain: 'התחבר מחדש',
  },
  en: {
    liveNow: 'LIVE NOW',
    nextRace: 'Next Race',
    windowClosesIn: (days: number, hms: string) => `Window closes in ${days > 0 ? `${days}d ` : ''}${hms}`,
    days: 'days',
    hours: 'hours',
    minutes: 'min',
    seconds: 'sec',
    season: 'RACEON Season 04',
    greeting: (name: string) => `Hi, ${name}`,
    nextRaceStarts: (date: string) => `Your next race starts on ${date}`,
    tierPrefix: (tier: string) => `${tier} Tier`,
    rank: 'Rank',
    points: 'Points',
    toNextTier: (tier: string) => `To ${tier}`,
    streakWeeks: (n: number) => `${n}-week streak`,
    streakHint: 'Run every week to keep your streak alive',
    races: 'Races',
    podiums: 'Podiums',
    avgPace: 'Avg Pace',
    myRaces: 'Your Races',
    browseAll: 'Browse All',
    noRacesYet: "You haven't registered for a race yet.",
    browseRaces: 'Browse Races',
    bibNumber: (n: string) => `Bib #${n}`,
    recentActivity: 'Recent Activity',
    placeOutOf: (place: number, total: number) => `#${place} of ${total}`,
    friends: 'Friends',
    seeAll: 'See All',
    addFriendsHint: 'Add friends to chat and invite them to races.',
    addFriend: 'Add Friend',
    add: 'Add',
    upcomingRaces: 'Upcoming Races',
    viewAll: 'View All ←',
    registrationOpen: 'Registration Open',
    free: 'Free',
    kmSuffix: 'km',
    stravaConnected: 'Strava Connected',
    stravaNotConnected: 'Strava Not Connected',
    stravaConnectedHint: ' · Auto-sync for race verification',
    stravaNotConnectedHint: ' · Connect to auto-detect race results',
    sessionExpired: 'Your session has expired.',
    signInAgain: 'Sign In Again',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWindowTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Same fallback the backend uses for a race with no explicit window end
// (see raceStatus() in v-racer's data.ts) — kept in sync by hand.
function raceEndMs(startsAt: string, distanceKm: number, windowEndsAt: string | null): number {
  if (windowEndsAt) return new Date(windowEndsAt).getTime();
  return new Date(startsAt).getTime() + Math.max(2, distanceKm * 0.12) * 60 * 60 * 1000;
}

// Nearest registered race that hasn't ended yet — covers both "starts in
// 3 days" and "started 20 minutes ago, still running" (shown as LIVE).
function findNextRace(myRaces: MyRaceRegistration[], now: number): MyRaceRegistration | null {
  const active = myRaces.filter(
    (r) => raceEndMs(r.race.startsAt, r.race.distanceKm, r.race.windowEndsAt) > now
  );
  active.sort((a, b) => new Date(a.race.startsAt).getTime() - new Date(b.race.startsAt).getTime());
  return active[0] ?? null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function CountdownCard({ registration, router }: { registration: MyRaceRegistration; router: ReturnType<typeof useRouter> }) {
  const colors = useThemeColors();
  const { locale } = useLocale();
  const t = useT(strings);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(registration.race.startsAt).getTime();
  const endMs = raceEndMs(registration.race.startsAt, registration.race.distanceKm, registration.race.windowEndsAt);
  const isLive = now >= startMs && now < endMs;
  const diffS = Math.max(0, Math.floor(((isLive ? endMs : startMs) - now) / 1000));
  const days = Math.floor(diffS / 86400);
  const hours = Math.floor((diffS % 86400) / 3600);
  const minutes = Math.floor((diffS % 3600) / 60);
  const seconds = diffS % 60;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/races/[id]', params: { id: registration.raceId } })}
    >
      <StarkCard emphasized style={styles.countdownCard}>
        <View style={styles.countdownHeader}>
          <MaterialIcons name={isLive ? 'sensors' : 'schedule'} size={16} color={colors.primary} />
          <Text style={[Typography.label, { color: colors.primary }]}>
            {isLive ? t.liveNow : t.nextRace}
          </Text>
        </View>
        <Text style={[Typography.headlineMd, { color: colors.text }]} numberOfLines={1}>
          {registration.race.title[locale]}
        </Text>
        {isLive ? (
          <Text style={[styles.countdownLiveText, { color: colors.primary }]}>
            {t.windowClosesIn(days, `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)}
          </Text>
        ) : (
          <View style={styles.countdownRow}>
            {days > 0 && (
              <View style={styles.countdownUnit}>
                <Text style={[styles.countdownValue, { color: colors.text }]}>{days}</Text>
                <Text style={[styles.countdownLabel, { color: colors.textSecondary }]}>{t.days}</Text>
              </View>
            )}
            <View style={styles.countdownUnit}>
              <Text style={[styles.countdownValue, { color: colors.text }]}>{pad(hours)}</Text>
              <Text style={[styles.countdownLabel, { color: colors.textSecondary }]}>{t.hours}</Text>
            </View>
            <View style={styles.countdownUnit}>
              <Text style={[styles.countdownValue, { color: colors.text }]}>{pad(minutes)}</Text>
              <Text style={[styles.countdownLabel, { color: colors.textSecondary }]}>{t.minutes}</Text>
            </View>
            <View style={styles.countdownUnit}>
              <Text style={[styles.countdownValue, { color: colors.text }]}>{pad(seconds)}</Text>
              <Text style={[styles.countdownLabel, { color: colors.textSecondary }]}>{t.seconds}</Text>
            </View>
          </View>
        )}
      </StarkCard>
    </Pressable>
  );
}

export default function LobbyScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const { locale } = useLocale();
  const t = useT(strings);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [myRank, setMyRank] = useState<MyWorldRank | null>(null);
  const [myRaces, setMyRaces] = useState<MyRaceRegistration[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [newRaces, setNewRaces] = useState<Race[]>([]);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [strava, setStrava] = useState<ConnectedDevice | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(() => {
    return Promise.all([fetchCurrentUser(), fetchMyWorldRank(), fetchMyRaces()])
      .then(([u, rank, races]) => {
        setError(false);
        setUser(u);
        setMyRank(rank);
        setMyRaces(races);
      })
      .catch(() => setError(true));
  }, []);

  const loadNewRaces = useCallback(() => {
    // Best-effort, same as friends/notifications below — a hiccup here
    // shouldn't block the rest of the lobby from loading.
    return fetchRaces()
      .then((races) => setNewRaces(races.slice(0, 6)))
      .catch(() => setNewRaces([]));
  }, []);

  const loadNotifications = useCallback(() => {
    return fetchNotifications()
      .then((items) => setUnreadCount(items.filter((n) => !n.read).length))
      .catch(() => setUnreadCount(0));
  }, []);

  const loadFriends = useCallback(() => {
    return fetchFriends().then(setFriends).catch(() => setFriends([]));
  }, []);

  const loadStatsAndDevices = useCallback(() => {
    return Promise.all([
      fetchMyStats().then(setStats).catch(() => setStats(null)),
      fetchRecentSessions().then(setRecentSessions).catch(() => setRecentSessions([])),
      fetchDevices()
        .then((devices) => setStrava(devices.find((d) => d.provider === 'strava') ?? null))
        .catch(() => setStrava(null)),
    ]);
  }, []);

  useEffect(() => {
    loadNewRaces();
  }, [loadNewRaces]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), loadNewRaces(), loadNotifications(), loadFriends(), loadStatsAndDevices()]);
    setRefreshing(false);
  }

  // Drives which registered race counts as "next" — myRaces itself only
  // needs to change on pull-to-refresh, but a race can flip from upcoming
  // to live (or live to ended) without any refetch, so re-check periodically.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    loadStatsAndDevices();
  }, [loadStatsAndDevices]);

  async function handleSignOut() {
    await clearToken();
    router.replace('/sign-in');
  }

  if (error) {
    // Most likely cause: stored token expired/invalid — bounce back to sign-in.
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>{t.sessionExpired}</Text>
        <Pressable onPress={handleSignOut}>
          <Text style={[Typography.label, { color: colors.primary }]}>{t.signInAgain}</Text>
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

  const nextRace = findNextRace(myRaces, nowTick);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <AppHeader avatarUrl={user.avatarUrl} unreadCount={unreadCount} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.five }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.greetingRow}>
          <View style={styles.greetingBody}>
            <Text style={[Typography.label, { color: colors.surfaceTint }]}>{t.season}</Text>
            <Text accessibilityRole="header" style={[styles.greetingTitle, { color: colors.onSurface }]}>
              {t.greeting(user.name)}
            </Text>
            {nextRace && (
              <Text style={[styles.greetingSubtitle, { color: colors.onSurfaceVariant }]}>
                {t.nextRaceStarts(formatDate(nextRace.race.startsAt))}
              </Text>
            )}
          </View>
          {stats && (
            <View
              style={[
                styles.eloBadge,
                {
                  backgroundColor: colors.surfaceContainerHigh,
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 2,
                },
              ]}
            >
              <Text style={[Typography.eyebrow, { color: colors.primaryContainer }]}>ELO</Text>
              <Text style={[styles.eloValue, { color: colors.onSurface }]}>{stats.elo}</Text>
            </View>
          )}
        </View>

        <StarkCard emphasized style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Avatar uri={user.avatarUrl} size={56} />
            <View style={styles.profileBody}>
              <Text style={[Typography.headlineMd, { color: colors.text }]} numberOfLines={1}>
                {user.name}
              </Text>
              <Text style={[Typography.label, { color: colors.textSecondary }]}>
                {t.tierPrefix(locale === 'he' ? TIER_LABEL_HE[myRank.tier] : TIER_LABEL_EN[myRank.tier])}
              </Text>
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.stat}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.rank}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>#{myRank.rank}</Text>
            </View>
            <View style={[styles.stat, styles.statDivider, { borderColor: colors.border }]}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.points}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {myRank.points.toLocaleString()}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>
                {t.toNextTier(locale === 'he' ? TIER_LABEL_HE[myRank.nextTier] : TIER_LABEL_EN[myRank.nextTier])}
              </Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {myRank.pointsToNextTier.toLocaleString()}
              </Text>
            </View>
          </View>
        </StarkCard>

        {stats && (
          <StarkCard style={styles.statsCard}>
            <View style={styles.streakRow}>
              <View style={[styles.streakIcon, { backgroundColor: colors.surfaceSelected }]}>
                <Text style={styles.streakEmoji}>🔥</Text>
              </View>
              <View style={styles.streakBody}>
                <Text style={[Typography.headlineMd, { color: colors.text }]}>
                  {t.streakWeeks(stats.streak)}
                </Text>
                <Text style={[styles.streakHint, { color: colors.textSecondary }]}>
                  {t.streakHint}
                </Text>
              </View>
            </View>

            <View style={[styles.statsGrid, { backgroundColor: colors.surface }]}>
              <View style={styles.gridCell}>
                <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.races}</Text>
                <Text style={[styles.gridValue, { color: colors.text }]}>{stats.races}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.podiums}</Text>
                <Text style={[styles.gridValue, { color: colors.primary }]}>{stats.podiums}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.rank}</Text>
                <Text style={[styles.gridValue, { color: colors.text }]}>#{stats.rank}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.avgPace}</Text>
                <Text style={[styles.gridValue, { color: colors.text }]}>{stats.avgPace}</Text>
              </View>
            </View>
          </StarkCard>
        )}

        {nextRace && <CountdownCard registration={nextRace} router={router} />}

        <View style={styles.sectionHeader}>
          <Text style={[Typography.label, { color: colors.textSecondary }]}>המירוצים שלך</Text>
          <Pressable onPress={() => router.push('/races')} hitSlop={8} style={styles.sectionLink}>
            <Text style={[Typography.label, { color: colors.text }]}>עיין בהכל</Text>
            <MaterialIcons name="arrow-forward" size={14} color={colors.text} />
          </Pressable>
        </View>

        {myRaces.length === 0 ? (
          <Pressable onPress={() => router.push('/races')}>
            <StarkCard style={styles.emptyRaces}>
              <Text style={[styles.emptyRacesText, { color: colors.textSecondary }]}>
                עדיין לא נרשמת למירוץ.
              </Text>
              <View style={styles.sectionLink}>
                <Text style={[Typography.label, { color: colors.text }]}>עיין במירוצים</Text>
                <MaterialIcons name="arrow-forward" size={14} color={colors.text} />
              </View>
            </StarkCard>
          </Pressable>
        ) : (
          myRaces.map((reg) => (
            <Pressable
              key={reg.raceId}
              onPress={() => router.push({ pathname: '/races/[id]', params: { id: reg.raceId } })}
            >
              <StarkCard style={styles.raceCard}>
                <Image source={{ uri: reg.race.imageUrl }} style={styles.raceImage} />
                <View style={styles.raceBody}>
                  <Text style={[Typography.label, { color: colors.text }]} numberOfLines={1}>
                    {reg.race.title.he}
                  </Text>
                  <Text style={[styles.raceMeta, { color: colors.textSecondary }]}>
                    {formatDate(reg.race.startsAt)} · מספר חזה {reg.bibNumber}
                  </Text>
                </View>
                <Text style={[styles.raceStatus, { color: colors.textSecondary }]}>
                  {locale === 'he' ? REGISTRATION_STATUS_LABEL_HE[reg.status] : REGISTRATION_STATUS_LABEL_EN[reg.status]}
                </Text>
              </StarkCard>
            </Pressable>
          ))
        )}

        {recentSessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderIconRow}>
                <MaterialIcons name="route" size={20} color={colors.surfaceTint} />
                <Text style={[Typography.label, { color: colors.textSecondary }]}>פעילות אחרונה</Text>
              </View>
            </View>
            {recentSessions.map((session) => (
              <Pressable
                key={session.raceId}
                onPress={() => router.push({ pathname: '/races/[id]', params: { id: session.raceId } })}
              >
                <StarkCard style={styles.sessionCard}>
                  <View style={[styles.sessionIcon, { backgroundColor: colors.surfaceSelected }]}>
                    {session.place <= 3 ? (
                      <Text style={styles.sessionMedal}>{['🥇', '🥈', '🥉'][session.place - 1]}</Text>
                    ) : (
                      <MaterialIcons name="directions-run" size={22} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.sessionBody}>
                    <View style={styles.sessionTitleRow}>
                      <Text style={[styles.sessionTitle, { color: colors.text }]} numberOfLines={1}>
                        {session.title.he}
                      </Text>
                      {session.verified && (
                        <MaterialIcons name="verified" size={14} color={colors.primary} />
                      )}
                    </View>
                    <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
                      {session.distanceKm} ק״מ · {formatDate(session.startsAt)} · מקום #{session.place} מתוך{' '}
                      {session.total}
                    </Text>
                  </View>
                  <Text style={[styles.sessionPace, { color: colors.primary }]}>{session.paceLabel}</Text>
                </StarkCard>
              </Pressable>
            ))}
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[Typography.label, { color: colors.textSecondary }]}>חברים</Text>
          <Pressable onPress={() => router.push('/friends')} hitSlop={8} style={styles.sectionLink}>
            <Text style={[Typography.label, { color: colors.text }]}>ראה הכל</Text>
            <MaterialIcons name="arrow-forward" size={14} color={colors.text} />
          </Pressable>
        </View>

        {friends === null ? null : friends.length === 0 ? (
          <Pressable onPress={() => router.push('/friends')}>
            <StarkCard style={styles.emptyRaces}>
              <Text style={[styles.emptyRacesText, { color: colors.textSecondary }]}>
                הוסף חברים כדי לצ׳וטט ולהזמין אותם למירוצים.
              </Text>
              <View style={styles.sectionLink}>
                <Text style={[Typography.label, { color: colors.text }]}>הוסף חבר</Text>
                <MaterialIcons name="arrow-forward" size={14} color={colors.text} />
              </View>
            </StarkCard>
          </Pressable>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendsRow}>
            {friends.map((f) => (
              <Pressable
                key={f.id}
                style={styles.friendItem}
                onPress={() =>
                  router.push({
                    pathname: '/chat/[friendId]',
                    params: { friendId: f.id, name: f.name, avatarUrl: f.avatarUrl },
                  })
                }
              >
                <Image source={{ uri: f.avatarUrl }} style={styles.friendAvatar} />
                <Text style={[styles.friendName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {f.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.friendItem} onPress={() => router.push('/friends')}>
              <View style={[styles.friendAddButton, { borderColor: colors.border }]}>
                <MaterialIcons name="add" size={22} color={colors.textSecondary} />
              </View>
              <Text style={[styles.friendName, { color: colors.textSecondary }]}>הוסף</Text>
            </Pressable>
          </ScrollView>
        )}

        {newRaces.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderIconRow}>
                <MaterialIcons name="emoji-events" size={20} color={colors.primary} />
                <Text style={[Typography.label, { color: colors.textSecondary }]}>מירוצים קרובים</Text>
              </View>
              <Pressable onPress={() => router.push('/races')} hitSlop={8} style={styles.sectionLink}>
                <Text style={[Typography.label, { color: colors.primary }]}>צפה בהכל ←</Text>
              </Pressable>
            </View>
            <View style={{ gap: Spacing.three }}>
              {newRaces.map((race, index) => {
                const tier = locale === 'he' ? raceLevelLabelHe(race.distanceKm) : raceLevelLabelEn(race.distanceKm);
                return (
                  <Pressable
                    key={race.id}
                    onPress={() => router.push({ pathname: '/races/[id]', params: { id: race.id } })}
                    style={[
                      styles.upcomingCard,
                      { backgroundColor: colors.surfaceElevated },
                      mode === 'light' && { borderWidth: 1, borderColor: colors.border },
                      index === 0 && styles.upcomingCardFeatured,
                      index === 0 &&
                        (mode === 'dark'
                          ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 3 }
                          : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 }),
                    ]}
                  >
                    <View style={styles.upcomingTopRow}>
                      <View style={styles.upcomingBadgeRow}>
                        <Text style={[styles.upcomingBadge, { color: colors.secondary }]}>
                          ההרשמה פתוחה
                        </Text>
                        <View style={[styles.livePulseDot, { backgroundColor: colors.secondary }]} />
                      </View>
                      <Text style={[styles.upcomingTitle, { color: colors.text }]} numberOfLines={1}>
                        {race.title.he}
                      </Text>
                      <View style={styles.upcomingDateRow}>
                        <MaterialIcons name="calendar-today" size={14} color={colors.secondary} />
                        <Text style={[styles.upcomingDate, { color: colors.textSecondary }]}>
                          {new Date(race.startsAt).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {formatWindowTime(race.startsAt)}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.upcomingTierBox, { backgroundColor: colors.surfaceSelected }]}>
                      <Text style={[styles.upcomingTierLabel, { color: colors.primary }]}>{tier}</Text>
                      <Text style={[styles.upcomingTierValue, { color: colors.text }]}>
                        {race.distanceKm} ק״מ
                      </Text>
                    </View>

                    <View style={[styles.upcomingTelemetryRow, { borderTopColor: colors.border }]}>
                      {race.participantsCount != null && (
                        <>
                          <View style={styles.upcomingTelemetryItem}>
                            <MaterialIcons name="groups" size={14} color={colors.secondary} />
                            <Text style={[styles.upcomingTelemetryText, { color: colors.textSecondary }]}>
                              {race.participantsCount.toLocaleString()}
                            </Text>
                          </View>
                          <View style={[styles.telemetryDot, { backgroundColor: colors.textSecondary }]} />
                        </>
                      )}
                      <View style={styles.upcomingTelemetryItem}>
                        <Text style={[styles.upcomingTelemetryText, { color: colors.textSecondary }]}>
                          {formatDate(race.startsAt)}
                        </Text>
                      </View>
                      <View style={[styles.upcomingEntryPill, { backgroundColor: colors.surfaceSelected }]}>
                        <Text style={[styles.upcomingEntryText, { color: colors.primary }]}>
                          {race.priceUsd == null ? 'חינם' : `$${race.priceUsd}`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {strava && (
          <Pressable onPress={() => router.push(strava.connected ? '/strava-history' : '/connect-strava')}>
            <StarkCard style={styles.stravaBanner}>
              <View style={[styles.stravaIcon, { backgroundColor: colors.surfaceSelected }]}>
                <MaterialIcons
                  name="verified-user"
                  size={18}
                  color={strava.connected ? colors.primary : colors.textSecondary}
                />
              </View>
              <Text style={[styles.stravaText, { color: colors.textSecondary }]}>
                <Text style={{ color: colors.text, fontFamily: Fonts.semiBold }}>
                  {strava.connected ? 'סטראבה מחובר' : 'סטראבה לא מחובר'}
                </Text>
                {strava.connected
                  ? ' · סנכרון אוטומטי לצורך אישור מירוצים'
                  : ' · התחבר כדי לזהות תוצאות מירוץ אוטומטית'}
              </Text>
              {strava.connected && <View style={[styles.stravaDot, { backgroundColor: colors.primary }]} />}
            </StarkCard>
          </Pressable>
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
  errorText: { fontFamily: Fonts.medium, fontSize: 16 },
  content: { paddingHorizontal: Spacing.four },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    marginBottom: Spacing.three,
  },
  greetingBody: { flex: 1, gap: 2, paddingRight: Spacing.two },
  greetingTitle: { fontFamily: Fonts.headlineBlack, fontSize: 32, letterSpacing: -0.5, marginTop: 4 },
  greetingSubtitle: { fontFamily: Fonts.regular, fontSize: 14, marginTop: 4 },
  profileCard: { padding: Spacing.three },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  profileBody: { flex: 1, gap: 2 },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { borderLeftWidth: 1, borderRightWidth: 1 },
  statValue: { fontFamily: Fonts.bold, fontSize: 15 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emptyRaces: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyRacesText: { fontFamily: Fonts.regular, fontSize: 14, textAlign: 'center' },
  raceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  raceImage: { width: 48, height: 48, borderRadius: Radius.sm },
  raceBody: { flex: 1, gap: 2 },
  raceMeta: { fontFamily: Fonts.regular, fontSize: 12 },
  raceStatus: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1 },
  friendsRow: { flexGrow: 0 },
  friendItem: { alignItems: 'center', gap: 4, marginRight: Spacing.three, width: 60 },
  friendAvatar: { width: 52, height: 52, borderRadius: Radius.full },
  friendAddButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: { fontFamily: Fonts.regular, fontSize: 12, textAlign: 'center' },
  countdownCard: { marginTop: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  countdownHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countdownRow: { flexDirection: 'row', gap: Spacing.four, marginTop: 2 },
  countdownUnit: { alignItems: 'center', gap: 2 },
  countdownValue: { fontFamily: Fonts.mono, fontSize: 28, fontVariant: ['tabular-nums'] },
  countdownLabel: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  countdownLiveText: { fontFamily: Fonts.labelBold, fontSize: 16, fontVariant: ['tabular-nums'] },
  sectionHeaderIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upcomingCard: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  upcomingCardFeatured: {
    shadowOffset: { width: 0, height: 0 },
  },
  upcomingTopRow: { gap: 4 },
  upcomingBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upcomingBadge: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  upcomingTitle: { fontFamily: Fonts.semiBold, fontSize: 18 },
  upcomingDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upcomingDate: { fontFamily: Fonts.regular, fontSize: 12 },
  upcomingTierBox: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 56,
  },
  upcomingTierLabel: { fontFamily: Fonts.labelBold, fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  upcomingTierValue: { fontFamily: Fonts.labelBold, fontSize: 13, fontWeight: '700', marginTop: 2 },
  upcomingTelemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  upcomingTelemetryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upcomingTelemetryText: { fontFamily: Fonts.labelBold, fontSize: 11, letterSpacing: 0.3 },
  telemetryDot: { width: 3, height: 3, borderRadius: Radius.full },
  upcomingEntryPill: {
    marginLeft: 'auto',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  upcomingEntryText: { fontFamily: Fonts.labelBold, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statsCard: { marginTop: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  streakIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakEmoji: { fontSize: 20 },
  streakBody: { flex: 1, gap: 2 },
  streakHint: { fontFamily: Fonts.regular, fontSize: 12 },
  eloBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  eloValue: { fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700' },
  statsGrid: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: Spacing.two,
  },
  gridCell: { flex: 1, alignItems: 'center', gap: 4 },
  gridValue: { fontFamily: Fonts.semiBold, fontSize: 16 },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionMedal: { fontSize: 20 },
  sessionBody: { flex: 1, gap: 2 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sessionTitle: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 14 },
  sessionMeta: { fontFamily: Fonts.regular, fontSize: 12 },
  sessionPace: { fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700' },
  stravaBanner: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  stravaIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stravaText: { flex: 1, fontFamily: Fonts.regular, fontSize: 12, lineHeight: 16 },
  stravaDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
});
