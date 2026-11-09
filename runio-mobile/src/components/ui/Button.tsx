import { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Fonts, Radius } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'neutral';
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const isPrimary = variant === 'primary';
  const isDisabled = Boolean(disabled || loading);
  const contentColor = isPrimary ? colors.onPrimary : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        isPrimary
          ? { backgroundColor: colors.primary }
          : variant === 'neutral'
            ? { backgroundColor: colors.surfaceContainerHigh }
            : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <>
          <Text style={[styles.label, { color: contentColor }]}>{label}</Text>
          {icon && <MaterialIcons name={icon} size={18} color={contentColor} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  disabled: { opacity: 0.5 },
  label: {
    fontFamily: Fonts.bold,
    fontSize: 15,
  },
});
