import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors, useThemeMode } from '@/contexts/ThemeContext';
import { useLocale, useT, type Locale } from '@/contexts/LocaleContext';
import {
  clearToken,
  disconnectStrava,
  fetchCurrentUser,
  fetchDevices,
  type ConnectedDevice,
  type CurrentUser,
} from '@/lib/api';

const APP_VERSION = '1.0.0';

const strings = {
  he: {
    title: 'הגדרות',
    account: 'חשבון',
    editProfile: 'עריכת פרופיל',
    notifications: 'התראות',
    signOut: 'התנתקות',
    connectedDevices: 'מכשירים מחוברים',
    disconnect: 'נתק',
    connect: 'חבר',
    rideHistory: 'היסטוריית ריצות',
    display: 'תצוגה',
    lightMode: 'מצב בהיר',
    language: 'שפה',
    hebrew: 'עברית',
    english: 'English',
    about: 'אודות',
    version: 'גרסה',
    privacyPolicy: 'מדיניות פרטיות',
    termsOfService: 'תנאי השימוש',
  },
  en: {
    title: 'Settings',
    account: 'Account',
    editProfile: 'Edit Profile',
    notifications: 'Notifications',
    signOut: 'Sign Out',
    connectedDevices: 'Connected Devices',
    disconnect: 'Disconnect',
    connect: 'Connect',
    rideHistory: 'Run History',
    display: 'Display',
    lightMode: 'Light Mode',
    language: 'Language',
    hebrew: 'עברית',
    english: 'English',
    about: 'About',
    version: 'Version',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
  },
};

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [strava, setStrava] = useState<ConnectedDevice | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const colors = useThemeColors();
  const { locale, setLocale } = useLocale();
  const t = useT(strings);

  useFocusEffect(
    useCallback(() => {
      fetchCurrentUser()
        .then(setUser)
        .catch(() => setUser(null));
      fetchDevices()
        .then((devices) => setStrava(devices.find((d) => d.provider === 'strava') ?? null))
        .catch(() => setStrava(null));
    }, [])
  );

  async function handleSignOut() {
    await clearToken();
    router.replace('/sign-in');
  }

  async function handleDisconnectStrava() {
    setDisconnecting(true);
    try {
      await disconnectStrava();
      setStrava((prev) => (prev ? { ...prev, connected: false } : prev));
    } finally {
      setDisconnecting(false);
    }
  }

  const stravaConnected = strava?.connected ?? false;

  function handleToggleTheme() {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title={t.title} />

      <ScrollView contentContainerStyle={styles.content}>
        {user && (
          <Pressable onPress={() => router.push('/edit-profile')}>
            <StarkCard style={styles.accountCard}>
              <Avatar uri={user.avatarUrl} size={48} />
              <View style={styles.accountBody}>
                <Text style={[Typography.label, { color: colors.text }]} numberOfLines={1}>
                  {user.name}
                </Text>
                <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
            </StarkCard>
          </Pressable>
        )}

        <View style={styles.section}>
          <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.account}</Text>
          <Pressable onPress={() => router.push('/edit-profile')}>
            <StarkCard style={styles.row}>
              <View style={styles.rowInner}>
                <MaterialIcons name="person-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{t.editProfile}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </View>
            </StarkCard>
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')}>
            <StarkCard style={styles.row}>
              <View style={styles.rowInner}>
                <MaterialIcons name="notifications-none" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{t.notifications}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </View>
            </StarkCard>
          </Pressable>
          <StarkCard style={styles.row}>
            <Pressable onPress={handleSignOut} style={styles.rowInner}>
              <MaterialIcons name="logout" size={20} color={colors.error} />
              <Text style={[styles.rowLabel, { color: colors.error }]}>{t.signOut}</Text>
            </Pressable>
          </StarkCard>
        </View>

        <View style={styles.section}>
          <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>
            {t.connectedDevices}
          </Text>
          <StarkCard style={styles.row}>
            <View style={styles.rowInner}>
              <MaterialIcons name="directions-run" size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>Strava</Text>
              {disconnecting ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : stravaConnected ? (
                <Pressable onPress={handleDisconnectStrava} hitSlop={8}>
                  <Text style={[styles.rowAction, { color: colors.error }]}>{t.disconnect}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => router.push('/connect-strava')} hitSlop={8}>
                  <Text style={[styles.rowAction, { color: colors.primary }]}>{t.connect}</Text>
                </Pressable>
              )}
            </View>
          </StarkCard>

          {stravaConnected && (
            <Pressable onPress={() => router.push('/strava-history')}>
              <StarkCard style={styles.row}>
                <View style={styles.rowInner}>
                  <MaterialIcons name="history" size={20} color={colors.textSecondary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{t.rideHistory}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
                </View>
              </StarkCard>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.display}</Text>
          <StarkCard style={styles.row}>
            <View style={styles.rowInner}>
              <MaterialIcons
                name={themeMode === 'light' ? 'light-mode' : 'dark-mode'}
                size={20}
                color={colors.textSecondary}
              />
              <Text style={[styles.rowLabel, { color: colors.text }]}>{t.lightMode}</Text>
              <Pressable
                onPress={handleToggleTheme}
                style={[
                  styles.themeSwitch,
                  { backgroundColor: themeMode === 'light' ? colors.primary : colors.surfaceSelected },
                ]}
                accessibilityRole="switch"
                accessibilityLabel={t.lightMode}
                accessibilityState={{ checked: themeMode === 'light' }}
              >
                <View
                  style={[
                    styles.themeSwitchKnob,
                    { backgroundColor: colors.surfaceElevated },
                    themeMode === 'light' && styles.themeSwitchKnobOn,
                  ]}
                />
              </Pressable>
            </View>
          </StarkCard>

          <StarkCard style={styles.row}>
            <View style={styles.rowInner}>
              <MaterialIcons name="language" size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>{t.language}</Text>
              <View style={[styles.langPillGroup, { backgroundColor: colors.surfaceSelected }]}>
                {(['he', 'en'] as Locale[]).map((option) => {
                  const active = locale === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setLocale(option)}
                      style={[styles.langPill, active && { backgroundColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.langPillText,
                          { color: active ? colors.onPrimary : colors.textSecondary },
                        ]}
                      >
                        {option === 'he' ? t.hebrew : t.english}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </StarkCard>
        </View>

        <View style={styles.section}>
          <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{t.about}</Text>
          <StarkCard style={styles.row}>
            <View style={styles.rowInner}>
              <MaterialIcons name="info-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>{t.version}</Text>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{APP_VERSION}</Text>
            </View>
          </StarkCard>
          <Pressable onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/${locale}/privacy`)}>
            <StarkCard style={styles.row}>
              <View style={styles.rowInner}>
                <MaterialIcons name="privacy-tip" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{t.privacyPolicy}</Text>
                <MaterialIcons name="open-in-new" size={16} color={colors.textSecondary} />
              </View>
            </StarkCard>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/${locale}/terms`)}>
            <StarkCard style={styles.row}>
              <View style={styles.rowInner}>
                <MaterialIcons name="description" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{t.termsOfService}</Text>
                <MaterialIcons name="open-in-new" size={16} color={colors.textSecondary} />
              </View>
            </StarkCard>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.five },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  accountBody: { flex: 1, gap: 2 },
  email: { fontFamily: Fonts.regular, fontSize: 13 },
  section: { gap: Spacing.two },
  row: { overflow: 'hidden' },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowLabel: { flex: 1, fontFamily: Fonts.medium, fontSize: 15 },
  rowValue: { fontFamily: Fonts.regular, fontSize: 14 },
  rowAction: { fontFamily: Fonts.bold, fontSize: 13 },
  themeSwitch: {
    width: 44,
    height: 26,
    borderRadius: Radius.full,
    padding: 3,
    justifyContent: 'center',
  },
  themeSwitchKnob: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
  },
  themeSwitchKnobOn: { alignSelf: 'flex-end' },
  langPillGroup: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 3,
    gap: 2,
  },
  langPill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  langPillText: { fontFamily: Fonts.semiBold, fontSize: 12 },
});
