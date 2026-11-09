import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useThemeColors } from '@/contexts/ThemeContext';
import { getToken } from '@/lib/api';

/**
 * Not a real screen — decides, on launch, whether a stored token exists and
 * sends the user straight to /lobby, or to /sign-in if not. Kept separate
 * from _layout so the check only runs once per cold start, not per navigation.
 */
export default function SplashRedirect() {
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // getToken() never throws, but guard anyway: if this check fails the
      // app would sit on the spinner forever with no way in.
      const token = await getToken().catch(() => null);
      if (cancelled) return;
      router.replace(token ? '/lobby' : '/sign-in');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
