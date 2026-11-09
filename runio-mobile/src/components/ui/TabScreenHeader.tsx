import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

type TabScreenHeaderProps = {
  avatarUrl?: string | null;
  unreadCount?: number;
};

// Shared top bar for the four tab-root screens (Lobby/Races/Rankings/
// Profile) — distinct from ScreenHeader, which is for sub-screens reached
// by pushing (Settings, Notifications, ...): back button + title, no brand.
// The avatar+brand side is purely decorative (not a button) since the
// Profile tab itself is how users reach their profile — no need for a
// second, redundant way to get there from every other tab.
export function TabScreenHeader({ avatarUrl, unreadCount = 0 }: TabScreenHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <View style={[styles.row, { borderBottomColor: colors.glassBorder }]}>
      <View style={styles.brand} importantForAccessibility="no-hide-descendants">
        <View style={[styles.avatarWrap, { borderColor: `${colors.primary}4D` }]}>
          <Avatar uri={avatarUrl} size={28} />
        </View>
        <BrandLogo size={28} />
        <Text style={[styles.brandText, { color: colors.primary }]}>RACEON</Text>
      </View>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={10}
        style={styles.bellWrap}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <MaterialIcons name="notifications" size={22} color={colors.primary} />
        {unreadCount > 0 && <View style={[styles.dot, { backgroundColor: colors.error }]} />}
      </Pressable>
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
  avatarWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 1,
  },
  brandText: {
    fontFamily: Fonts.headlineBlack,
    fontSize: 18,
    letterSpacing: -0.5,
  },
  bellWrap: { position: 'relative', padding: 4 },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
});
