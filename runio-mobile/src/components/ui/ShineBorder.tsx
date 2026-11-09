import { ReactNode, useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

type GradientColors = readonly [string, string, ...string[]];

type ShineBorderProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderWidth?: number;
  /** Seconds per full rotation. */
  duration?: number;
  colors?: GradientColors;
  /** Corner radius of both the glow ring and the content mask. Defaults to Radius.lg. */
  radius?: number;
  /** Background color of the content mask sitting on top of the glow. Defaults to the live theme's surface. */
  contentColor?: string;
};

export function ShineBorder({
  children,
  style,
  borderWidth = 2,
  duration = 4,
  colors,
  radius = Radius.lg,
  contentColor,
}: ShineBorderProps) {
  const themeColors = useThemeColors();
  const gradientColors: GradientColors = colors ?? [
    themeColors.primary,
    themeColors.tertiaryContainer,
    themeColors.primaryContainer,
    themeColors.primary,
  ];
  const resolvedContentColor = contentColor ?? themeColors.surface;
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: duration * 1000, easing: Easing.linear }),
      -1
    );
  }, [duration, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.wrapper, { borderRadius: radius }, style]}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        <Animated.View style={[styles.spin, spinStyle]}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <View
        style={[
          styles.content,
          { margin: borderWidth, borderRadius: Math.max(radius - borderWidth, 0), backgroundColor: resolvedContentColor },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  spin: {
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
  },
  content: {
    overflow: 'hidden',
  },
});
