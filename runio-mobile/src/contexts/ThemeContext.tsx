// The real, live-reactive theme system — replaces the "mutate a shared
// Colors object + reload the whole JS bundle" approach that used to live in
// theme.ts/themePreference.ts. That approach turned out to be fundamentally
// broken: Expo Router eagerly imports every route file to build its route
// table (so every screen's `StyleSheet.create({...})` — which only ever
// runs once, whenever its module is first evaluated — fires during that
// eager import pass, before an async SecureStore read can possibly resolve
// and update Colors). The result was a race every time: cold boot always
// baked in dark defaults regardless of the stored preference, and even
// `Updates.reloadAsync()` didn't fix already-loaded screens because the
// fresh reload re-runs that same eager import race from scratch.
//
// The actual fix: colors must be read at RENDER time (a hook, re-evaluated
// on every render) rather than baked into a module-scope object once.
// Screens are being migrated to this — `useThemeColors()` — one at a time,
// starting with always-visible chrome (the tab bar).
//
// On top of that, per the RACEON Theme System spec, toggling is animated
// (300ms color cross-fade) rather than a hard cut. That needs a Reanimated
// shared value (`progress`, 0 = dark / 1 = light) that components can read
// inside a worklet via `useInterpolatedColor()` — plain React state re-renders
// can't drive a smooth per-frame color interpolation the way a shared value
// can.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  Easing,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DarkColors, LightColors, type ThemeMode } from '@/constants/theme';

const STORAGE_KEY = 'raceon-theme-mode';
const TRANSITION_MS = 300;
const TRANSITION_EASING = Easing.bezier(0.4, 0.0, 0.2, 1);

type ThemeColors = Record<keyof typeof DarkColors, string>;
export type ThemeColorKey = keyof typeof DarkColors;

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  progress: SharedValue<number>;
};

const noopProgress = { value: 0 } as SharedValue<number>;

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: DarkColors,
  setMode: () => {},
  progress: noopProgress,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const progress = useSharedValue(0); // 0 = dark, 1 = light
  const hasLoadedPref = useRef(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') {
          setModeState(stored);
          // Cold-boot restore snaps instantly — no 300ms flash from the
          // dark default to whatever the user actually saved.
          progress.set(stored === 'light' ? 1 : 0);
        }
        hasLoadedPref.current = true;
      })
      .catch(() => {
        hasLoadedPref.current = true;
      });
  }, [progress]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    progress.set(withTiming(next === 'light' ? 1 : 0, {
      duration: TRANSITION_MS,
      easing: TRANSITION_EASING,
    }));
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }

  const colors = mode === 'light' ? LightColors : DarkColors;

  return (
    <ThemeContext.Provider value={{ mode, colors, setMode, progress }}>{children}</ThemeContext.Provider>
  );
}

/** Live, per-render colors — safe to use anywhere StyleSheet.create's frozen `Colors` isn't. */
export function useThemeColors() {
  return useContext(ThemeContext).colors;
}

export function useThemeMode() {
  const { mode, setMode } = useContext(ThemeContext);
  return { mode, setMode };
}

/** Raw 0(dark)/1(light) shared value, for building custom useAnimatedStyle blocks. */
export function useThemeProgress() {
  return useContext(ThemeContext).progress;
}

/**
 * A single token, interpolated live as the theme transitions. Read `.value`
 * inside a `useAnimatedStyle` worklet — this itself is NOT a style, just a
 * derived color you assign to whichever style property needs it:
 *
 *   const bg = useInterpolatedColor('surface');
 *   const style = useAnimatedStyle(() => ({ backgroundColor: bg.value }));
 */
export function useInterpolatedColor(key: ThemeColorKey) {
  const { progress } = useContext(ThemeContext);
  const dark = DarkColors[key];
  const light = LightColors[key];
  return useDerivedValue(() => interpolateColor(progress.value, [0, 1], [dark, light]));
}
