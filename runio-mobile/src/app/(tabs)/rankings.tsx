import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { BottomTabInset, Fonts, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { TIER_LABEL_HE } from '@/lib/labels';
import {
  fetchCurrentUser,
  fetchMyWorldRank,
  fetchWorldRankings,
  type CurrentUser,
  type MyWorldRank,
  type RankingScope,
  type Tier,
  type WorldRankEntry,
} from '@/lib/api';

const PAGE_SIZE = 50;

const SCOPES: { id: RankingScope; label: string; icon: 'public' | 'flag' | 'location-city' }[] = [
  { id: 'global', label: 'עולמי', icon: 'public' },
  { id: 'national', label: 'ארצי', icon: 'flag' },
  { id: 'city', label: 'עיר', icon: 'location-city' },
];

export default function RankingsScreen() {
  const colors = useThemeColors();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [rankings, setRankings] = useState<WorldRankEntry[] | null>(null);
  const [myRank, setMyRank] = useState<MyWorldRank | null>(null);
  const [error, setError] = useState(false);
  const [scope, setScope] = useState<RankingScope>('global');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRankings(null);
    setMyRank(null);
    return Promise.all([fetchWorldRankings(scope), fetchMyWorldRank(scope)])
      .then(([ranks, mine]) => {
        setError(false);
        setRankings(ranks);
        setMyRank(mine);
      })
      .catch(() => setError(true));
  }, [scope]);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() clears the old list on purpose so a scope switch shows the spinner
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const podium = rankings?.slice(0, 3) ?? [];
  const rest = rankings?.slice(3, visibleCount) ?? [];
  const hasMore = (rankings?.length ?? 0) > visibleCount;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <TabScreenHeader avatarUrl={user?.avatarUrl} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.five }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryContainer} />
        }
      >
        <View style={styles.titleBlock}>
          <View style={styles.eyebrowRow}>
            <MaterialIcons name="public" size={22} color={colors.surfaceTint} />
            <Text style={[styles.eyebrow, { color: colors.surfaceTint }]}>דירוג חי</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.onSurface }]}>
            דירוג עולמי
          </Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            דירוג בזמן אמת של כל הרצים הרשומים.
          </Text>
        </View>

        <View style={styles.scopeRow}>
          {SCOPES.map((s) => {
            const active = scope === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  setScope(s.id);
                  setVisibleCount(PAGE_SIZE);
                }}
                style={[
                  styles.scopeTab,
                  { backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceContainerHighest },
                  active && {
                    backgroundColor: colors.primaryContainer,
                    borderWidth: 0,
                    shadowColor: colors.primaryContainer,
                  },
                  active && styles.scopeTabGlow,
                ]}
              >
                <MaterialIcons name={s.icon} size={16} color={active ? colors.onPrimary : colors.outline} />
                <Text style={[styles.scopeLabel, { color: active ? colors.onPrimary : colors.onSurfaceVariant }]}>
                  {s.label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.center}>
            <Text style={[styles.helperText, { color: colors.onSurfaceVariant }]}>לא ניתן לטעון את הדירוג.</Text>
            <Pressable onPress={load}>
              <Text style={[styles.retryLabel, { color: colors.primaryContainer }]}>נסה שוב</Text>
            </Pressable>
          </View>
        ) : !rankings || !myRank ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primaryContainer} size="large" />
          </View>
        ) : rankings.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.helperText, { color: colors.onSurfaceVariant }]}>
              אין עדיין נתוני דירוג עבור החשבון שלך.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.podiumRow}>
              {podium[1] && <PodiumAvatar entry={podium[1]} size={64} medal="silver" yOffset={16} />}
              {podium[0] && <PodiumAvatar entry={podium[0]} size={80} medal="gold" yOffset={0} />}
              {podium[2] && <PodiumAvatar entry={podium[2]} size={64} medal="bronze" yOffset={24} />}
            </View>

            <View style={styles.podiumBarsRow}>
              {podium[1] && <PodiumBar label="מקום 2" height={32} color={colors.silver} />}
              {podium[0] && <PodiumBar label="מקום 1" height={48} color={colors.gold} />}
              {podium[2] && <PodiumBar label="מקום 3" height={22} color={colors.bronze} />}
            </View>

            <YourPositionCard myRank={myRank} rankings={rankings} />

            <View style={styles.listHeaderRow}>
              <Text style={[styles.listHeaderLabel, { color: colors.onSurfaceVariant }]}>דירוג מלא</Text>
              <Text style={[styles.listHeaderCount, { color: colors.outline }]}>{rankings.length} רצים</Text>
            </View>

            <View style={styles.list}>
              {rest.map((entry) => (
                <RunnerRow key={entry.rank} entry={entry} />
              ))}

              {hasMore && (
                <Pressable
                  onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  style={[styles.loadMore, { borderColor: colors.glassBorder }]}
                >
                  <Text style={[styles.loadMoreLabel, { color: colors.primaryContainer }]}>
                    טען {PAGE_SIZE} רצים נוספים
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const MEDAL_TOKEN: Record<'gold' | 'silver' | 'bronze', 'gold' | 'silver' | 'bronze'> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
};

function PodiumAvatar({
  entry,
  size,
  medal,
  yOffset,
}: {
  entry: WorldRankEntry;
  size: number;
  medal: 'gold' | 'silver' | 'bronze';
  yOffset: number;
}) {
  const colors = useThemeColors();
  const medalColor = colors[MEDAL_TOKEN[medal]];

  return (
    // marginTop, not transform: translateY — a transform shifts the box
    // visually without the parent reserving space for it, so the 2nd/3rd
    // place avatars (pushed down further than 1st) spilled past podiumRow's
    // bottom edge and overlapped the bars/list underneath it.
    <View style={[styles.podiumItem, { marginTop: yOffset }]}>
      {entry.rank === 1 && <MaterialIcons name="workspace-premium" size={22} color={colors.gold} style={styles.podiumCrown} />}
      <View
        style={[
          styles.podiumRing,
          { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: medalColor, shadowColor: medalColor },
        ]}
      >
        <Avatar uri={entry.avatarUrl} size={size} />
        <View style={[styles.podiumBadge, { backgroundColor: medalColor, borderColor: colors.surface, shadowColor: medalColor }]}>
          <Text style={[styles.podiumBadgeText, { color: colors.surface }]}>{entry.rank}</Text>
        </View>
      </View>
      <Text
        style={[styles.podiumName, { color: colors.onSurface, fontSize: entry.rank === 1 ? 15 : 13 }]}
        numberOfLines={1}
      >
        {entry.name.he}
      </Text>
      <Text style={[styles.podiumPoints, { color: medalColor }]}>{entry.points.toLocaleString()} נק׳</Text>
    </View>
  );
}

function PodiumBar({ label, height, color }: { label: string; height: number; color: string }) {
  return (
    <View style={[styles.podiumBar, { height, backgroundColor: `${color}15`, borderTopColor: `${color}80` }]}>
      <Text style={[styles.podiumBarLabel, { color }]}>{label}</Text>
    </View>
  );
}

function YourPositionCard({ myRank, rankings }: { myRank: MyWorldRank; rankings: WorldRankEntry[] }) {
  const colors = useThemeColors();
  const leader = rankings[0];
  const nextAbove = rankings.find((r) => r.rank === myRank.rank - 1);
  const isLeader = myRank.rank === 1;

  return (
    <View style={styles.yourPositionWrap}>
      <View style={[styles.yourPositionCard, { backgroundColor: `${colors.primaryContainer}0D`, borderColor: `${colors.primaryContainer}33` }]}>
        <View style={[styles.yourPositionRank, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Text style={[styles.yourPositionRankText, { color: colors.primaryContainer }]}>#{myRank.rank}</Text>
        </View>
        <View style={styles.yourPositionBody}>
          <Text style={[styles.yourPositionTitle, { color: colors.onSurface }]}>המיקום שלך</Text>
          <Text style={[styles.yourPositionSub, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            {isLeader
              ? 'מוביל את המקצה 🏆'
              : leader
                ? `${(leader.points - myRank.points).toLocaleString()} נק' מאחורי מקום #1${
                    nextAbove ? ` · ${(nextAbove.points - myRank.points).toLocaleString()} נק' עד מקום #${nextAbove.rank}` : ''
                  }`
                : `${myRank.points.toLocaleString()} נק'`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const TIER_COLOR_TOKEN: Record<Tier, 'gold' | 'silver' | 'bronze' | 'primaryContainer'> = {
  platinum: 'primaryContainer',
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
};

function RunnerRow({ entry }: { entry: WorldRankEntry }) {
  const colors = useThemeColors();
  const medalColor = entry.rank <= 3 ? colors[(['gold', 'silver', 'bronze'] as const)[entry.rank - 1]] : null;
  // `tier`/`isYou` are recent additions to the backend contract — guard
  // against an older deployed API that hasn't shipped them yet so a stale
  // backend degrades to "no tier badge" instead of crashing the whole list
  // (entry.tier.toUpperCase() on undefined previously took down the app).
  const tierColor = entry.tier ? colors[TIER_COLOR_TOKEN[entry.tier]] : null;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: entry.isYou ? `${colors.primaryContainer}14` : colors.surfaceContainer,
          borderColor: entry.isYou ? `${colors.primaryContainer}40` : `${colors.surfaceContainerHighest}80`,
        },
      ]}
    >
      <View style={[styles.rowRankWrap, { backgroundColor: medalColor ? `${medalColor}22` : colors.surfaceContainerHigh }]}>
        <Text style={[styles.rowRankText, { color: medalColor ?? colors.onSurfaceVariant }]}>{entry.rank}</Text>
      </View>

      <Avatar uri={entry.avatarUrl} size={40} style={entry.isYou && { borderWidth: 2, borderColor: `${colors.primaryContainer}80` }} />

      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          <Text style={[styles.rowName, { color: colors.onSurface }]} numberOfLines={1}>
            {entry.name.he}
          </Text>
          {entry.isYou && (
            <View style={[styles.rowTag, { backgroundColor: `${colors.primaryContainer}22` }]}>
              <Text style={[styles.rowTagText, { color: colors.primaryContainer }]}>את/ה</Text>
            </View>
          )}
          {entry.tier && tierColor && (
            <View style={[styles.rowTag, { backgroundColor: `${tierColor}18` }]}>
              <Text style={[styles.rowTagText, { color: tierColor }]}>{TIER_LABEL_HE[entry.tier]}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowSubLine}>
          <Text style={[styles.rowSub, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            {entry.location.he}
          </Text>
        </View>
      </View>

      <View style={styles.rowPointsWrap}>
        <Text style={[styles.rowPoints, { color: entry.isYou ? colors.primaryContainer : colors.onSurface }]}>
          {entry.points.toLocaleString()}
        </Text>
        <Text style={[styles.ptsLabel, { color: colors.outline }]}>נק׳</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  retryLabel: { fontFamily: Fonts.labelBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  content: { paddingHorizontal: Spacing.four },
  titleBlock: { marginTop: Spacing.four, marginBottom: Spacing.four },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: 4 },
  eyebrow: { fontFamily: Fonts.labelBold, fontSize: 10, letterSpacing: 1.2, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontFamily: Fonts.headlineBlack, fontSize: 32, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontFamily: Fonts.regular, fontSize: 14 },
  scopeRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.five },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  scopeTabGlow: { shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  // Hebrew words ("עולמי"/"ארצי"/"עיר"), not numbers — Fonts.mono (Space
  // Grotesk) has no Hebrew glyphs and silently falls back to a system font.
  scopeLabel: { fontFamily: Fonts.labelBold, fontSize: 10, letterSpacing: 1.2 },
  // flex-start, not flex-end: with flex-end a fixed marginTop on a child
  // doesn't visually shift it at all (the child's bottom edge stays pinned
  // to the line's bottom regardless of its own margin) — flex-start is what
  // actually lets each PodiumAvatar's marginTop push it down by yOffset,
  // and lets the row auto-grow to the tallest item instead of overflowing.
  podiumRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: Spacing.three, paddingTop: Spacing.five },
  podiumItem: { alignItems: 'center', gap: 4, width: 100 },
  podiumCrown: { marginBottom: 4 },
  podiumRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  podiumBadge: {
    position: 'absolute',
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  podiumBadgeText: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '800' },
  podiumName: { fontFamily: Fonts.semiBold, marginTop: 10, textAlign: 'center', maxWidth: 90 },
  podiumPoints: { fontFamily: Fonts.labelBold, fontSize: 13, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  podiumBarsRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three, marginTop: -8, marginBottom: Spacing.four },
  podiumBar: { width: 80, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderTopWidth: 2, alignItems: 'center', justifyContent: 'center' },
  podiumBarLabel: { fontFamily: Fonts.labelBold, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  yourPositionWrap: { marginBottom: Spacing.three },
  yourPositionCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: 1 },
  yourPositionRank: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.25, shadowRadius: 6 },
  yourPositionRankText: { fontFamily: Fonts.semiBold, fontSize: 16 },
  yourPositionBody: { flex: 1, gap: 2 },
  yourPositionTitle: { fontFamily: Fonts.semiBold, fontSize: 15 },
  yourPositionSub: { fontFamily: Fonts.labelBold, fontSize: 11 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  listHeaderLabel: { fontFamily: Fonts.labelBold, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  listHeaderCount: { fontFamily: Fonts.labelBold, fontSize: 11, fontWeight: '600' },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: 1 },
  rowRankWrap: { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowRankText: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  rowBody: { flex: 1, gap: 3 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontFamily: Fonts.semiBold, fontSize: 14, flexShrink: 1 },
  rowTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rowTagText: { fontFamily: Fonts.labelBold, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowSub: { fontFamily: Fonts.labelBold, fontSize: 11, fontWeight: '600' },
  rowPointsWrap: { alignItems: 'flex-end' },
  rowPoints: { fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  ptsLabel: { fontFamily: Fonts.labelBold, fontSize: 10, fontWeight: '600' },
  loadMore: { alignItems: 'center', paddingVertical: Spacing.three, marginTop: Spacing.two, borderRadius: Radius.md, borderWidth: 1 },
  loadMoreLabel: { fontFamily: Fonts.labelBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '700' },
});
