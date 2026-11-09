import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Fonts, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { useT } from '@/contexts/LocaleContext';
import { buildStravaConnectUrl, getToken } from '@/lib/api';

const CALLBACK_PATH = '/mobile-strava-callback';

const strings = {
  he: {
    close: 'סגור',
    title: 'התחברות לסטראבה',
    importTitle: 'לייבא ריצות אחרונות?',
    importMessage:
      'סטראבה חובר בהצלחה! רוצה למשוך עכשיו את הריצות האחרונות שלך (כולל דופק וקצב צעדים, אם השעון שלך מדד אותם)?',
    notNow: 'לא עכשיו',
    importRuns: 'ייבוא ריצות',
  },
  en: {
    close: 'Close',
    title: 'Connect to Strava',
    importTitle: 'Import recent runs?',
    importMessage:
      "Strava is connected! Want to pull in your recent runs now (including heart rate and cadence, if your watch recorded them)?",
    notNow: 'Not Now',
    importRuns: 'Import Runs',
  },
};

export default function ConnectStravaScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const t = useT(strings);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  useEffect(() => {
    getToken().then((token) => {
      if (token) setConnectUrl(buildStravaConnectUrl(token));
    });
  }, []);

  function handleCallback(url: string) {
    if (!url.includes(CALLBACK_PATH)) return false;
    // The account is linked at this point regardless — this is only about
    // whether to pull in past activity right now. Ask explicitly rather
    // than silently importing everything the moment the account connects.
    Alert.alert(t.importTitle, t.importMessage, [
      { text: t.notNow, style: 'cancel', onPress: () => router.replace('/settings') },
      { text: t.importRuns, onPress: () => router.replace('/strava-history') },
    ]);
    return true;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={[styles.header, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel={t.close}
        >
          <MaterialIcons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t.title}</Text>
        <View style={styles.closeButton} />
      </SafeAreaView>

      {!connectUrl ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <WebView
          source={{ uri: connectUrl }}
          style={styles.webview}
          onShouldStartLoadWithRequest={(request) => !handleCallback(request.url)}
          onNavigationStateChange={(nav: WebViewNavigation) => handleCallback(nav.url)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bold, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  webview: { flex: 1 },
});
