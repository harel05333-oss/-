import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { useLocale, useT } from '@/contexts/LocaleContext';
import { ApiError, fetchRace, uploadRaceResult, type RaceDetail } from '@/lib/api';

const strings = {
  he: {
    loadError: 'לא ניתן לטעון את המירוץ.',
    retry: 'נסה שוב',
    startsAt: (window: string) => `מתחיל ב-${window}`,
    distance: 'מרחק',
    timeWindow: 'חלון זמן',
    price: 'מחיר',
    free: 'חינם',
    windowHint:
      'אפשר להתחיל בכל רגע בתוך החלון הזה, לפי השעון האישי שלך — התוצאות נשארות מוסתרות עד שהחלון נסגר, כדי שלכולם יהיה סיכוי הוגן.',
    participants: (count: number) => `${count} רצים רשומים`,
    about: 'על המירוץ',
    registered: 'נרשמת למירוץ הזה',
    howItWorks: 'איך התוצאות נרשמות',
    howItWorksBody:
      'פשוט לרוץ — בלי צורך בטלפון. אם השעון שלך מסתנכרן עם סטראבה, אנחנו נזהה את הריצה אוטומטית ברגע שהיא עולה לשם במהלך חלון המירוץ, ונקליט את הזמן הרשמי שלך. אין סטראבה? אפשר לייצא את קובץ ה-GPX או ה-TCX מהאפליקציה של השעון ולהעלות אותו למטה במקום.',
    uploading: 'מעלה…',
    uploadPrompt: 'אין סטראבה? אפשר להעלות קובץ GPX / TCX במקום',
    joinRace: 'הרשמה למירוץ',
    resultRecorded: 'התוצאה נקלטה!',
    resultSummary: (km: string, time: string) => `${km} ק"מ ב-${time}`,
    uploadFailed: 'ההעלאה נכשלה',
    uploadFailedFallback: 'לא הצלחנו לעבד את הקובץ. נסה שוב.',
    uploadErrors: {
      notRegistered: 'לא נרשמת למירוץ הזה.',
      alreadyRecorded: 'כבר נקלטה תוצאה למירוץ הזה.',
      invalid: 'זה לא נראה כמו קובץ GPX או TCX.',
      tooLarge: 'הקובץ גדול מדי.',
      tooFewPoints: 'לקובץ הזה אין מספיק נקודות GPS כדי להיחשב לריצה מתועדת אמיתית.',
      implausibleSpeed: 'הקובץ מכיל קטע במהירות בלתי אפשרית — כנראה תקלת GPS, או שזו לא ריצה אמיתית.',
      invalidDuration: 'חותמות הזמן בקובץ הזה לא הגיוניות.',
      tooSparse: 'נקודות ה-GPS בקובץ הזה מפוזרות מדי כדי להיות הקלטה אמיתית.',
      outsideRaceWindow: 'זמן ההתחלה של הריצה הזו נמצא מחוץ לחלון המירוץ.',
      distanceMismatch: 'המרחק של הריצה הזו לא תואם מספיק את מרחק המירוץ.',
    } as Record<string, string>,
  },
  en: {
    loadError: "Couldn't load the race.",
    retry: 'Try again',
    startsAt: (window: string) => `Starts at ${window}`,
    distance: 'Distance',
    timeWindow: 'Time Window',
    price: 'Price',
    free: 'Free',
    windowHint:
      "You can start anytime within this window, on your own clock — results stay hidden until the window closes, so everyone gets a fair shot.",
    participants: (count: number) => `${count} runners registered`,
    about: 'About the race',
    registered: "You're registered for this race",
    howItWorks: 'How results are recorded',
    howItWorksBody:
      "Just run — no phone needed. If your watch syncs with Strava, we'll detect the run automatically once it lands there during the race window, and record your official time. No Strava? You can export the GPX or TCX file from your watch's app and upload it below instead.",
    uploading: 'Uploading…',
    uploadPrompt: "No Strava? You can upload a GPX / TCX file instead",
    joinRace: 'Join Race',
    resultRecorded: 'Result recorded!',
    resultSummary: (km: string, time: string) => `${km} km in ${time}`,
    uploadFailed: 'Upload failed',
    uploadFailedFallback: "We couldn't process the file. Try again.",
    uploadErrors: {
      notRegistered: "You're not registered for this race.",
      alreadyRecorded: 'A result has already been recorded for this race.',
      invalid: "This doesn't look like a GPX or TCX file.",
      tooLarge: 'The file is too large.',
      tooFewPoints: "This file doesn't have enough GPS points to count as a real recorded run.",
      implausibleSpeed:
        'The file contains a segment at an impossible speed — likely a GPS glitch, or not a real run.',
      invalidDuration: "The timestamps in this file don't make sense.",
      tooSparse: 'The GPS points in this file are too sparse to be a real recording.',
      outsideRaceWindow: "This run's start time falls outside the race window.",
      distanceMismatch: "This run's distance doesn't match the race distance closely enough.",
    } as Record<string, string>,
  },
};

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Every race is a start window: runners may start anytime in
// [startsAt, windowEndsAt), each on their own clock — shown as a range so
// people understand they don't all need to start at the same instant.
function formatWindow(startsAt: string, windowEndsAt: string | null): string {
  return windowEndsAt ? `${formatTime(startsAt)} – ${formatTime(windowEndsAt)}` : formatTime(startsAt);
}

export default function RaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const [race, setRace] = useState<RaceDetail | null>(null);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchRace(id)
      .then((data) => {
        setError(false);
        setRace(data);
      })
      .catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUploadTrack() {
    if (!race) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'application/vnd.garmin.tcx+xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadRaceResult(race.id, asset.uri, asset.name);
      Alert.alert(
        'התוצאה נקלטה!',
        `${uploaded.distanceKm.toFixed(2)} ק"מ ב-${Math.floor(uploaded.finishTimeS / 60)}:${String(
          uploaded.finishTimeS % 60
        ).padStart(2, '0')}`
      );
    } catch (err) {
      const key = err instanceof ApiError ? err.message : '';
      Alert.alert('ההעלאה נכשלה', UPLOAD_ERROR_MESSAGES[key] ?? 'לא הצלחנו לעבד את הקובץ. נסה שוב.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader showBack />

      {error ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            לא ניתן לטעון את המירוץ.
          </Text>
          <Pressable onPress={load}>
            <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
          </Pressable>
        </View>
      ) : !race ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.imageWrap}>
            <Image source={{ uri: race.imageUrl }} style={styles.image} />
            <View style={styles.imageOverlay} />
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                {priceLabel(race.priceUsd)}
              </Text>
            </View>
          </View>

          <View style={styles.titleRow}>
            <Text style={[Typography.headlineLg, styles.title, { color: colors.text }]}>
              {race.title.he}
            </Text>
            <MaterialIcons
              name={race.isRegistered ? 'verified' : 'schedule'}
              size={22}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(race.startsAt)}</Text>
          <View style={styles.windowRow}>
            <MaterialIcons name="schedule" size={14} color={colors.primary} />
            <Text style={[styles.windowText, { color: colors.primary }]}>
              מתחיל ב-{formatWindow(race.startsAt, race.windowEndsAt)}
            </Text>
          </View>

          <StarkCard style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>מרחק</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{race.distanceKm} ק"מ</Text>
            </View>
            <View style={[styles.stat, styles.statDivider, { borderColor: colors.border }]}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>חלון זמן</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatWindow(race.startsAt, race.windowEndsAt)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>מחיר</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{priceLabel(race.priceUsd)}</Text>
            </View>
          </StarkCard>

          {race.windowEndsAt && (
            <Text style={[styles.windowHint, { color: colors.textSecondary }]}>
              אפשר להתחיל בכל רגע בתוך החלון הזה, לפי השעון האישי שלך — התוצאות נשארות מוסתרות עד
              שהחלון נסגר, כדי שלכולם יהיה סיכוי הוגן.
            </Text>
          )}

          {race.participantsCount != null && (
            <Text style={[styles.participants, { color: colors.textSecondary }]}>
              {race.participantsCount} רצים רשומים
            </Text>
          )}

          {race.description && (
            <StarkCard style={styles.descriptionCard}>
              <Text style={[Typography.label, { color: colors.primary }]}>על המירוץ</Text>
              <Text style={[styles.descriptionBody, { color: colors.textSecondary }]}>
                {race.description}
              </Text>
            </StarkCard>
          )}

          {race.isRegistered ? (
            <>
              <StarkCard emphasized style={styles.registeredBadge}>
                <MaterialIcons name="verified" size={18} color={colors.text} />
                <Text style={[Typography.label, { color: colors.text }]}>
                  נרשמת למירוץ הזה
                </Text>
              </StarkCard>

              <StarkCard style={styles.howItWorksCard}>
                <View style={styles.howItWorksHeader}>
                  <MaterialIcons name="watch" size={18} color={colors.primary} />
                  <Text style={[Typography.label, { color: colors.primary }]}>איך התוצאות נרשמות</Text>
                </View>
                <Text style={[styles.howItWorksBody, { color: colors.textSecondary }]}>
                  פשוט לרוץ — בלי צורך בטלפון. אם השעון שלך מסתנכרן עם סטראבה, אנחנו נזהה את הריצה
                  אוטומטית ברגע שהיא עולה לשם במהלך חלון המירוץ, ונקליט את הזמן הרשמי שלך. אין
                  סטראבה? אפשר לייצא את קובץ ה-GPX או ה-TCX מהאפליקציה של השעון ולהעלות אותו למטה
                  במקום.
                </Text>
                <Pressable
                  onPress={handleUploadTrack}
                  disabled={uploading}
                  style={[styles.uploadRow, { borderTopColor: colors.border }]}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <MaterialIcons name="upload" size={16} color={colors.primary} />
                  )}
                  <Text style={[Typography.label, { color: colors.primary }]}>
                    {uploading ? 'מעלה…' : 'אין סטראבה? אפשר להעלות קובץ GPX / TCX במקום'}
                  </Text>
                </Pressable>
              </StarkCard>
            </>
          ) : (
            <Button
              label="הרשמה למירוץ"
              icon="arrow-forward"
              style={styles.joinButton}
              onPress={() =>
                router.push({ pathname: '/races/[id]/register', params: { id: race.id } })
              }
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  imageWrap: { height: 220, position: 'relative' },
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  title: { flex: 1 },
  date: { fontFamily: Fonts.regular, fontSize: 14, marginTop: 4 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  windowText: { fontFamily: Fonts.semiBold, fontSize: 13 },
  windowHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: Spacing.two,
  },
  statsRow: { flexDirection: 'row', marginTop: Spacing.four },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.three },
  statDivider: { borderLeftWidth: 1, borderRightWidth: 1 },
  statValue: { fontFamily: Fonts.bold, fontSize: 15 },
  participants: { fontFamily: Fonts.regular, fontSize: 13, marginTop: Spacing.two, textAlign: 'center' },
  registeredBadge: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  joinButton: { marginTop: Spacing.four },
  descriptionCard: { marginTop: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  descriptionBody: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19 },
  howItWorksCard: { marginTop: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  howItWorksHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  howItWorksBody: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19 },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
});
