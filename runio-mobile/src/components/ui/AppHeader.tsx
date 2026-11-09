import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, useThemeMode } from '@/contexts/ThemeContext';

type AppHeaderProps = {
  avatarUrl?: string;
  unreadCount?: number;
};

// The persistent brand bar from the RACEON Theme System spec: logo +
// wordmark on the left, notification bell / theme toggle / avatar on the
// right — replacing the old "Welcome back / {name}" ScreenHeader on Lobby
// (that greeting text moved into the scrollable body, next to the ELO
// badge, matching the spec's HomeScreen layout).
export function AppHeader({ avatarUrl, unreadCount = 0 }: AppHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isDark ? `${colors.surface}dd` : `${colors.surface}ee`,
          borderBottomColor: isDark ? `${colors.surfaceContainerHighest}30` : `${colors.outlineVariant}60`,
        },
      ]}
    >
      <View style={styles.brand} importantForAccessibility="no-hide-descendants">
        <BrandLogo size={28} />
        <Text style={[styles.wordmark, { color: colors.onSurface }]}>RACEON</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={12}
          style={styles.bellSlot}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <MaterialIcons name="notifications" size={20} color={colors.onSurfaceVariant} />
          {unreadCount > 0 && <View style={[styles.badge, { backgroundColor: colors.error }]} />}
        </Pressable>
        <ThemeToggle />
        <Pressable
          onPress={() => router.push('/profile')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <View
            style={[
              styles.avatarRing,
              { backgroundColor: isDark ? colors.primary : colors.primaryContainer },
            ]}
          >
            <Avatar uri={avatarUrl} size={32} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  wordmark: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bellSlot: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  avatarRing: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
});
