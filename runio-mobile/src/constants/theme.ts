/**
 * RACEON theme — calm single-accent green palette (Heebo body/headline/
 * labels — chosen specifically because it's a real Hebrew+Latin family,
 * unlike the Plus Jakarta Sans it replaced, which had no Hebrew glyphs at
 * all and silently fell back to a random system font for every Hebrew
 * string in the app; Space Grotesk mono is kept, but only for pure numeric
 * telemetry readouts, since digits don't need Hebrew glyphs either way),
 * with a light counterpart. The accent was toned down from an earlier
 * bright neon (#00ff87) to a calmer, less glaring green (#2FB37A) after
 * design review — no gradient, no glow, one flat color used sparingly,
 * matching the restraint real running apps like Strava actually use.
 * Tokens are kept in sync by hand with the web design mockups covering
 * every screen in the app.
 *
 * `Colors` below is the DARK palette, kept as a plain static export for the
 * many screens that still do `import { Colors } from '@/constants/theme'`
 * and reference `Colors.xxx` inside a module-scope `StyleSheet.create` —
 * those are frozen at whatever `Colors` holds when their module first
 * evaluates, and Expo Router eagerly imports every route file up front, so
 * there's no reliable way to swap that object's values after the fact (an
 * earlier version of this file tried exactly that, mutating Colors in place
 * plus an `expo-updates` reload — it didn't work, because the reload just
 * re-runs the same eager-import race from scratch). Real theme switching
 * lives in `src/contexts/ThemeContext.tsx`'s `useThemeColors()` hook
 * instead, which re-reads the live DarkColors/LightColors export on every
 * render — screens are being migrated to it one at a time, starting with
 * always-visible chrome (the tab bar).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const DarkColors = {
  background: '#111415',
  surface: '#111415',
  surfaceElevated: '#191c1d',
  surfaceSelected: '#272a2b',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: '#2FB37A',
  text: '#e1e3e4',
  textSecondary: '#94a3a0',
  primary: '#2FB37A',
  primaryContainer: '#2FB37A',
  onPrimary: '#04150d',
  onPrimaryContainer: '#007138',
  secondary: '#46fa9d',
  tertiary: '#ffb3b6',
  tertiaryContainer: '#ffcdce',
  onTertiaryContainer: '#920027',
  error: '#ffb4ab',
  warning: '#fbbf24',
  success: '#2FB37A',
  bronze: '#CD7F32',
  gold: '#FFD700',
  silver: '#C0C0C0',
  strava: '#FC6100',
  glassBg: 'rgba(255, 255, 255, 0.03)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',

  // --- MD3-style granular tokens (RACEON Theme System spec) ---
  // These are additive, not a rename: `primary`/`text`/`textSecondary`/etc.
  // above stay as-is since dozens of screens already read them for the main
  // CTA green / body text roles. The tokens below fill in the finer-grained
  // surface elevation ladder, outline tones, and glow/border behavior the
  // spec calls for — new screens (and glow/shadow theming) should prefer
  // these where the spec names them explicitly.
  surfaceContainerLowest: '#0c0f10',
  surfaceContainerLow: '#191c1d',
  surfaceContainer: '#1d2021',
  surfaceContainerHigh: '#272a2b',
  surfaceContainerHighest: '#323536',
  surfaceBright: '#373a3b',
  onSurface: '#e1e3e4',
  onSurfaceVariant: '#b9cbb9',
  outline: '#849585',
  outlineVariant: '#3b4b3d',
  surfaceTint: '#00e478',
  secondaryContainer: '#04dd84',
  errorContainer: '#93000a',
  heroGradientA: '#1a1042',
  heroGradientB: '#191c1d',
  // Not colors — snap instantly on theme toggle, never interpolated.
  glowOpacity: '28',
  cardBorderColor: 'transparent',
} as const;

// Same roles as DarkColors above. Values from the RACEON design system
// mockup that defines DARK and LIGHT as two token sets sharing the exact
// same role names this file uses (surfaceContainerLow → surfaceElevated,
// onSurfaceVariant → textSecondary, primaryContainer → primary, etc.) — its
// dark values matched DarkColors above hex-for-hex, so its light values are
// taken as the authoritative mapping here too, not re-derived by hand.
export const LightColors: Record<keyof typeof DarkColors, string> = {
  background: '#f5f7f6',
  surface: '#f5f7f6',
  surfaceElevated: '#eef1ef',
  surfaceSelected: '#dce1de',
  border: '#dce1de',
  borderStrong: '#049966',
  text: '#171d19',
  textSecondary: '#3f4942',
  primary: '#049966',
  primaryContainer: '#049966',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#c4ffd2',
  secondary: '#006d36',
  tertiary: '#be123c',
  tertiaryContainer: '#ffe4e6',
  onTertiaryContainer: '#881337',
  error: '#ba1a1a',
  warning: '#d97706',
  success: '#049966',
  bronze: '#8B4513',
  gold: '#B8860B',
  silver: '#808080',
  strava: '#FC6100',
  glassBg: 'rgba(255, 255, 255, 0.6)',
  glassBorder: 'rgba(15, 23, 42, 0.08)',

  // --- MD3-style granular tokens — see the matching comment on DarkColors. ---
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eef1ef',
  surfaceContainer: '#e6eae8',
  surfaceContainerHigh: '#dce1de',
  surfaceContainerHighest: '#cfd5d1',
  surfaceBright: '#f5f7f6',
  onSurface: '#171d19',
  onSurfaceVariant: '#3f4942',
  outline: '#6f7972',
  outlineVariant: '#bec9c0',
  surfaceTint: '#006d36',
  secondaryContainer: '#98f7c0',
  errorContainer: '#ffdad6',
  heroGradientA: '#e0f5e8',
  heroGradientB: '#eef1ef',
  glowOpacity: '15',
  cardBorderColor: '#dce1de',
};

export type ThemeMode = 'dark' | 'light';

// Static — see the file-level comment above for why this can't just be
// mutated to switch themes. Screens not yet migrated to useThemeColors()
// keep reading this and will show dark regardless of the user's Settings
// choice until they're converted.
export const Colors = DarkColors;

export type ThemeColor = keyof typeof Colors;

export const Fonts = {
  regular: 'Heebo_400Regular',
  medium: 'Heebo_500Medium',
  semiBold: 'Heebo_600SemiBold',
  bold: 'Heebo_700Bold',
  extraBold: 'Heebo_800ExtraBold',
  headline: 'Heebo_700Bold',
  black: 'Heebo_800ExtraBold',
  headlineBlack: 'Heebo_800ExtraBold',
  headlineItalic: 'Heebo_700Bold',
  // Mono is reserved for PURE NUMERIC telemetry readouts only (pace, splits,
  // stat-card big numbers) — digits don't need Hebrew glyphs, so this is
  // the one place Space Grotesk's distinct "technical readout" character is
  // still safe to use. It must never wrap Hebrew words (see `labelBold`
  // below) — Space Grotesk has no Hebrew glyphs and silently falls back to
  // a random system font for them.
  mono: 'SpaceGrotesk_600SemiBold',
  // Small uppercase captions/eyebrows/tab labels — these are short Hebrew
  // (or mixed) words, not numbers, so they use Heebo at a heavy weight +
  // letter-spacing to keep the same "technical caption" feel `mono` used to
  // give them, without falling back for the Hebrew text they actually hold.
  labelBold: 'Heebo_800ExtraBold',
} as const;

export const Typography = {
  eyebrow: {
    fontFamily: Fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headlineLg: {
    fontFamily: Fonts.headlineBlack,
    fontSize: 32,
    letterSpacing: -0.5,
  },
  headlineMd: {
    fontFamily: Fonts.headline,
    fontSize: 20,
  },
  label: {
    fontFamily: Fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  // Large tabular numerals for stat cards / telemetry readouts — pure
  // digits, so Space Grotesk (no Hebrew glyphs) is correct here.
  statValue: {
    fontFamily: Fonts.mono,
    fontSize: 32,
    letterSpacing: -0.3,
  },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  // Rounder than the previous theme — every mockup card uses rounded-2xl
  // (16px); `full` stays a true circle/pill radius.
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

// Height reserved for the custom TabBar (see src/components/ui/TabBar.tsx) so
// scrollable tab-root screens can pad their content and avoid it being
// hidden behind the bar + safe-area inset.
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 64;
export const MaxContentWidth = 800;
