import { Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { interpolateColor, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { DarkColors, LightColors } from '@/constants/theme';
import { useThemeMode, useThemeProgress } from '@/contexts/ThemeContext';
import { useT } from '@/contexts/LocaleContext';

const strings = { he: { darkMode: 'מצב כהה' }, en: { darkMode: 'Dark mode' } };

const TRACK_WIDTH = 40;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 18;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2; // 16

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const isDark = mode === 'dark';
  const progress = useThemeProgress();
  const t = useT(strings);

  // Track endpoints per the spec's toggle states — deliberately NOT the same
  // token in both themes (dark: surfaceContainerHighest, light:
  // primaryContainer), so this crossfades directly off `progress` rather
  // than switching source token on the React state change.
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [DarkColors.surfaceContainerHighest, LightColors.primaryContainer]
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(isDark ? 0 : THUMB_TRAVEL, { duration: 250 }) }],
    backgroundColor: interpolateColor(progress.value, [0, 1], [DarkColors.onSurface, '#ffffff']),
  }));

  return (
    <Pressable
      onPress={() => setMode(isDark ? 'light' : 'dark')}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityLabel={t.darkMode}
      accessibilityState={{ checked: isDark }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            justifyContent: 'center',
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              position: 'absolute',
              left: THUMB_INSET,
              alignItems: 'center',
              justifyContent: 'center',
            },
            thumbStyle,
          ]}
        >
          <MaterialIcons
            name={isDark ? 'dark-mode' : 'light-mode'}
            size={12}
            color={isDark ? DarkColors.surface : LightColors.primaryContainer}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
