import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

type ScreenHeaderProps = {
  title?: string;
  eyebrow?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  right?: ReactNode;
};

export function ScreenHeader({ title, eyebrow, showBack, onBackPress, right }: ScreenHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      {showBack ? (
        <Pressable
          onPress={onBackPress ?? (() => router.back())}
          hitSlop={12}
          style={styles.iconSlot}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.iconSlot} />
      )}

      <View style={styles.titleWrap}>
        {eyebrow ? <Text style={[Typography.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text> : null}
        {title ? (
          <Text accessibilityRole="header" style={[Typography.headlineMd, { color: colors.text }]}>
            {title}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  iconSlot: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  // The right slot may hold more than one icon (e.g. Lobby's notifications
  // + search + profile row) — no fixed width, so it grows with content,
  // while the left (back button) slot stays fixed at 32 for title centering.
  rightSlot: { minWidth: 32, height: 32, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  titleWrap: { flex: 1, gap: 2 },
});
