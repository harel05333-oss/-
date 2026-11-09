import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Radius } from '@/constants/theme';

// Looping "ping" ring behind the pause/record button — matches the
// design's animate-ping. Purely decorative, so it just fades/grows and
// resets; not tied to any real timer. Expects to be placed inside a parent
// exactly `size x size`, which it fills via absoluteFillObject rather than
// its own explicit width/height (mixing both confuses Yoga's layout).
export function PulseRing({ color }: { color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 + progress.value * 0.5 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, backgroundColor: color }, style]}
    />
  );
}
