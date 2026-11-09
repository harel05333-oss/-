import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Radius } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

type AvatarProps = {
  uri: string | null | undefined;
  size: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wraps <Image> with a fallback icon shown whenever the image fails to load
 * (missing/unset avatarUrl, a dead URL, or a network hiccup) instead of the
 * blank/black circle a bare <Image> leaves behind on failure.
 */
export function Avatar({ uri, size, style }: AvatarProps) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);
  const showFallback = !uri || failed;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: Radius.full, backgroundColor: colors.surfaceSelected },
        style,
      ]}
    >
      {showFallback ? (
        <MaterialIcons name="person" size={size * 0.6} color={colors.textSecondary} />
      ) : (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: Radius.full }}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
