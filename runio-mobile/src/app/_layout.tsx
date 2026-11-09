import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import {
  useFonts,
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_800ExtraBold,
} from '@expo-google-fonts/heebo';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';

import { ThemeProvider, useThemeColors, useThemeMode } from '@/contexts/ThemeContext';
import { LocaleProvider } from '@/contexts/LocaleContext';

SplashScreen.preventAutoHideAsync();

// EXPO_PUBLIC_* so it's baked into the client bundle — a Sentry DSN is
// meant to be public (it only identifies where to send events, like a
// project ID, not a secret). No-ops safely if unset, so this never blocks
// local dev before the DSN is configured.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}

function RootStack() {
  // Only the status bar + Stack's own default background read live theme
  // here — everything else (screen chrome, individual screens) is either
  // already migrated to useThemeColors() or still on the static `Colors`
  // export; see theme.ts's top comment for why those two groups exist.
  const { mode } = useThemeMode();
  const colors = useThemeColors();

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="races/[id]/index" />
        <Stack.Screen name="races/[id]/register" />
        <Stack.Screen name="races/[id]/payment" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="chat/[friendId]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="connect-strava" options={{ presentation: 'modal' }} />
        <Stack.Screen name="strava-history" />
        <Stack.Screen name="record-run" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </>
  );
}

// Catches render-time errors anywhere below it (like the tier.toUpperCase()
// crash on an older backend response) and shows a recoverable screen instead
// of the whole app going down with no trace — a non-technical user has no
// way to pull a crash log the way a developer can, so this is the
// difference between "app closed, no idea why" and "one bad screen, tap to
// retry" for them. Sentry still gets the underlying error either way.
function ErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#111415' }}>
      <Text style={{ color: '#e1e3e4', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        משהו השתבש
      </Text>
      <Text style={{ color: '#94a3a0', fontSize: 14, textAlign: 'center' }}>
        נתקלנו בבעיה בלתי צפויה. ניסיון נוסף בדרך כלל פותר את זה.
      </Text>
      <Pressable
        onPress={resetError}
        style={{ backgroundColor: '#2FB37A', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 8 }}
      >
        <Text style={{ color: '#04150d', fontWeight: '700' }}>נסה שוב</Text>
      </Pressable>
    </View>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Heebo_400Regular,
    Heebo_500Medium,
    Heebo_600SemiBold,
    Heebo_700Bold,
    Heebo_800ExtraBold,
    SpaceGrotesk_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback resetError={resetError} />}>
      <LocaleProvider>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </LocaleProvider>
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
