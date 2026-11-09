import { ComponentProps, forwardRef } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

// Built exactly to the "raceon-leaderboard.jsx" reference's bottom nav: each
// button is flex:1 (equal share of the bar), a small icon-only pill (40x32)
// that tints when active, a label below it, and a thin glowing indicator
// bar pinned to the TOP of the active button (not wrapping the icon).
// In-flow (not position:absolute for the whole bar), the one layout
// approach that's reliably rendered on every device this session.
//
// Root cause of icon+label rendering SIDE BY SIDE instead of stacked: expo-
// router/ui's TabTrigger (asChild) clones its own base style onto this
// component — `{ flexDirection: 'row', justifyContent: 'space-between' }` —
// which landed in the `style` prop below and overrode column layout, since
// it was being merged in last. Fixed by putting `styles.item` (with an
// explicit `flexDirection: 'column'`) LAST in the merge instead.
type TabBarButtonProps = Omit<PressableProps, 'style'> & {
  isFocused?: boolean;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  style?: StyleProp<ViewStyle>;
};

export const TabBarButton = forwardRef<View, TabBarButtonProps>(
  ({ isFocused, icon, label, style, ...pressableProps }, ref) => {
    const colors = useThemeColors();
    const contentColor = isFocused ? colors.primaryContainer : colors.outline;

    return (
      <Pressable
        ref={ref}
        style={[style, styles.item]}
        accessibilityRole="tab"
        accessibilityState={{ selected: !!isFocused }}
        accessibilityLabel={label}
        {...pressableProps}
      >
        {isFocused && (
          <View
            style={[
              styles.activeIndicator,
              { backgroundColor: colors.primaryContainer, shadowColor: colors.primaryContainer },
            ]}
          />
        )}
        {/* Icon is decorative — the label text + accessibilityLabel above
            already say everything a screen reader needs, so this shouldn't
            also announce the icon glyph's own (irrelevant) name. */}
        <View
          style={[styles.iconWrap, isFocused && { backgroundColor: `${colors.primaryContainer}26` }]}
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name={icon} size={22} color={contentColor} />
        </View>
        <Text style={[styles.label, { color: contentColor, fontFamily: isFocused ? Fonts.bold : Fonts.medium }]}>
          {label}
        </Text>
      </Pressable>
    );
  }
);
TabBarButton.displayName = 'TabBarButton';

// Layout only — no colors, so this is safe to keep as a module-scope
// StyleSheet. See useTabBarColorStyle() below for the color half, which the
// consumer (tabs)/_layout.tsx merges in at render time.
export const tabBarStyles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
});

/** The bar's theme-dependent colors, re-read live every render. */
export function useTabBarColorStyle() {
  const colors = useThemeColors();
  return {
    backgroundColor: colors.surfaceElevated,
    borderTopColor: colors.glassBorder,
  };
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  activeIndicator: {
    // Flat, no glow — an earlier version shadow-glowed this in the active
    // color, which read as "too bright/glaring" in design review.
    position: 'absolute',
    top: 0,
    width: 48,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
});
