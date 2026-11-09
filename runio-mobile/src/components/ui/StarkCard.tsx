import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { Radius } from '@/constants/theme';
import { useThemeColors, useThemeMode } from '@/contexts/ThemeContext';

type StarkCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 2px cyan border (champion card, "your rank" row, "registered" badge) vs. default 1px glass border. */
  emphasized?: boolean;
  surface?: 'surface' | 'surfaceElevated' | 'surfaceSelected';
};

// Elite Velocity's signature "glass panel": a blurred, barely-tinted overlay
// on the background, not a solid fill — surface/surfaceElevated/
// surfaceSelected step up the tint opacity instead of switching solid colors.
// The tint itself was hardcoded white-on-dark, which looked broken once the
// background actually went light (a near-invisible white wash over an
// already-light backdrop, blurred with the wrong "dark" tint) — it now
// flips to a dark tint on a light wash for light mode.
const SURFACE_OPACITY: Record<NonNullable<StarkCardProps['surface']>, number> = {
  surface: 0.02,
  surfaceElevated: 0.05,
  surfaceSelected: 0.08,
};
const LIGHT_SURFACE_OPACITY: Record<NonNullable<StarkCardProps['surface']>, number> = {
  surface: 0.03,
  surfaceElevated: 0.06,
  surfaceSelected: 0.1,
};

export function StarkCard({
  children,
  style,
  emphasized = false,
  surface = 'surfaceElevated',
}: StarkCardProps) {
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <BlurView
      intensity={30}
      tint={isDark ? 'dark' : 'light'}
      style={[
        {
          backgroundColor: isDark
            ? `rgba(255,255,255,${SURFACE_OPACITY[surface]})`
            : `rgba(0,0,0,${LIGHT_SURFACE_OPACITY[surface]})`,
          borderRadius: Radius.md,
          borderWidth: emphasized ? 2 : 1,
          borderColor: emphasized ? colors.borderStrong : colors.glassBorder,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}
