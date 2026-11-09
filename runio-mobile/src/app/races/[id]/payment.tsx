import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Button } from '@/components/ui/Button';
import { ShineBorder } from '@/components/ui/ShineBorder';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { fetchRace, registerForRace, type RaceDetail } from '@/lib/api';

type Phase =
  | { kind: 'loading' }
  | { kind: 'confirm'; race: RaceDetail }
  | { kind: 'registering'; race: RaceDetail }
  | { kind: 'webview'; paymentUrl: string; race: RaceDetail }
  | { kind: 'confirming'; race: RaceDetail }
  | { kind: 'success'; race: RaceDetail }
  | { kind: 'error'; message: string };

const PRE_RACE_CHECKLIST = [
  { icon: 'watch', text: 'ודא/י שהשעון טעון ומסונכרן' },
  { icon: 'satellite-alt', text: 'חיישני GPS ודופק פעילים' },
  { icon: 'sync', text: 'סנכרן/י עם הטלפון אחרי הסיום' },
] as const;

function raceWindowLabel(startsAt: string, windowEndsAt: string | null): string {
  const start = new Date(startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!windowEndsAt) return `מתחיל ${start}`;
  const end = new Date(windowEndsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${start} – ${end}`;
}

const CALLBACK_PATH = '/mobile-payment-callback';
const CONFIRM_POLL_INTERVAL_MS = 1500;
const CONFIRM_POLL_ATTEMPTS = 8;

const INCLUDED_PERKS = [
  'מספר חזה רשמי וצ׳יפ תזמון',
  'כניסה ללוח התוצאות החי',
  'תעודת סיום דיגיטלית',
  'מעקב GPS ביום המירוץ',
];

function priceLabel(priceUsd: number | null): string {
  return priceUsd == null ? 'חינם' : `$${priceUsd}`;
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchRace(id)
      .then((race) => {
        if (cancelled.current) return;
        setPhase({ kind: 'confirm', race });
      })
      .catch((err) => {
        if (cancelled.current) return;
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'משהו השתבש. נסה שוב.',
        });
      });
  }, [id]);

  function handleConfirm(race: RaceDetail) {
    if (!id) return;
    setPhase({ kind: 'registering', race });
    registerForRace(id)
      .then((result) => {
        if (cancelled.current) return;
        if (result.status === 'confirmed' || result.status === 'already_registered') {
          setPhase({ kind: 'success', race });
        } else {
          setPhase({ kind: 'webview', paymentUrl: result.paymentUrl, race });
        }
      })
      .catch((err) => {
        if (cancelled.current) return;
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'משהו השתבש. נסה שוב.',
        });
      });
  }

  function handleDone() {
    if (!id) return;
    // Force the detail screen to remount and re-fetch, picking up the fresh
    // isRegistered: true, rather than showing stale cached state on `back`.
    router.replace({ pathname: '/races/[id]', params: { id } });
  }

  useEffect(() => {
    if (phase.kind !== 'confirming' || !id) return;

    let attempt = 0;
    let stopped = false;

    const poll = async () => {
      attempt += 1;
      try {
        const race = await fetchRace(id);
        if (stopped) return;
        if (race.isRegistered) {
          setPhase({ kind: 'success', race });
          return;
        }
      } catch {
        // transient network hiccup — just retry on the next tick
      }
      if (attempt >= CONFIRM_POLL_ATTEMPTS) {
        // Webhook may simply be slow — let the user leave instead of
        // blocking indefinitely; they can re-check the race afterward.
        setPhase({
          kind: 'error',
          message: 'עדיין מאשרים את התשלום שלך — בדוק/י את המירוץ שוב בעוד רגע.',
        });
        return;
      }
      setTimeout(poll, CONFIRM_POLL_INTERVAL_MS);
    };

    const timer = setTimeout(poll, CONFIRM_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [phase, id]);

  function handleWebViewNavigation(event: WebViewNavigation, race: RaceDetail) {
    if (!event.url.includes(CALLBACK_PATH)) return;
    if (event.url.includes('status=success')) {
      setPhase({ kind: 'confirming', race });
    } else if (event.url.includes('status=cancel')) {
      router.back();
    }
  }

  if (phase.kind === 'webview') {
    const { race } = phase;
    return (
      <View style={[styles.webviewContainer, { backgroundColor: colors.background }]}>
        <SafeAreaView
          style={[styles.webviewHeader, { backgroundColor: colors.surface }]}
          edges={['top', 'left', 'right']}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="סגור"
          >
            <MaterialIcons name="close" size={22} color={colors.text} />
          </Pressable>
        </SafeAreaView>
        <WebView
          source={{ uri: phase.paymentUrl }}
          style={styles.webview}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.includes(CALLBACK_PATH)) {
              if (request.url.includes('status=success')) {
                setPhase({ kind: 'confirming', race });
              } else if (request.url.includes('status=cancel')) {
                router.back();
              }
              return false;
            }
            return true;
          }}
          onNavigationStateChange={(event) => handleWebViewNavigation(event, race)}
        />
      </View>
    );
  }

  if (phase.kind === 'confirm') {
    const { race } = phase;
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.confirmWrap}>
          <ShineBorder duration={4} borderWidth={2}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={[Typography.headlineMd, { color: colors.text }]} numberOfLines={1}>
                  {race.title.he}
                </Text>
                <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="directions-run" size={14} color={colors.onPrimaryContainer} />
                  <Text style={[styles.badgeText, { color: colors.onPrimaryContainer }]}>הרשמה רשמית</Text>
                </View>
              </View>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {race.distanceKm} ק"מ · {new Date(race.startsAt).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>

              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: colors.text }]}>{priceLabel(race.priceUsd)}</Text>
                {race.priceUsd != null && (
                  <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>תשלום חד-פעמי</Text>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.perks}>
                {INCLUDED_PERKS.map((perk) => (
                  <View key={perk} style={styles.perkRow}>
                    <MaterialIcons name="check" size={18} color={colors.primary} />
                    <Text style={[styles.perkText, { color: colors.textSecondary }]}>{perk}</Text>
                  </View>
                ))}
              </View>

              <Button
                label="המשך לתשלום"
                onPress={() => handleConfirm(race)}
                style={styles.confirmButton}
              />
            </View>
          </ShineBorder>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.kind === 'success') {
    const { race } = phase;
    const checklist = [
      { icon: 'schedule' as const, text: `חלון המירוץ: ${raceWindowLabel(race.startsAt, race.windowEndsAt)}` },
      ...PRE_RACE_CHECKLIST,
    ];
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.successWrap}>
          <View
            style={[
              styles.successIconWrap,
              {
                backgroundColor: `${colors.primaryContainer}15`,
                borderWidth: 2,
                borderColor: `${colors.primaryContainer}40`,
                shadowColor: colors.primaryContainer,
                shadowOpacity: 0.12,
                shadowRadius: 20,
                elevation: 3,
              },
            ]}
          >
            <MaterialIcons name="check-circle" size={40} color={colors.primaryContainer} />
          </View>
          <Text style={[Typography.headlineLg, { color: colors.onSurface, textAlign: 'center' }]}>
            המקום שלך שמור
          </Text>
          <Text style={[Typography.label, { color: colors.secondary, marginTop: 8 }]}>
            ההרשמה אושרה
          </Text>
          <Text style={[styles.successSubtitle, { color: colors.onSurfaceVariant }]}>
            ביום המירוץ, פשוט הפעל/י את השעון בתוך חלון הזמן. RaceOn דואגת לשאר.
          </Text>

          <View style={[styles.checklistCard, { backgroundColor: colors.surfaceContainer }]}>
            <Text style={[Typography.eyebrow, styles.checklistLabel, { color: colors.onSurfaceVariant }]}>
              רשימת בדיקה לפני המירוץ
            </Text>
            {checklist.map((item) => (
              <View key={item.text} style={styles.checklistRow}>
                <View
                  style={[
                    styles.checklistIcon,
                    {
                      backgroundColor: colors.surfaceContainerHigh,
                      shadowColor: '#000',
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 2,
                    },
                  ]}
                >
                  <MaterialIcons name={item.icon} size={16} color={colors.primaryContainer} />
                </View>
                <Text style={[styles.checklistText, { color: colors.onSurface }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          <Button label="חזרה לדף המירוץ" onPress={handleDone} variant="neutral" style={styles.doneButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        {(phase.kind === 'loading' || phase.kind === 'registering' || phase.kind === 'confirming') && (
          <>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {phase.kind === 'registering'
                ? 'נרשם/ת…'
                : phase.kind === 'confirming'
                  ? 'מאשרים את ההרשמה שלך…'
                  : 'טוען מירוץ…'}
            </Text>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <Text style={[Typography.headlineMd, { color: colors.text, textAlign: 'center' }]}>
              {phase.message}
            </Text>
            <Button label="סיום" onPress={() => router.back()} style={styles.doneButton} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  statusText: { fontFamily: Fonts.medium, fontSize: 14 },
  doneButton: { marginTop: Spacing.three, minWidth: 160 },
  webviewContainer: { flex: 1 },
  webviewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  webview: { flex: 1 },
  confirmWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  card: { padding: Spacing.four, gap: Spacing.three },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: Fonts.bold, fontSize: 11 },
  cardDescription: { fontFamily: Fonts.regular, fontSize: 14, marginTop: -Spacing.two },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontFamily: Fonts.headlineBlack, fontSize: 40 },
  priceUnit: { fontFamily: Fonts.regular, fontSize: 14 },
  divider: { height: 1 },
  perks: { gap: Spacing.two },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  perkText: { fontFamily: Fonts.regular, fontSize: 14, flex: 1 },
  confirmButton: { marginTop: Spacing.two },
  successWrap: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.five, paddingTop: Spacing.six },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  successSubtitle: { fontFamily: Fonts.regular, fontSize: 14, textAlign: 'center', marginTop: Spacing.two },
  checklistCard: {
    width: '100%',
    borderRadius: Radius.lg,
    padding: Spacing.four,
    marginTop: Spacing.five,
    gap: Spacing.three,
  },
  checklistLabel: { marginBottom: Spacing.one },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  checklistIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistText: { fontFamily: Fonts.medium, fontSize: 14, flex: 1 },
});
