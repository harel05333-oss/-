import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors, useThemeMode } from '@/contexts/ThemeContext';
import { ApiError, fetchRace, type RaceDetail } from '@/lib/api';

// Purely informational — every watch's result still arrives the same way
// (Strava auto-sync or a manual GPX/TCX upload, see races/[id]/index.tsx's
// "How results are recorded" card), regardless of which brand is picked
// here. This just sets expectations before the runner commits.
const WATCH_OPTIONS = [
  { id: 'garmin', label: 'Garmin' },
  { id: 'polar', label: 'Polar' },
  { id: 'coros', label: 'COROS' },
  { id: 'apple', label: 'Apple Watch' },
] as const;

const INTEGRITY_ITEMS = [
  { icon: 'satellite-alt', title: 'איתור GPS פעיל', desc: 'מסלול רציף בלי קפיצות בלתי אפשריות' },
  { icon: 'favorite', title: 'התאמת דופק', desc: 'המאמץ הפיזי חייב להתאים לקצב הריצה' },
  { icon: 'speed', title: 'מהירות הגיונית', desc: 'אף קטע לא מהיר יותר ממה שפיזית אפשרי' },
  { icon: 'fingerprint', title: 'אימות מכשיר', desc: 'מזהה המכשיר הרשום חייב להתאים לריצה' },
] as const;

function priceLabel(priceUsd: number | null): string {
  return priceUsd == null ? 'חינם' : `$${priceUsd}`;
}

export default function RaceRegisterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  const [race, setRace] = useState<RaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWatch, setSelectedWatch] = useState<string>('garmin');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchRace(id)
      .then(setRace)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'לא ניתן לטעון את המירוץ.'));
  }, [id]);

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={[styles.backButton, { backgroundColor: colors.surfaceContainerHigh }]}
        accessibilityRole="button"
        accessibilityLabel="חזרה"
      >
        <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
      </Pressable>
      <View>
        <Text style={[Typography.label, { color: colors.secondary }]}>שלב 1 מתוך 1</Text>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>הרשמה למירוץ</Text>
      </View>
      <View style={styles.stepDots}>
        <View style={[styles.stepDot, { backgroundColor: colors.secondary, shadowColor: colors.secondary }, isDark && styles.stepDotGlow]} />
        <View style={[styles.stepDot, { backgroundColor: colors.surfaceContainerHighest }]} />
        <View style={[styles.stepDot, { backgroundColor: colors.surfaceContainerHighest }]} />
      </View>
    </View>
  );

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {header}
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!race) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {header}

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[colors.heroGradientA, colors.heroGradientB]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, { shadowColor: colors.primaryContainer, shadowOpacity: isDark ? 0.06 : 0.04, shadowRadius: 16 }]}
        >
          <View style={styles.heroBadgeRow}>
            <Text style={[styles.heroBadgeText, { color: colors.secondary, backgroundColor: `${colors.secondary}18` }]}>
              ההרשמה פתוחה
            </Text>
            <View style={[styles.heroPulseDot, { backgroundColor: colors.secondary }]} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.onSurface }]} numberOfLines={1}>
            {race.title.he}
          </Text>
          <View style={styles.heroDateRow}>
            <MaterialIcons name="calendar-today" size={13} color={colors.secondary} />
            <Text style={[styles.heroDate, { color: colors.onSurfaceVariant }]}>
              {new Date(race.startsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · מתחיל ב-
              {new Date(race.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.onSurface }]}>{race.distanceKm} ק״מ</Text>
              <Text style={[Typography.eyebrow, { color: colors.onSurfaceVariant }]}>מרחק</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.secondary }]}>
                {race.participantsCount?.toLocaleString() ?? '—'}
              </Text>
              <Text style={[Typography.eyebrow, { color: colors.onSurfaceVariant }]}>נרשמו</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.onSurface }]}>{priceLabel(race.priceUsd)}</Text>
              <Text style={[Typography.eyebrow, { color: colors.onSurfaceVariant }]}>מחיר</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.sectionCard, { backgroundColor: colors.surfaceContainerLow, marginTop: Spacing.four }]}>
          <View style={styles.sectionCardHeader}>
            <Text style={[Typography.label, { color: colors.onSurfaceVariant }]}>מקור המדידה</Text>
            <View style={styles.encryptedRow}>
              <View style={[styles.encryptedDot, { backgroundColor: colors.primaryContainer }]} />
              <Text style={[styles.encryptedText, { color: colors.primaryContainer }]}>מוצפן</Text>
            </View>
          </View>

          <View style={styles.watchGrid}>
            {WATCH_OPTIONS.map((w) => {
              const active = selectedWatch === w.id;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => setSelectedWatch(w.id)}
                  style={[
                    styles.watchOption,
                    { borderColor: colors.surfaceContainerHighest },
                    active && { borderColor: `${colors.primaryContainer}40`, backgroundColor: `${colors.primaryContainer}12` },
                  ]}
                >
                  <MaterialIcons name="watch" size={20} color={active ? colors.primaryContainer : colors.onSurfaceVariant} />
                  <Text style={[styles.watchLabel, { color: active ? colors.primaryContainer : colors.onSurfaceVariant }]}>
                    {w.label}
                  </Text>
                  {active && <MaterialIcons name="check" size={16} color={colors.primaryContainer} />}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.uploadHint, { backgroundColor: colors.surfaceContainerLowest }]}>
            <MaterialIcons name="upload-file" size={18} color={colors.onSurfaceVariant} />
            <Text style={[styles.telemetryText, { color: colors.onSurfaceVariant }]}>
              או להעלות קובץ GPX/FIT ידנית אחרי הריצה
            </Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <Text style={[Typography.label, { color: colors.onSurfaceVariant, marginBottom: Spacing.three }]}>
            אימות תקינות
          </Text>
          {INTEGRITY_ITEMS.map((item) => (
            <View key={item.title} style={styles.integrityRow}>
              <View style={[styles.integrityIcon, { backgroundColor: colors.surfaceContainerHighest }]}>
                <MaterialIcons name="check" size={16} color={colors.primaryContainer} />
              </View>
              <View style={styles.integrityBody}>
                <Text style={[styles.integrityTitle, { color: colors.onSurface }]}>{item.title}</Text>
                <Text style={[styles.integrityDesc, { color: colors.onSurfaceVariant }]}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.privacyCard, { backgroundColor: `${colors.surfaceContainerLowest}cc` }]}>
          <View style={[styles.privacyIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialIcons name="verified-user" size={18} color={colors.secondary} />
          </View>
          <Text style={[styles.privacyText, { color: colors.onSurfaceVariant }]}>
            <Text style={{ color: colors.onSurface, fontFamily: Fonts.semiBold }}>הבטחת פרטיות: </Text>
            RaceOn לעולם לא משתפת נתוני GPS גולמיים בלי הסכמה מפורשת לכל מירוץ.
          </Text>
        </View>

        <Pressable onPress={() => setAgreed((v) => !v)} style={styles.agreeRow}>
          <View
            style={[
              styles.checkbox,
              { borderColor: colors.outline },
              agreed && { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
            ]}
          >
            {agreed && <MaterialIcons name="check" size={14} color={colors.onPrimary} />}
          </View>
          <Text style={[styles.agreeText, { color: colors.onSurfaceVariant }]}>
            אני מאשר/ת את{' '}
            <Text
              style={{ color: colors.primaryContainer, textDecorationLine: 'underline' }}
              onPress={() =>
                Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/he/terms`)
              }
            >
              תקנון המירוץ
            </Text>{' '}
            ומסכים/ה ש-RaceOn תאמת את נתוני המדידה שלי למניעת רמאויות.
          </Text>
        </Pressable>

        {agreed ? (
          <LinearGradient
            colors={[colors.secondary, colors.primaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.cta, { shadowColor: colors.primaryContainer, shadowOpacity: 0.18, shadowRadius: 14, elevation: 3 }]}
          >
            <Pressable
              onPress={() => router.push({ pathname: '/races/[id]/payment', params: { id: race.id } })}
              style={styles.ctaInner}
            >
              <MaterialIcons name="bolt" size={20} color={colors.onPrimary} />
              <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>המשך לתשלום</Text>
              <Text style={[styles.ctaPrice, { color: colors.onPrimary }]}>{priceLabel(race.priceUsd)}</Text>
            </Pressable>
          </LinearGradient>
        ) : (
          <View style={[styles.cta, { backgroundColor: colors.surfaceContainerHigh }]}>
            <View style={styles.ctaInner}>
              <MaterialIcons name="bolt" size={20} color={colors.outline} />
              <Text style={[styles.ctaLabel, { color: colors.outline }]}>המשך לתשלום</Text>
              <Text style={[styles.ctaPrice, { color: colors.outline }]}>{priceLabel(race.priceUsd)}</Text>
            </View>
          </View>
        )}

        <View style={styles.withdrawRow}>
          <MaterialIcons name="history-edu" size={14} color={colors.onSurfaceVariant} />
          <Text style={[styles.withdrawText, { color: colors.onSurfaceVariant }]}>
            ביטול חינם עד 48 שעות לפני המירוץ
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five },
  errorText: { fontFamily: Fonts.regular, fontSize: 14, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  backButton: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.semiBold, fontSize: 18, marginTop: 2 },
  stepDots: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  stepDot: { width: 20, height: 4, borderRadius: 2 },
  stepDotGlow: { shadowOpacity: 0.3, shadowRadius: 4, elevation: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  heroCard: { padding: Spacing.four, borderRadius: Radius.lg, gap: 4 },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  heroBadgeText: {
    fontFamily: Fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  heroPulseDot: { width: 6, height: 6, borderRadius: Radius.full },
  heroTitle: { fontFamily: Fonts.semiBold, fontSize: 24, letterSpacing: -0.2 },
  heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  heroDate: { fontFamily: Fonts.regular, fontSize: 14 },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.five,
  },
  heroStat: { alignItems: 'center', gap: 4 },
  heroStatValue: { fontFamily: Fonts.labelBold, fontSize: 20, fontWeight: '700' },
  sectionCard: { borderRadius: Radius.lg, padding: Spacing.three, marginTop: Spacing.three },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  encryptedDot: { width: 6, height: 6, borderRadius: Radius.full },
  encryptedText: { fontFamily: Fonts.labelBold, fontSize: 11, letterSpacing: 0.6, fontWeight: '700' },
  watchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  watchOption: {
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  watchLabel: { flex: 1, fontFamily: Fonts.medium, fontSize: 14 },
  uploadHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
  },
  telemetryText: { fontFamily: Fonts.labelBold, fontSize: 11, letterSpacing: 0.3 },
  integrityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, marginBottom: Spacing.three },
  integrityIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  integrityBody: { flex: 1, gap: 2 },
  integrityTitle: { fontFamily: Fonts.semiBold, fontSize: 14 },
  integrityDesc: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 16 },
  privacyCard: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  privacyIcon: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1, fontFamily: Fonts.regular, fontSize: 12, lineHeight: 16 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.four },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  agreeText: { flex: 1, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: Spacing.four,
    height: 56,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  ctaInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  ctaLabel: { fontFamily: Fonts.bold, fontSize: 16 },
  ctaPrice: { fontFamily: Fonts.labelBold, fontSize: 15, fontWeight: '700', marginLeft: Spacing.two },
  withdrawRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.three },
  withdrawText: { fontFamily: Fonts.labelBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '700' },
});
