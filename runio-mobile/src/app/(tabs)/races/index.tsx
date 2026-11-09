import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ShineBorder } from '@/components/ui/ShineBorder';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { fetchRaces, fetchRecentRaces, type Race } from '@/lib/api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function priceLabel(priceUsd: number | null): string {
  return priceUsd == null ? 'חינם' : `$${priceUsd}`;
}

export default function RacesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [races, setRaces] = useState<Race[] | null>(null);
  const [recentRaces, setRecentRaces] = useState<Race[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    // Recent races is best-effort — it fails silently and just leaves the
    // strip empty, since the main list above is the page's actual job.
    fetchRecentRaces()
      .then(setRecentRaces)
      .catch(() => {});
    return fetchRaces()
      .then((data) => {
        setError(false);
        setRaces(data);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    if (!races) return races;
    const q = query.trim().toLowerCase();
    if (!q) return races;
    return races.filter((r) =>
      [r.title.en, r.title.he, String(r.distanceKm), r.priceUsd != null ? String(r.priceUsd) : '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [races, query]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader eyebrow="מעגל עולמי" title="מירוצים זמינים" />

      <ShineBorder
        style={styles.searchShine}
        borderWidth={2}
        duration={6}
        radius={Radius.md}
        contentColor={colors.surface}
      >
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="חפש לפי שם, מרחק או מחיר"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </ShineBorder>

      {error ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            לא ניתן לטעון מירוצים.
          </Text>
          <Pressable onPress={load}>
            <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
          </Pressable>
        </View>
      ) : filtered === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={
            recentRaces.length > 0 ? (
              <View style={styles.recentSection}>
                <Text style={[Typography.label, styles.recentTitle, { color: colors.textSecondary }]}>
                  מירוצים אחרונים
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentList}>
                  {recentRaces.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push({ pathname: '/races/[id]', params: { id: item.id } })}
                      style={[styles.recentCard, { backgroundColor: colors.surfaceElevated }]}
                    >
                      <Image source={{ uri: item.imageUrl }} style={styles.recentImage} />
                      <View style={styles.recentImageOverlay} />
                      <View style={styles.recentBody}>
                        <Text style={[styles.recentCardTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title.he}
                        </Text>
                        <Text style={[styles.recentCardDate, { color: colors.textSecondary }]}>
                          {formatDate(item.startsAt)} · {item.distanceKm} ק״מ
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/races/[id]', params: { id: item.id } })}
            >
              <StarkCard style={styles.card}>
                <View style={styles.imageWrap}>
                  <Image source={{ uri: item.imageUrl }} style={styles.image} />
                  <View style={styles.imageOverlay} />
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{priceLabel(item.priceUsd)}</Text>
                  </View>
                </View>

                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text style={[Typography.headlineMd, styles.title, { color: colors.text }]} numberOfLines={1}>
                      {item.title.he}
                    </Text>
                    <MaterialIcons name="schedule" size={18} color={colors.primary} />
                  </View>

                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.stat}>
                      <Text style={[Typography.eyebrow, styles.statLabel, { color: colors.textSecondary }]}>
                        מרחק
                      </Text>
                      <Text style={[styles.statValue, { color: colors.primary }]}>{item.distanceKm} ק״מ</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={[Typography.eyebrow, styles.statLabel, { color: colors.textSecondary }]}>
                        תאריך
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>{formatDate(item.startsAt)}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={[Typography.eyebrow, styles.statLabel, { color: colors.textSecondary }]}>
                        מחיר
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {priceLabel(item.priceUsd)}
                      </Text>
                    </View>
                  </View>
                </View>
              </StarkCard>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  searchShine: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six * 2, gap: Spacing.three },
  card: { overflow: 'hidden' },
  imageWrap: { height: 160, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1 },
  body: { padding: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { flex: 1 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  stat: { alignItems: 'flex-start', gap: 2 },
  statLabel: {},
  statValue: { fontFamily: Fonts.bold, fontSize: 14 },
  recentSection: { marginTop: Spacing.four },
  recentTitle: { marginBottom: Spacing.two },
  recentList: { gap: Spacing.three, paddingBottom: Spacing.two },
  recentCard: {
    width: 160,
    height: 96,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  recentImage: StyleSheet.absoluteFillObject,
  recentImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  recentBody: { flex: 1, justifyContent: 'flex-end', padding: Spacing.two },
  recentCardTitle: { fontFamily: Fonts.bold, fontSize: 13 },
  recentCardDate: { fontFamily: Fonts.regular, fontSize: 11, marginTop: 2 },
});
